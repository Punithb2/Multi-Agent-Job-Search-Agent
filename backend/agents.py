import os
import time
import requests
import json
import re
from typing import Any
from dotenv import load_dotenv
from langchain_google_genai import ChatGoogleGenerativeAI
from google.api_core.exceptions import ResourceExhausted

from state import AgentState

load_dotenv()

llm = ChatGoogleGenerativeAI(
    model="gemini-2.5-flash",
    temperature=0.0
)

RAPIDAPI_KEY = os.getenv("RAPIDAPI_KEY")
JSEARCH_HOST = "jsearch.p.rapidapi.com"
JSEARCH_TIMEOUT = (10, 45)  # connect timeout, then up to 45 seconds for the provider response


def invoke_with_retry(chain, prompt, max_retries=3, base_delay=15):
    for attempt in range(max_retries):
        try:
            return chain.invoke(prompt)
        except ResourceExhausted:
            if attempt == max_retries - 1:
                raise
            wait = base_delay * (attempt + 1)
            print(f"⏳ Rate limited, retrying in {wait}s...")
            time.sleep(wait)


def supervisor_node(state: AgentState):
    print("👑 Supervisor: Routing workflow...")
    if not state.get("research_attempted"):
        return {"next_agent": "researcher"}
    # Searching is intentionally a separate step. The application routes a
    # selected listing to the analysis agents only when the user asks for it.
    return {"next_agent": "FINISH"}


EXPERIENCE_MAP = {
    "any": None,
    "entry": "no_experience,under_3_years_experience",
    "experienced": "more_than_3_years_experience",
}


def _response_json(response: Any) -> dict[str, Any]:
    """Extract a JSON object from an LLM response, including fenced responses."""
    content = getattr(response, "content", response)
    if not isinstance(content, str):
        content = str(content)
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
    profile = _response_json(invoke_with_retry(llm, prompt))
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


def _is_seniority_mismatch(job: dict[str, Any], experience_level: str) -> bool:
    if experience_level != "entry":
        return False
    title = str(job.get("title", "")).lower()
    return any(term in title for term in ("principal", "director", "staff ", "lead ", "manager"))


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
    candidates = candidates[:15]

    if not candidates or not use_ai_ranking:
        return candidates[:10], "fallback"

    ranking_input = [
        {
            "job_id": job.get("job_id"),
            "title": job.get("title"),
            "company": job.get("company"),
            "location": job.get("location"),
            "employment_type": job.get("employment_type"),
            "description": str(job.get("description", ""))[:900],
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
        result = _response_json(invoke_with_retry(llm, prompt))
        ranked = result.get("ranked_jobs", [])
        if not isinstance(ranked, list):
            raise ValueError("ranked_jobs was not a list")
        by_id = {str(job.get("job_id")): job for job in candidates}
        ordered = []
        for item in ranked:
            if not isinstance(item, dict):
                continue
            job = by_id.get(str(item.get("job_id")))
            if not job or job in ordered:
                continue
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
        remaining = [job for job in candidates if job not in ordered]
        return (ordered + remaining)[:10], "ai"
    except Exception as error:
        print(f"AI job ranking unavailable; using fallback ranking: {error}")
        return candidates[:10], "fallback"

def job_researcher_node(state: AgentState):
    print("🔍 Researcher: Searching JSearch for live listings...")

    if not RAPIDAPI_KEY:
        print("⚠️ RAPIDAPI_KEY is not set — skipping job search.")
        return {"job_descriptions": [], "research_attempted": True}

    query = state["target_role"]
    location = (state.get("location") or "").strip()
    if location:
        query = f"{query} in {location}"

    params = {"query": query, "page": "1", "num_pages": "2"}

    date_posted = state.get("date_posted")
    if date_posted and date_posted != "all":
        params["date_posted"] = date_posted

    if state.get("remote_only"):
        params["remote_jobs_only"] = "true"

    job_requirements = EXPERIENCE_MAP.get(state.get("experience_level"))
    if job_requirements:
        params["job_requirements"] = job_requirements

    try:
        response = requests.get(
            f"https://{JSEARCH_HOST}/search-v2",
            headers={"X-RapidAPI-Key": RAPIDAPI_KEY, "X-RapidAPI-Host": JSEARCH_HOST},
            params=params,
            timeout=JSEARCH_TIMEOUT,
        )
        response.raise_for_status()
        data = response.json()
    except requests.RequestException as e:
        print(f"❌ JSearch request failed: {e}")
        return {"job_descriptions": [], "research_attempted": True}

    result_data = data.get("data", [])
    job_results = result_data.get("jobs", result_data.get("results", [])) if isinstance(result_data, dict) else result_data

    if not isinstance(job_results, list):
        print(f"⚠️ Unexpected JSearch response shape. Top-level keys: {list(data.keys())}")
        return {"job_descriptions": [], "research_attempted": True}

    jobs = []
    for item in job_results[:25]:
        if not isinstance(item, dict):
            continue
        description = (item.get("job_description") or "").strip()
        jobs.append({
            "job_id": item.get("job_id", ""),
            "title": item.get("job_title", "Unknown"),
            "company": item.get("employer_name", "Unknown"),
            "description": description[:1000],
            "url": item.get("job_apply_link", ""),
            "location": item.get("job_city") or item.get("job_country") or "",
            "employment_type": item.get("job_employment_type_text", ""),
            "is_remote": bool(item.get("job_is_remote", False)),
        })

    print(f"✅ Found {len(jobs)} jobs from JSearch (query: '{query}')")
    return {"job_descriptions": jobs, "research_attempted": True}

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
    return {"skill_analysis": response.content}


def resume_tailor_node(state: AgentState):
    print("📄 Resume Tailor: Rewriting...")
    target_job = state.get("selected_job") or {}

    prompt = f"""
    Rewrite this resume to match the target jobs. Use the gap analysis to emphasize transferable skills. DO NOT invent experience.

    Output ONLY the rewritten resume itself — no greeting, no explanation of your changes, no "Key Changes" section, no meta-commentary before or after. The output should be ready to copy directly into a document with no editing needed.

    If you notice something that looks like a date inconsistency, leave the original date exactly as given in the source resume — do not silently correct or annotate it.

    Resume: {state['base_resume']}
    Selected job: {target_job}
    Gap Analysis: {state.get('skill_analysis', '')}
    """
    response = invoke_with_retry(llm, prompt)
    return {"tailored_resume": response.content}


def cover_letter_node(state: AgentState):
    print("✍️ Cover Letter Agent: Drafting...")
    target_job = state.get("selected_job") or {"title": "Unknown", "company": "Unknown", "description": ""}

    prompt = f"""
    Write a 3-4 paragraph cover letter for this job using the tailored resume.

    Use the candidate's actual name, email, and phone number as they appear in the resume — never use placeholder text like "[Your Name]" or "[Your Email]". If a detail genuinely isn't available in the resume, omit it rather than inserting a bracketed placeholder.

    Output ONLY the cover letter itself — no explanation, no meta-commentary.
    Resume: {state.get('tailored_resume') or state['base_resume']}
    Target Job: {target_job}
    """
    response = invoke_with_retry(llm, prompt)
    return {"cover_letter": response.content}
