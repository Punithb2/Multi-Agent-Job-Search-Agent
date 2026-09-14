"""Abuse protection for a public, free-tier API.

Every endpoint is reachable by anyone who finds the backend URL (CORS only limits
browsers), and each search or generation spends limited JSearch and Gemini quota.
This module provides three layers, all in memory (a single free Render instance
needs no Redis):

- Rate limits per client IP and per signed-in user, over short windows and a day.
- Global daily budgets for JSearch and Gemini requests, a backstop that holds even
  if someone rotates IP addresses.
- Supabase sign-in verification for the endpoints that generate documents.

Counters reset when the process restarts. That is acceptable here: the point is to
stop bursts and runaway use, not to be an exact billing ledger.
"""

import os
import threading
import time
from collections import defaultdict, deque
from datetime import datetime, timezone

import requests
from fastapi import HTTPException, Request


def _env_int(name: str, default: int) -> int:
    try:
        return int(os.getenv(name, default))
    except (TypeError, ValueError):
        return default


# --- Rate limits -------------------------------------------------------------

# (requests, window in seconds). Tuned for one person using the app normally.
RATE_LIMITS = {
    "search": [(5, 10 * 60), (_env_int("SEARCHES_PER_IP_PER_DAY", 20), 24 * 3600)],
    "generate": [(15, 10 * 60), (_env_int("GENERATIONS_PER_USER_PER_DAY", 60), 24 * 3600)],
    "extract": [(10, 10 * 60), (30, 24 * 3600)],
    "compare": [(30, 10 * 60)],
}


class RateLimiter:
    """Sliding-window counters keyed by (bucket, client)."""

    def __init__(self):
        self._hits = defaultdict(deque)
        self._lock = threading.Lock()

    def check(self, bucket: str, client: str) -> int:
        """Record a hit. Returns 0 if allowed, else seconds until the next allowed hit."""
        now = time.monotonic()
        with self._lock:
            limits = RATE_LIMITS[bucket]
            longest = max(window for _, window in limits)
            hits = self._hits[(bucket, client)]
            while hits and now - hits[0] > longest:
                hits.popleft()
            for limit, window in limits:
                recent = [stamp for stamp in hits if now - stamp <= window]
                if len(recent) >= limit:
                    return max(1, int(window - (now - recent[0])) + 1)
            hits.append(now)
            return 0

    def reset(self):
        with self._lock:
            self._hits.clear()


limiter = RateLimiter()


def client_ip(request: Request) -> str:
    """The caller's IP address behind Render's proxy.

    The left-most X-Forwarded-For entry is whatever the client chose to send, so it
    cannot be trusted. Cloudflare's header is set by the edge, and otherwise the
    right-most entry is the one added by the proxy in front of this app.
    """
    edge_ip = request.headers.get("cf-connecting-ip")
    if edge_ip:
        return edge_ip.strip()
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        return forwarded.split(",")[-1].strip()
    return request.client.host if request.client else "unknown"


def enforce_rate_limit(bucket: str, client: str) -> None:
    retry_after = limiter.check(bucket, client)
    if retry_after:
        minutes = max(1, round(retry_after / 60))
        raise HTTPException(
            status_code=429,
            detail=f"You're doing that a lot. Please wait about {minutes} minute{'s' if minutes != 1 else ''} and try again.",
            headers={"Retry-After": str(retry_after)},
        )


# --- Daily API budgets -------------------------------------------------------

class DailyBudgetExceeded(Exception):
    """A shared daily API budget has been used up."""

    def __init__(self, service: str):
        super().__init__(f"{service} daily budget exhausted")
        self.service = service


class DailyBudget:
    """Counts requests to a paid API per UTC day, across all users."""

    def __init__(self, service: str, limit: int):
        self.service = service
        self.limit = limit
        self._day = None
        self._used = 0
        self._lock = threading.Lock()

    def spend(self, amount: int = 1) -> None:
        today = datetime.now(timezone.utc).date()
        with self._lock:
            if self._day != today:
                self._day, self._used = today, 0
            if self._used + amount > self.limit:
                raise DailyBudgetExceeded(self.service)
            self._used += amount

    def remaining(self) -> int:
        today = datetime.now(timezone.utc).date()
        with self._lock:
            return self.limit if self._day != today else max(0, self.limit - self._used)


# JSearch's free plan is a monthly allowance, so a daily share of it keeps one busy
# day from using the whole month. Gemini Flash Lite allows 500 requests a day;
# stopping a little short leaves headroom for retries.
jsearch_budget = DailyBudget("JSearch", _env_int("JSEARCH_DAILY_LIMIT", 30))
gemini_budget = DailyBudget("Gemini", _env_int("GEMINI_DAILY_LIMIT", 450))

BUDGET_MESSAGES = {
    "JSearch": "CareerAtlas has reached today's job search limit. Please try again tomorrow.",
    "Gemini": "CareerAtlas has reached today's AI generation limit. Please try again tomorrow.",
}


# --- Sign-in verification ----------------------------------------------------

SUPABASE_URL = (os.getenv("SUPABASE_URL") or "").strip().rstrip("/")
SUPABASE_ANON_KEY = (os.getenv("SUPABASE_ANON_KEY") or "").strip()
AUTH_CONFIGURED = bool(SUPABASE_URL and SUPABASE_ANON_KEY)
TOKEN_CACHE_SECONDS = 300

_token_cache: dict[str, tuple[str, float]] = {}
_token_lock = threading.Lock()


def _verify_token(token: str) -> str | None:
    """Ask Supabase who a token belongs to, caching the answer briefly."""
    now = time.monotonic()
    with _token_lock:
        cached = _token_cache.get(token)
        if cached and cached[1] > now:
            return cached[0]

    try:
        response = requests.get(
            f"{SUPABASE_URL}/auth/v1/user",
            headers={"apikey": SUPABASE_ANON_KEY, "Authorization": f"Bearer {token}"},
            timeout=(5, 10),
        )
    except requests.RequestException as error:
        print(f"Supabase token check failed: {error}")
        raise HTTPException(status_code=503, detail="We couldn't confirm your sign-in right now. Please try again.")

    user_id = response.json().get("id") if response.status_code == 200 else None
    if not user_id:
        return None

    with _token_lock:
        if len(_token_cache) > 2000:
            for key in [key for key, (_, expiry) in _token_cache.items() if expiry <= now]:
                _token_cache.pop(key, None)
        _token_cache[token] = (user_id, now + TOKEN_CACHE_SECONDS)
    return user_id


def require_user(request: Request) -> str:
    """FastAPI dependency: the signed-in Supabase user's id, or a 401.

    When the backend has no Supabase settings the check is skipped (with a startup
    warning and auth_configured=false on /health), so a half-configured deployment
    keeps working. The caller's IP then stands in as the rate-limit identity.
    """
    if not AUTH_CONFIGURED:
        return f"ip:{client_ip(request)}"

    header = request.headers.get("authorization", "")
    token = header[7:].strip() if header.lower().startswith("bearer ") else ""
    if not token:
        raise HTTPException(status_code=401, detail="Sign in to use this feature.")
    user_id = _verify_token(token)
    if not user_id:
        raise HTTPException(status_code=401, detail="Your session has expired. Please sign in again.")
    return user_id


if not AUTH_CONFIGURED:
    print("⚠️  SUPABASE_URL / SUPABASE_ANON_KEY are not set: sign-in is NOT enforced on document generation.")
