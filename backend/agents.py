import os
import sys
import time
import requests
import json
import re

if sys.stdout and hasattr(sys.stdout, "reconfigure"):
    try:
        sys.stdout.reconfigure(encoding="utf-8")
        sys.stderr.reconfigure(encoding="utf-8")
    except Exception:
        pass
from typing import Any
from dotenv import load_dotenv
from google.api_core.exceptions import ResourceExhausted

try:
    from langchain_mistralai import ChatMistralAI
except ImportError:
    ChatMistralAI = None

try:
    from langchain_google_genai import ChatGoogleGenerativeAI
except ImportError:
    ChatGoogleGenerativeAI = None

from security import DailyBudgetExceeded, gemini_budget, jsearch_budget
from state import AgentState

_backend_dir = os.path.dirname(os.path.abspath(__file__))
load_dotenv(os.path.join(_backend_dir, ".env"))
load_dotenv()

_mistral_key = os.getenv("MISTRAL_API_KEY")
_gemini_key = os.getenv("GOOGLE_API_KEY") or os.getenv("GEMINI_API_KEY")

LLM_PROVIDER = os.getenv("LLM_PROVIDER")
if not LLM_PROVIDER:
    if _mistral_key and ChatMistralAI:
        LLM_PROVIDER = "mistral"
    elif _gemini_key and ChatGoogleGenerativeAI:
        LLM_PROVIDER = "gemini"
    else:
        LLM_PROVIDER = "none"

if LLM_PROVIDER == "mistral":
    MISTRAL_MODEL = os.getenv("MISTRAL_MODEL", "codestral-2508")
    llm = ChatMistralAI(
        model=MISTRAL_MODEL,
        mistral_api_key=_mistral_key,
        temperature=0.0
    )
    print(f"[LLM] Active Provider: Mistral AI ({MISTRAL_MODEL}) - High Limit Tier (125 RPM / 625k TPM)")
elif LLM_PROVIDER == "gemini":
    if _gemini_key:
        os.environ["GOOGLE_API_KEY"] = _gemini_key
    GEMINI_MODEL = os.getenv("GEMINI_MODEL", "gemini-3.5-flash-lite")
    llm = ChatGoogleGenerativeAI(
        model=GEMINI_MODEL,
        temperature=0.0
    )
    print(f"Gemini model: {GEMINI_MODEL}")
else:
    llm = None
    print("[WARN] No MISTRAL_API_KEY or GEMINI_API_KEY configured. AI features will fail.")


RAPIDAPI_KEY = os.getenv("RAPIDAPI_KEY")
JSEARCH_HOST = "jsearch.p.rapidapi.com"
JSEARCH_TIMEOUT = (10, 45)  # connect timeout, then up to 45 seconds for the provider response
JSON_GENERATION_CONFIG = {"response_mime_type": "application/json"}


def _is_quota_error(error):
    """True for 429 / RESOURCE_EXHAUSTED / RateLimit error across Gemini and Mistral."""
    if isinstance(error, ResourceExhausted):
        return True
    text = str(error).lower()
    return "resource_exhausted" in text or "429" in text or "rate limit" in text or "ratelimit" in text


def _is_daily_quota_error(error):
    """True when the exhausted quota is a per-day one."""
    text = str(error).lower().replace(" ", "").replace("_", "")
    return "perday" in text or "requestsperday" in text


def invoke_with_retry(chain, prompt, max_retries=2, base_delay=8, **invoke_kwargs):
    kwargs = dict(invoke_kwargs)
    # Adapt Gemini-specific JSON configuration to standard response_format for Mistral
    if ChatMistralAI and isinstance(chain, ChatMistralAI):
        if "generation_config" in kwargs:
            kwargs.pop("generation_config")
            kwargs["response_format"] = {"type": "json_object"}

    for attempt in range(max_retries):
        if LLM_PROVIDER == "gemini":
            gemini_budget.spend()
        try:
            return chain.invoke(prompt, **kwargs)
        except Exception as error:
            if not _is_quota_error(error):
                raise
            if _is_daily_quota_error(error):
                print("Daily free-tier quota is exhausted. Falling back immediately.")
                raise
            if attempt == max_retries - 1:
                raise
            wait = base_delay * (attempt + 1)
            print(f"Rate limited, retrying in {wait}s...")
            time.sleep(wait)


def supervisor_node(state: AgentState):
    print("👑 Supervisor: Routing workflow...")
    if not state.get("research_attempted"):
        return {"next_agent": "researcher"}
    # Searching is intentionally a separate step. The application routes a
    # selected listing to the analysis agents only when the user asks for it.
    return {"next_agent": "FINISH"}


# JSearch's job_requirements filter only keeps listings tagged with an experience
# level, and most are untagged. Measured on "Software Engineer, Bengaluru": the
# old entry-level value "no_experience,under_3_years_experience" returned 0 jobs
# and "under_3_years_experience" alone returned 2, while
# "more_than_3_years_experience" returned a full page. So experienced searches use
# the filter, and entry-level searches put an entry-level term in the query.
EXPERIENCE_MAP = {
    "any": None,
    "entry": None,
    "experienced": "more_than_3_years_experience",
}

# How entry-level roles are advertised. Indian listings say "fresher" (10 results
# in the same test, most of them entry roles, against 4 for "entry level").
ENTRY_LEVEL_TERMS = {"in": ["fresher", "entry level"]}
DEFAULT_ENTRY_LEVEL_TERMS = ["entry level", "junior"]

# Below this many results, an entry-level search tries its second phrasing too.
ENTRY_LEVEL_MIN_RESULTS = 5

# Full postings are kept for the writing agents. The median JSearch description is
# about 2,700 characters, so the old 1,000-character cut dropped most requirements.
JOB_DESCRIPTION_LIMIT = 15000

COUNTRY_NAMES = {
    "in": "India",
    "us": "United States",
    "gb": "United Kingdom",
    "ca": "Canada",
    "au": "Australia",
}


def _response_text(content: Any) -> str:
    """Flatten an LLM response body to plain text.

    Depending on the model, langchain returns either a plain string or a list of
    content blocks like [{"type": "text", "text": "..."}]. Calling str() on that
    list yields a Python repr with single quotes, which is not valid JSON, so the
    text parts are joined explicitly instead.
    """
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        parts = []
        for block in content:
            if isinstance(block, str):
                parts.append(block)
            elif isinstance(block, dict) and isinstance(block.get("text"), str):
                parts.append(block["text"])
        if parts:
            return "".join(parts)
    return str(content)


def _response_json(response: Any) -> dict[str, Any]:
    """Extract a JSON object from an LLM response, including fenced responses."""
    content = _response_text(getattr(response, "content", response))
    cleaned = re.sub(r"^```(?:json)?\s*|\s*```$", "", content.strip(), flags=re.IGNORECASE)
    start, end = cleaned.find("{"), cleaned.rfind("}")
    if start == -1 or end == -1 or end <= start:
        raise ValueError("The model did not return a JSON object.")
    parsed = json.loads(cleaned[start:end + 1])
    if not isinstance(parsed, dict):
        raise ValueError("The model response was not a JSON object.")
    return parsed


def _text_list(value: Any) -> list[str]:
    if not isinstance(value, list):
        return []
    return [str(item).strip() for item in value if isinstance(item, (str, int, float)) and str(item).strip()]


def _fallback_candidate_profile(target_role: str) -> dict[str, Any]:
    return {
        "candidate_titles": [target_role],
        "skills": [],
        "experience_level": "unknown",
        "industries": [],
        "summary": "AI profile extraction was unavailable; results use title and filter alignment.",
    }


def extract_candidate_profile(resume_text: str, target_role: str) -> dict[str, Any]:
    """Build a dynamic candidate profile from the resume, without a fixed skills list."""
    prompt = f"""
You extract a factual candidate profile from a resume for a job-matching product.

Return ONLY valid JSON in this exact shape:
{{
  "candidate_titles": ["string"],
  "skills": [{{"name": "string", "category": "technical|domain|tool|soft_skill", "evidence": "short evidence from the resume"}}],
  "experience_level": "entry|mid|senior|unknown",
  "industries": ["string"],
  "summary": "one short factual summary"
}}

Rules:
- Extract only skills, titles, industries, and experience explicitly supported by the resume.
- Never invent a skill, number of years, qualification, company, or achievement.
- Keep skills useful for any career domain; do not limit extraction to technology skills.
- Keep each evidence value short and grounded in the resume.
- The user's stated target role is context only: {target_role}

Resume:
{resume_text[:18000]}
"""
    # Gemini JSON mode prevents malformed strings from disabling resume-aware ranking.
    profile = _response_json(
        invoke_with_retry(llm, prompt, generation_config=JSON_GENERATION_CONFIG)
    )
    skills = profile.get("skills", [])
    if not isinstance(skills, list):
        skills = []

    normalized_skills = []
    for skill in skills:
        if not isinstance(skill, dict):
            continue
        name = str(skill.get("name", "")).strip()
        evidence = str(skill.get("evidence", "")).strip()
        if name and evidence:
            normalized_skills.append({
                "name": name,
                "category": str(skill.get("category", "domain")).strip() or "domain",
                "evidence": evidence,
            })

    return {
        "candidate_titles": _text_list(profile.get("candidate_titles")) or [target_role],
        "skills": normalized_skills[:40],
        "experience_level": str(profile.get("experience_level", "unknown")).lower(),
        "industries": _text_list(profile.get("industries"))[:10],
        "summary": str(profile.get("summary", "")).strip(),
    }


def _tokens(value: str) -> set[str]:
    return {token for token in re.findall(r"[a-z0-9+#.]{2,}", value.lower())}


SENIOR_TITLE = re.compile(
    r"\b(senior|sr\.?|principal|staff|lead|manager|director|head of|architect|vp)\b"
    r"|\b(sde|swe|engineer|developer)\s*(iii|iv|3|4|5)\b",
    re.IGNORECASE,
)


def _is_seniority_mismatch(job: dict[str, Any], experience_level: str) -> bool:
    """A clearly senior title shown to an entry-level candidate."""
    if experience_level != "entry":
        return False
    return bool(SENIOR_TITLE.search(str(job.get("title", ""))))


def _fallback_match_score(job: dict[str, Any], profile: dict[str, Any], target_role: str) -> tuple[int, list[str]]:
    title = str(job.get("title", "")).lower()
    haystack = f"{title} {job.get('description', '')}".lower()
    role_terms = _tokens(target_role)
    title_hits = len(role_terms & _tokens(title))
    role_hits = len(role_terms & _tokens(haystack))

    matched_skills = []
    for skill in profile.get("skills", []):
        if not isinstance(skill, dict):
            continue
        name = str(skill.get("name", "")).strip()
        if name and name.lower() in haystack:
            matched_skills.append(name)

    score = min(100, 25 + title_hits * 15 + role_hits * 4 + min(len(matched_skills), 8) * 6)
    if _is_seniority_mismatch(job, profile.get("experience_level", "unknown")):
        score = max(0, score - 35)
    return score, matched_skills[:5]


def rank_jobs_for_candidate(
    jobs: list[dict[str, Any]],
    profile: dict[str, Any],
    target_role: str,
    use_ai_ranking: bool = True,
) -> tuple[list[dict[str, Any]], str]:
    """Use deterministic pre-ranking, then one AI call to rank the strongest candidates."""
    deduplicated = []
    seen = set()
    for job in jobs:
        identity = job.get("job_id") or job.get("url") or f"{job.get('title')}:{job.get('company')}"
        if identity in seen:
            continue
        seen.add(identity)
        score, matched_skills = _fallback_match_score(job, profile, target_role)
        enriched = {**job, "match_score": score, "matched_skills": matched_skills, "missing_skills": [], "match_reason": "Title and resume alignment"}
        deduplicated.append(enriched)

    suitable = [job for job in deduplicated if not _is_seniority_mismatch(job, profile.get("experience_level", "unknown"))]
    candidates = suitable or deduplicated
    candidates.sort(key=lambda item: item["match_score"], reverse=True)
    # Only the top 10 are ever shown, so ranking more than that costs latency
    # for results nobody sees. A couple of spares absorb any dropped entries.
    candidates = candidates[:12]

    if not candidates or not use_ai_ranking:
        return candidates[:10], "fallback"

    ranking_input = [
        {
            "job_id": job.get("job_id"),
            "title": job.get("title"),
            "company": job.get("company"),
            "location": job.get("location"),
            "employment_type": job.get("employment_type"),
            # Requirements sit near the top of a listing, so the opening lines
            # carry almost all the signal. A shorter prompt is a faster response.
            "description": str(job.get("description", ""))[:400],
        }
        for job in candidates
    ]
    prompt = f"""
You rank job listings for a candidate. Return ONLY valid JSON in this exact shape:
{{"ranked_jobs": [{{"job_id": "string", "match_score": 0, "matched_skills": ["string"], "missing_skills": ["string"], "match_reason": "one concise sentence"}}]}}

Rules:
- Rank only the supplied jobs. Return every supplied job once, ordered best to worst.
- Use only evidence in the candidate profile and the job descriptions.
- Do not claim the candidate has a skill unless it appears in the candidate profile.
- Do not invent job requirements.
- Penalize clear seniority mismatches.
- Match skills from any field, not only technology.

Candidate profile:
{json.dumps(profile, ensure_ascii=False)}

Target role: {target_role}

Jobs:
{json.dumps(ranking_input, ensure_ascii=False)}
"""
    try:
        result = _response_json(
            invoke_with_retry(llm, prompt, generation_config=JSON_GENERATION_CONFIG)
        )
        ranked = result.get("ranked_jobs", [])
        if not isinstance(ranked, list):
            raise ValueError("ranked_jobs was not a list")
        by_id = {str(job.get("job_id")): job for job in candidates}
        ordered = []
        # Track which listings the model actually ranked. Comparing dicts does
        # not work here: each entry appended below is a modified copy, so it
        # never equals the original and every job would be appended twice.
        ranked_ids = set()
        for item in ranked:
            if not isinstance(item, dict):
                continue
            job_id = str(item.get("job_id"))
            job = by_id.get(job_id)
            if not job or job_id in ranked_ids:
                continue
            ranked_ids.add(job_id)
            score = item.get("match_score", job["match_score"])
            try:
                score = max(0, min(100, int(score)))
            except (TypeError, ValueError):
                score = job["match_score"]
            ordered.append({
                **job,
                "match_score": score,
                "matched_skills": _text_list(item.get("matched_skills"))[:5],
                "missing_skills": _text_list(item.get("missing_skills"))[:5],
                "match_reason": str(item.get("match_reason", job["match_reason"])).strip() or job["match_reason"],
            })
        remaining = [job for job in candidates if str(job.get("job_id")) not in ranked_ids]
        return (ordered + remaining)[:10], "ai"
    except Exception as error:
        print(f"AI job ranking unavailable; using fallback ranking: {error}")
        return candidates[:10], "fallback"

def job_researcher_node(state: AgentState):
    print("🔍 Researcher: Searching JSearch for live listings...")

    if not RAPIDAPI_KEY:
        print("⚠️ RAPIDAPI_KEY is not set — skipping job search.")
        return {"job_descriptions": [], "research_attempted": True}

    country = str(state.get("country") or "in").strip().lower()
    country_name = COUNTRY_NAMES.get(country, country.upper())
    location = (state.get("location") or "").strip()
    search_location = location or country_name
    role = state["target_role"]
    experience_level = state.get("experience_level")

    # JSearch V5 defaults to US results, so country must always be explicit.
    # One page returns up to 10 jobs and uses one free-tier request credit.
    base_params = {"country": country, "num_pages": "1"}
    if location:
        base_params["location"] = f"{location}, {country_name}"
    date_posted = state.get("date_posted")
    if date_posted and date_posted != "all":
        base_params["date_posted"] = date_posted
    if state.get("remote_only"):
        base_params["work_from_home"] = "true"
    job_requirements = EXPERIENCE_MAP.get(experience_level)
    if job_requirements:
        base_params["job_requirements"] = job_requirements

    page = max(1, int(state.get("page") or 1))
    if page > 1:
        base_params["page"] = str(page)

    if experience_level == "entry":
        terms = ENTRY_LEVEL_TERMS.get(country, DEFAULT_ENTRY_LEVEL_TERMS)
        # Try the local phrasing first; spend a second request only if it is thin.
        # Later pages continue the first phrasing only, one request each.
        queries = [f"{term} {role} jobs in {search_location}" for term in (terms if page == 1 else terms[:1])]
    else:
        queries = [f"{role} jobs in {search_location}"]

    jobs, seen = [], set()
    for index, query in enumerate(queries):
        if index > 0 and len(jobs) >= ENTRY_LEVEL_MIN_RESULTS:
            break
        try:
            found = _search_jsearch({**base_params, "query": query})
        except (DailyBudgetExceeded, JobSearchUnavailable):
            if index == 0:
                raise
            break  # keep what the first request found rather than failing the search
        for job in found:
            identity = job["job_id"] or job["url"] or f"{job['title']}:{job['company']}"
            if identity not in seen:
                seen.add(identity)
                jobs.append(job)
        print(f"✅ {len(jobs)} unique jobs after query: '{query}'")

    return {"job_descriptions": jobs, "research_attempted": True}


class JobSearchUnavailable(Exception):
    """JSearch failed or timed out, as opposed to returning no jobs."""


def _search_jsearch(params: dict[str, str]) -> list[dict[str, Any]]:
    """One JSearch request, normalised to the job shape the app uses.

    Raises JobSearchUnavailable when the request itself fails, so callers can tell
    "try again" apart from "there are no more jobs".
    """
    jsearch_budget.spend()  # raises DailyBudgetExceeded once today's share is used
    try:
        response = requests.get(
            f"https://{JSEARCH_HOST}/search-v2",
            headers={"X-RapidAPI-Key": RAPIDAPI_KEY, "X-RapidAPI-Host": JSEARCH_HOST},
            params=params,
            timeout=JSEARCH_TIMEOUT,
        )
        response.raise_for_status()
        data = response.json()
    except (requests.RequestException, ValueError) as e:
        print(f"❌ JSearch request failed: {e}")
        raise JobSearchUnavailable(str(e))

    result_data = data.get("data", [])
    job_results = result_data.get("jobs", result_data.get("results", [])) if isinstance(result_data, dict) else result_data
    print(f"JSearch accepted parameters: {data.get('parameters', {})}")

    if not isinstance(job_results, list):
        print(f"⚠️ Unexpected JSearch response shape. Top-level keys: {list(data.keys())}")
        return []

    jobs = []
    for item in job_results[:25]:
        if not isinstance(item, dict):
            continue
        location_parts = [item.get("job_city"), item.get("job_state"), item.get("job_country")]
        jobs.append({
            "job_id": item.get("job_id", ""),
            "title": item.get("job_title", "Unknown"),
            "company": item.get("employer_name", "Unknown"),
            "description": (item.get("job_description") or "").strip()[:JOB_DESCRIPTION_LIMIT],
            "url": item.get("job_apply_link", ""),
            "location": ", ".join(dict.fromkeys(str(part).strip() for part in location_parts if part)),
            # search-v2 names this job_employment_type; older responses used the _text form.
            "employment_type": item.get("job_employment_type") or item.get("job_employment_type_text") or "",
            "is_remote": bool(item.get("job_is_remote", False)),
            "posted_at": item.get("job_posted_at") or "",
            "posted_at_utc": item.get("job_posted_at_datetime_utc") or "",
            "publisher": item.get("job_publisher") or "",
            "salary": item.get("job_salary_string") or "",
        })
    return jobs

def skill_gap_node(state: AgentState):
    print("🎓 Skill Gap Advisor: Analyzing...")
    target_job = state.get("selected_job") or {}

    prompt = f"""
    Analyze the skill gap.
    Resume: {state['base_resume']}
    Selected job: {target_job}
    Output a structured gap analysis and project recommendations.
    """
    response = invoke_with_retry(llm, prompt)
    return {"skill_analysis": _response_text(response.content)}


def _job_for_prompt(job: dict[str, Any]) -> str:
    """The parts of a job that matter to the writing agents, as readable text.

    Search results also carry ranking fields (scores, matched skills), which are
    noise in a writing prompt, so only the posting itself is passed on.
    """
    lines = [
        f"Title: {job.get('title') or 'Not stated'}",
        f"Company: {job.get('company') or 'Not stated'}",
        f"Location: {job.get('location') or 'Not stated'}",
    ]
    if job.get("employment_type"):
        lines.append(f"Employment type: {job['employment_type']}")
    lines.append("Description:")
    lines.append(job.get("description") or "Not provided")
    return "\n".join(lines)


def _job_for_resume_tailor(job: dict[str, Any]) -> str:
    """The job details relevant to tailoring, omitting company name.

    Resumes are candidate-centric professional documents, not cover letters.
    Omitting company name from the prompt prevents the model from hallucinating
    the employer's name or proprietary slogans into the resume or Career Objective.
    """
    lines = [
        f"Title: {job.get('title') or 'Not stated'}",
        f"Location: {job.get('location') or 'Not stated'}",
    ]
    if job.get("employment_type"):
        lines.append(f"Employment type: {job['employment_type']}")
    lines.append("Requirements & Role Focus:")
    lines.append(job.get("description") or "Not provided")
    return "\n".join(lines)


def resume_tailor_node(state: AgentState):
    print("📄 Resume Tailor: Rewriting...")
    target_job = state.get("selected_job") or {}
    company = (target_job.get("company") or "").strip()
    title = (target_job.get("title") or "Software Engineer").strip()

    prompt = f"""
You are an expert technical resume writer and ATS optimization specialist.

YOUR MISSION: Tailor and elevate the candidate's existing resume to highlight their strongest qualifications for the target role, by sharpening the language, reordering technical skills, and highlighting relevant engineering achievements — while keeping 100% of the facts truthful.

CRITICAL RULES — ZERO HALLUCINATIONS & ZERO FALSE CLAIMS:
1. NEVER INVENT OR ADD UNPOSSESSED SKILLS OR DOMAINS:
   - In TECHNICAL SKILLS, you may ONLY include technologies and skills that already appear in the original resume.
   - Do NOT add unpossessed tools, languages, or domains mentioned in the job description (e.g. if the job asks for Embedded Systems, C++, AUTOSAR, Kubernetes, or Angular, and the candidate does not have them in their original resume, NEVER add them to the resume!).
   - In TECHNICAL SKILLS, keep all skill categories from the original resume. You may reorder the categories and the skills within each category so matching tools appear at the top.
2. NEVER MENTION THE HIRING COMPANY NAME:
   - Hiring company: "{company}".
   - A resume is a candidate's personal professional profile, NOT a cover letter.
   - NEVER mention "{company}" or any target company name anywhere in the resume body or Career Objective. (No "contribute to {company}", no "seeking to join {company}", etc.).
3. NEVER INVENT YEARS OF EXPERIENCE OR SENIORITY:
   - Do NOT invent or inflate years of experience (no "1.5 years", "2 years", "Senior" if not in original). Preserve the candidate's genuine seniority (e.g., "Computer Science and Engineering graduate").
4. TAILOR CAREER OBJECTIVE VIA OVERLAP ONLY:
   - Rewrite the Career Objective to highlight the intersection of the candidate's GENUINE skills with the target role.
   - Connect their actual background (e.g., Python, React, FastAPI, PostgreSQL, APIs, automated testing) to the engineering qualities the target role needs.
   - Focus on what the candidate CAN truthfully offer. Do NOT claim unpossessed domains or target company names.
5. ACTIVELY REWRITE BULLETS TO HIGHLIGHT ROLE-RELEVANT IMPACT (EXACT 1-TO-1 PARITY):
   - For every entry, you MUST keep EXACTLY the same number of bullets as the original (PyGenicArc: 4 bullets; UptimeSentinel: 4 bullets; CareerAtlas: 4 bullets).
   - NEVER drop bullets. NEVER merge bullets.
   - NEVER truncate sentences. Every bullet must be a complete, well-formed sentence ending with proper punctuation.
   - ACTIVELY REWRITE each bullet using strong engineering action verbs (Engineered, Architected, Designed, Implemented, Optimized, Delivered) to emphasize the technical aspects most relevant to the target role (e.g., frontend UX/responsiveness, API performance, concurrency, test automation, system reliability) while staying 100% grounded in what the candidate actually built in that project.
   - Example of active bullet tailoring without inventing:
     * Original: 'Delivered real-time dashboards with latency sparklines, public status pages, automated 30-day data pruning, and a GitHub Actions CI/CD pipeline with 16 automated Pytest tests.'
     * If Frontend role: 'Architected responsive React dashboards featuring real-time latency sparklines, public status pages, and clean UI state management integrated with backend monitoring APIs.'
     * If Testing/Verification role: 'Engineered real-time status dashboards backed by an automated GitHub Actions CI/CD pipeline executing 16 automated Pytest verification tests.'
     Notice: Both versions remain 100% grounded in what was built, but emphasize the angle most relevant to the target role!
6. MAINTAIN BOLD FORMATTING ON KEY HIGHLIGHTS:
   - In bullet points, preserve and highlight key technologies, metrics, performance numbers, and critical impact using markdown `**bold**` (e.g. `**35+ REST API**`, `**500+ concurrent sessions**`, `**PostgreSQL**`, `**sub-300ms**`, `**cutting processing and rendering latency by ~65%**`, `**16 automated Pytest tests**`, `**row-level locking**`).
   - When rewriting bullets to emphasize skills relevant to the target role, ALWAYS keep key metrics and technologies formatted in `**...**` bold just like in the original resume!
7. PRESERVE ALL ORIGINAL SECTIONS, ENTRIES, METADATA, LINKS & SYMBOLS:
   - Include EVERY section: CAREER OBJECTIVE, TECHNICAL SKILLS, PROFESSIONAL EXPERIENCE, PROJECTS, EDUCATIONAL BACKGROUND, CERTIFICATIONS.
   - Include EVERY project from the original resume (both UptimeSentinel and CareerAtlas).
   - Each section heading ("## ...") must appear EXACTLY ONCE. Do NOT duplicate headings.
   - Keep all contact details, profiles, and demo links clickable on ONE single line separated by " | ".
   - Keep all project demo and code links and link symbols intact: `### Project Name | [DEMO ↗](url) | [GITHUB ↗](url)`. Do NOT drop the `↗` arrow or the links!
   - Keep the company link and link symbol under experience intact: `* [Company Name 🔗](url) *` (e.g. `* [PyGenicArc 🔗](https://pygenicarc.com/) *`). Do NOT remove the company link!
   - Keep certification links and link symbols intact: `### [Certification Name 🔗](url) — Organization | Issued: Month Year` (or `- [Certification Name 🔗](url) — Organization | Issued: Month Year`).
   - Keep all dates, degrees, institutions, and grades exactly as written in the original.

Output format: Valid Markdown adhering strictly to this syntax:
- "# " before the candidate's name.
- Headline under the name only if in original, wrapped in single asterisks (*Headline*).
- Contact details on ONE single line, separated by " | ", with clickable markdown links.
- "## " before EVERY section heading (e.g. "## CAREER OBJECTIVE", "## TECHNICAL SKILLS", "## PROFESSIONAL EXPERIENCE", "## PROJECTS", "## EDUCATIONAL BACKGROUND", "## CERTIFICATIONS"). Every section heading must appear exactly ONCE.
- "### " before the first line of every entry:
  * For jobs: "### Role / Title | Dates | Location" followed by employer/company link on second line in italics (* [Company 🔗](url) * or *Company*).
  * For projects: "### Project Name | [DEMO ↗](url) | [GITHUB ↗](url)" followed by tech stack on second line in italics (*Tech Stack*).
  * For education: "### School / Institution | Dates | Location" followed by degree/grade in italics.
  * For certifications: "### [Course 🔗](url) — Organization | Issued: Month Year" (or bullet `- [Course 🔗](url) — Organization | Issued: Month Year`).
- Bullet points must start with "- " and use `**bold**` highlights for key numbers, metrics, and technologies.
- Paragraphs (like Career Objective) must stay as paragraphs.

Syntax structure reference:
# Candidate Name
[email@example.com](mailto:email@example.com) | [1234567890](tel:1234567890) | City | [linkedin.com/in/user](https://linkedin.com) | [github.com/user](https://github.com) | [portfolio.me](https://portfolio.me)

## CAREER OBJECTIVE
Paragraph describing genuine background and relevant technical focus...

## TECHNICAL SKILLS
**Category:** Skill 1, Skill 2, Skill 3

## PROFESSIONAL EXPERIENCE
### Title | Dates | Location
* [Company Name 🔗](https://company.com) *
- Implemented **35+ REST API** endpoints and responsive React interfaces with **JWT authentication**...
- Engineered live exam monitoring for **500+ concurrent sessions**...

## PROJECTS
### Project Name | [DEMO ↗](https://example.com) | [GITHUB ↗](https://github.com/example)
*Tech 1, Tech 2, Tech 3*
- Built a multi-user HTTP monitoring platform with a **decoupled background worker** using **row-level locking**...

### Project Name 2 | [DEMO ↗](https://example.com) | [GITHUB ↗](https://github.com/example)
*Tech 1, Tech 2, Tech 3*
- Built a **resume-aware job search platform**...

## EDUCATIONAL BACKGROUND
### University Name | Dates | Location
*Degree - Grade*

## CERTIFICATIONS
### [Certification Name 🔗](https://example.com) — Issuer | Issued: Month Year

Output ONLY the raw markdown of the resume: no greeting, no conversational text before or after.

Original resume:
{state['base_resume']}

Target Role:
Title: {title}
{_job_for_resume_tailor(target_job)}
"""
    response = invoke_with_retry(llm, prompt, temperature=0.0)
    raw_text = _response_text(response.content).strip()

    # Extract markdown block if model wrapped in ```markdown ... ```
    match = re.search(r"```(?:markdown)?\s*\n([\s\S]*?)\n```", raw_text, flags=re.IGNORECASE)
    if match:
        content = match.group(1).strip()
    else:
        content = re.sub(r"^```(?:markdown)?\s*\n?|\n?```$", "", raw_text, flags=re.IGNORECASE).strip()

    # Post-Processing Safety Guardrails:
    # 1. Deduplicate consecutive identical section headings or plain headings followed by markdown headings
    cleaned_lines = []
    prev_line = None
    for line in content.split("\n"):
        stripped = line.strip()
        if stripped.startswith("## ") and stripped == prev_line:
            continue
        if prev_line and stripped.startswith("## ") and stripped[3:].strip().upper() == prev_line.upper():
            cleaned_lines.pop()
        cleaned_lines.append(line)
        if stripped:
            prev_line = stripped
    content = "\n".join(cleaned_lines)

    # 2. Company name scrub: If target company name appears in the resume body, scrub it
    if company and len(company) > 2:
        pattern = re.compile(
            rf"\b(?:to\s+contribute\s+to\s+)?{re.escape(company)}(?:'s)?(?:\s+(?:cutting-edge\s+)?transport\s+and\s+infrastructure\s+solutions)?\b",
            re.IGNORECASE,
        )
        content = pattern.sub("a forward-thinking engineering team", content)

    return {"tailored_resume": content}


def cover_letter_node(state: AgentState):
    print("✍️ Cover Letter Agent: Drafting...")
    target_job = state.get("selected_job") or {"title": "Unknown", "company": "Unknown", "description": ""}

    prompt = f"""
Write a cover letter of 3 to 4 paragraphs for this job, based on the candidate's resume.

Rules:
- Use only facts from the resume. Never invent experience, skills, or achievements.
- Use the candidate's real name and contact details exactly as they appear in the
  resume. Never write placeholders like "[Your Name]"; omit anything not available.
- Do not include a date, the employer's address, or a subject line. Those are
  added when the letter is formatted.

Format (plain text, exactly this structure):
Candidate Full Name
contact details on one line, separated by " | "

Dear Hiring Manager,

Paragraph one.

Paragraph two.

Paragraph three.

Sincerely,
Candidate Full Name

Address the greeting to a named person or team only if the job description names
one. Output ONLY the letter: no notes or text before or after.

Resume:
{state.get('tailored_resume') or state['base_resume']}

Target job:
{_job_for_prompt(target_job)}
"""
    response = invoke_with_retry(llm, prompt)
    letter = _response_text(response.content).strip()
    letter = re.sub(r"^```(?:markdown|text)?\s*\n?|\n?```$", "", letter, flags=re.IGNORECASE).strip()
    return {"cover_letter": letter}


def cold_email_node(state: AgentState):
    print("📧 Cold Email Agent: Drafting...")
    target_job = state.get("selected_job") or {"title": "Unknown", "company": "Unknown", "description": ""}

    prompt = f"""
Write a short cold email the candidate can send to a recruiter or hiring manager
about this job, based on the candidate's resume.

Rules:
- Use only facts from the resume. Never invent experience, skills, numbers, or achievements.
- Keep the whole email under 180 words. Recruiters skim.
- Plain and direct. No flattery, no "I hope this email finds you well", no buzzwords.
- Name two or three things from the resume that fit this job, and say the resume is attached.
- Never write placeholders like "[Your Name]" or "[Company]". Leave out anything the
  resume does not show.
- Do not mention salary, notice period, or visa status.

Format (plain text, exactly this structure):
Subject: one line, at most 70 characters, naming the role

Dear Hiring Team,

First paragraph: who the candidate is and which role this is about.

Second paragraph: the strongest match between the resume and this job.

Closing line asking for a short conversation, mentioning the attached resume.

Candidate Full Name
contact details on one line, separated by " | "

Address the greeting to a named person or team only if the job description names one.
Output ONLY the email: no notes or text before or after.

Resume:
{state.get('tailored_resume') or state['base_resume']}

Target job:
{_job_for_prompt(target_job)}
"""
    response = invoke_with_retry(llm, prompt)
    email = _response_text(response.content).strip()
    email = re.sub(r"^```(?:markdown|text)?\s*\n?|\n?```$", "", email, flags=re.IGNORECASE).strip()
    return {"cold_email": email}
