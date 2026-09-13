"""Read a job posting from a link the user found on another site.

Two tiers, cheapest first:
  1. schema.org JobPosting JSON-LD embedded in the page. Most applicant-tracking
     systems (Greenhouse, Lever, Workday, many company career pages) publish it.
     No AI request is spent.
  2. Gemini extracts the posting from the page's visible text. This also spots
     login walls and error pages, which are reported as unreadable.

Because the server fetches a URL chosen by the user, every hop is checked so the
request cannot be pointed at private or internal addresses (SSRF).
"""

import ipaddress
import json
import re
import socket
from html import unescape
from html.parser import HTMLParser
from urllib.parse import urljoin, urlparse

import requests

MAX_URL_LENGTH = 2048
MAX_PAGE_BYTES = 2 * 1024 * 1024
MAX_REDIRECTS = 3
FETCH_TIMEOUT = (5, 10)  # connect, read
MIN_DESCRIPTION_CHARS = 150
MAX_DESCRIPTION_CHARS = 15000
AI_TEXT_LIMIT = 12000
USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/126.0 Safari/537.36"
)

UNREADABLE = (
    "We couldn't read that page. Many job sites block automated access "
    "— paste the job description instead."
)


class ExtractionError(Exception):
    """Raised with a message that is safe to show to the user."""


# --- URL safety -------------------------------------------------------------

_NAT64_PREFIXES = (ipaddress.ip_network("64:ff9b::/96"), ipaddress.ip_network("64:ff9b:1::/48"))


def _embedded_ipv4(ip):
    """The IPv4 address an IPv6 transition address stands for, if any.

    IPv6-only networks (common on mobile ISPs) answer DNS with NAT64 addresses
    such as 64:ff9b::6c9f:f24, which is just 108.159.15.36. Judging those by the
    IPv6 prefix wrongly rejects public sites, and ignoring them would let
    64:ff9b::7f00:1 smuggle in 127.0.0.1, so the real IPv4 address is checked.
    """
    if ip.version != 6:
        return None
    if ip.ipv4_mapped:  # ::ffff:127.0.0.1
        return ip.ipv4_mapped
    if ip.sixtofour:  # 2002::/16
        return ip.sixtofour
    if ip.teredo:  # 2001::/32 carries the client address second
        return ip.teredo[1]
    if any(ip in prefix for prefix in _NAT64_PREFIXES):
        return ipaddress.IPv4Address(int(ip) & 0xFFFFFFFF)
    return None


def _is_public_ip(raw_ip: str) -> bool:
    ip = ipaddress.ip_address(raw_ip.split("%", 1)[0])  # drop IPv6 zone ids
    ip = _embedded_ipv4(ip) or ip
    return ip.is_global and not (ip.is_multicast or ip.is_reserved or ip.is_unspecified)


def validate_public_url(url: str) -> str:
    """Return the URL if it is http(s) and every address it resolves to is public."""
    url = (url or "").strip()
    if not url or len(url) > MAX_URL_LENGTH:
        raise ExtractionError("Enter a valid job link.")

    parsed = urlparse(url)
    if parsed.scheme not in ("http", "https") or not parsed.hostname:
        raise ExtractionError("Enter a link that starts with http:// or https://.")
    if parsed.username or parsed.password:
        raise ExtractionError("Links containing a username or password aren't supported.")

    try:
        port = parsed.port or (443 if parsed.scheme == "https" else 80)
    except ValueError:
        raise ExtractionError("Enter a valid job link.")

    try:
        addresses = socket.getaddrinfo(parsed.hostname, port, type=socket.SOCK_STREAM)
    except (socket.gaierror, UnicodeError):
        raise ExtractionError("We couldn't find that website. Check the link and try again.")

    if not addresses or not all(_is_public_ip(info[4][0]) for info in addresses):
        raise ExtractionError("That link points to a private network address and can't be read.")
    return url


def fetch_page(url: str) -> str:
    """Download a page, following redirects one hop at a time.

    Each redirect target is re-validated, so a public URL cannot bounce the
    request to an internal address. (A DNS answer changing between the check
    and the request is not defended against; acceptable for this app.)
    """
    current = url
    for _ in range(MAX_REDIRECTS + 1):
        validate_public_url(current)
        try:
            response = requests.get(
                current,
                headers={"User-Agent": USER_AGENT, "Accept": "text/html,application/xhtml+xml"},
                timeout=FETCH_TIMEOUT,
                allow_redirects=False,
                stream=True,
            )
        except requests.RequestException:
            raise ExtractionError(UNREADABLE)

        with response:
            if response.status_code in (301, 302, 303, 307, 308):
                location = response.headers.get("Location")
                if not location:
                    raise ExtractionError(UNREADABLE)
                current = urljoin(current, location)
                continue

            if response.status_code >= 400:
                raise ExtractionError(UNREADABLE)

            content_type = response.headers.get("Content-Type", "").lower()
            if "html" not in content_type and "text/plain" not in content_type:
                raise ExtractionError(UNREADABLE)

            body = bytearray()
            # iter_content decompresses gzip, so the cap also stops compression bombs.
            for chunk in response.iter_content(chunk_size=65536):
                body.extend(chunk)
                if len(body) > MAX_PAGE_BYTES:
                    raise ExtractionError("That page is too large to read. Paste the job description instead.")

            encoding = response.encoding if "charset=" in content_type else "utf-8"
            return body.decode(encoding or "utf-8", errors="replace")

    raise ExtractionError(UNREADABLE)


# --- HTML parsing -----------------------------------------------------------

_BLOCK_TAGS = {
    "p", "div", "br", "li", "ul", "ol", "section", "article", "h1", "h2", "h3",
    "h4", "h5", "h6", "tr", "table", "blockquote", "dd", "dt", "pre",
}


def _clean_text(text: str) -> str:
    lines = [re.sub(r"[ \t ]+", " ", line).strip() for line in text.splitlines()]
    return re.sub(r"\n{3,}", "\n\n", "\n".join(lines)).strip()


class _PageParser(HTMLParser):
    """Collects JSON-LD blocks, the page title, key meta tags, and visible text."""

    # Page chrome and non-content elements. <header> is deliberately kept: many
    # job pages put the job title there.
    _SKIPPED = {"script", "style", "noscript", "nav", "footer", "svg", "template", "iframe"}

    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.json_ld = []
        self.title = ""
        self.meta = {}
        self._text = []
        self._skip_depth = 0
        self._in_json_ld = False
        self._json_ld_buffer = []
        self._in_title = False

    def handle_starttag(self, tag, attrs):
        attributes = dict(attrs)
        if tag == "script" and (attributes.get("type") or "").lower().startswith("application/ld+json"):
            self._in_json_ld = True
            self._json_ld_buffer = []
            return
        if tag == "meta":
            key = (attributes.get("property") or attributes.get("name") or "").lower()
            if key in ("og:title", "og:description", "description", "og:site_name") and attributes.get("content"):
                self.meta.setdefault(key, attributes["content"])
        if tag == "title":
            self._in_title = True
        if tag in self._SKIPPED:
            self._skip_depth += 1
        if tag in _BLOCK_TAGS:
            self._text.append("\n")

    def handle_endtag(self, tag):
        if tag == "script" and self._in_json_ld:
            self.json_ld.append("".join(self._json_ld_buffer))
            self._in_json_ld = False
            return
        if tag == "title":
            self._in_title = False
        if tag in self._SKIPPED and self._skip_depth:
            self._skip_depth -= 1
        if tag in _BLOCK_TAGS:
            self._text.append("\n")

    def handle_data(self, data):
        if self._in_json_ld:
            self._json_ld_buffer.append(data)
            return
        if self._in_title:
            self.title += data
        if not self._skip_depth:
            self._text.append(data)

    def visible_text(self) -> str:
        return _clean_text("".join(self._text))


class _FragmentParser(HTMLParser):
    """Turns an HTML job description into readable plain text with bullets."""

    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.parts = []

    def handle_starttag(self, tag, attrs):
        if tag == "li":
            self.parts.append("\n- ")
        elif tag in _BLOCK_TAGS:
            self.parts.append("\n")

    def handle_endtag(self, tag):
        if tag in _BLOCK_TAGS and tag != "li":
            self.parts.append("\n")

    def handle_data(self, data):
        self.parts.append(data)


def html_to_text(fragment: str) -> str:
    fragment = fragment or ""
    if "&lt;" in fragment:  # some sites HTML-escape the description twice
        fragment = unescape(fragment)
    parser = _FragmentParser()
    parser.feed(fragment)
    parser.close()
    return _clean_text("".join(parser.parts))


# --- Tier 1: JSON-LD --------------------------------------------------------

def _iter_json_ld_nodes(data):
    if isinstance(data, list):
        for item in data:
            yield from _iter_json_ld_nodes(item)
    elif isinstance(data, dict):
        yield data
        for key in ("@graph", "mainEntity", "itemListElement"):
            if isinstance(data.get(key), (dict, list)):
                yield from _iter_json_ld_nodes(data[key])


def _is_job_posting(node) -> bool:
    types = node.get("@type")
    types = types if isinstance(types, list) else [types]
    return any(isinstance(item, str) and item.rsplit("/", 1)[-1].lower() == "jobposting" for item in types)


def _name_of(value) -> str:
    if isinstance(value, dict):
        return str(value.get("name") or "").strip()
    if isinstance(value, list):
        return next((name for name in (_name_of(item) for item in value) if name), "")
    return str(value or "").strip()


def _location_of(node) -> str:
    if str(node.get("jobLocationType", "")).upper() == "TELECOMMUTE":
        return "Remote"
    locations = node.get("jobLocation")
    locations = locations if isinstance(locations, list) else [locations]
    for location in locations:
        if not isinstance(location, dict):
            continue
        address = location.get("address")
        if isinstance(address, str):
            return address.strip()
        if isinstance(address, dict):
            parts = [
                address.get("addressLocality"),
                address.get("addressRegion"),
                _name_of(address.get("addressCountry")),
            ]
            text = ", ".join(str(part).strip() for part in parts if part and str(part).strip())
            if text:
                return text
    return ""


def job_from_json_ld(blocks) -> dict | None:
    """First JobPosting found in the page's JSON-LD blocks, or None."""
    for raw in blocks:
        try:
            data = json.loads(raw.strip(), strict=False)
        except (json.JSONDecodeError, ValueError):
            continue
        for node in _iter_json_ld_nodes(data):
            if not _is_job_posting(node):
                continue
            employment = node.get("employmentType")
            if isinstance(employment, list):
                employment = ", ".join(str(item) for item in employment)
            return {
                "title": str(node.get("title") or node.get("name") or "").strip(),
                "company": _name_of(node.get("hiringOrganization")),
                "location": _location_of(node),
                "employment_type": str(employment or "").replace("_", " ").title(),
                "description": html_to_text(str(node.get("description") or ""))[:MAX_DESCRIPTION_CHARS],
            }
    return None


# --- Tier 2: Gemini ---------------------------------------------------------

def _job_from_page_text(text: str, page_title: str, meta: dict) -> dict:
    # Imported here so the URL checks and parsers stay usable without loading
    # the AI stack (keeps unit checks light).
    from agents import JSON_GENERATION_CONFIG, _response_json, invoke_with_retry, llm

    prompt = f"""
You extract one job posting from the text of a web page.

Return ONLY valid JSON in this exact shape:
{{"is_job_posting": true, "title": "string", "company": "string", "location": "string", "employment_type": "string", "description": "string"}}

Rules:
- "description" is the full job description: responsibilities, requirements,
  qualifications, and benefits. Keep the page's own wording. Do not summarise,
  shorten, or invent anything.
- Use an empty string for anything the page does not state.
- Set "is_job_posting" to false if the page is a login or sign-up wall, a search
  results or listings page, an error page, or does not describe one specific job.

Page title: {page_title}
Page description: {meta.get("og:description") or meta.get("description") or ""}

Page text:
{text[:AI_TEXT_LIMIT]}
"""
    try:
        data = _response_json(invoke_with_retry(llm, prompt, generation_config=JSON_GENERATION_CONFIG))
    except Exception as error:
        print(f"AI job extraction failed: {error}")
        raise ExtractionError(UNREADABLE)

    if not data.get("is_job_posting"):
        raise ExtractionError(UNREADABLE)
    return {
        "title": str(data.get("title") or "").strip(),
        "company": str(data.get("company") or "").strip(),
        "location": str(data.get("location") or "").strip(),
        "employment_type": str(data.get("employment_type") or "").strip(),
        "description": str(data.get("description") or "").strip()[:MAX_DESCRIPTION_CHARS],
    }


# --- Entry point ------------------------------------------------------------

def extract_job_from_url(url: str) -> dict:
    """Fetch a job link and return {title, company, location, employment_type, description, url, extraction}."""
    url = validate_public_url(url)
    page = fetch_page(url)

    parser = _PageParser()
    parser.feed(page)
    parser.close()
    page_title = unescape(parser.meta.get("og:title") or parser.title).strip()

    structured = job_from_json_ld(parser.json_ld)
    if structured and structured["title"] and len(structured["description"]) >= MIN_DESCRIPTION_CHARS:
        return {**structured, "url": url, "extraction": "structured"}

    text = parser.visible_text()
    if len(text) < 200:
        raise ExtractionError(UNREADABLE)

    job = _job_from_page_text(text, page_title, parser.meta)
    # Keep anything the structured data did provide when the AI left it blank.
    for field in ("title", "company", "location", "employment_type"):
        if not job[field] and structured and structured.get(field):
            job[field] = structured[field]
    if not job["title"]:
        job["title"] = page_title
    if len(job["description"]) < MIN_DESCRIPTION_CHARS:
        raise ExtractionError(UNREADABLE)
    return {**job, "url": url, "extraction": "ai"}
