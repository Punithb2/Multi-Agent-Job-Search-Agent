import os
import time
import requests
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
    if not state.get("job_descriptions"):
        print("⚠️ No jobs found — ending workflow early to avoid wasted calls.")
        return {"next_agent": "FINISH"}
    elif not state.get("skill_analysis"):
        return {"next_agent": "skill_gap"}
    elif not state.get("tailored_resume"):
        return {"next_agent": "resume_tailor"}
    elif not state.get("cover_letter"):
        return {"next_agent": "cover_letter"}
    return {"next_agent": "FINISH"}


EXPERIENCE_MAP = {
    "any": None,
    "entry": "no_experience,under_3_years_experience",
    "experienced": "more_than_3_years_experience",
}

def job_researcher_node(state: AgentState):
    print("🔍 Researcher: Searching JSearch for live listings...")

    if not RAPIDAPI_KEY:
        print("⚠️ RAPIDAPI_KEY is not set — skipping job search.")
        return {"job_descriptions": [], "research_attempted": True}

    query = state["target_role"]
    location = (state.get("location") or "").strip()
    if location:
        query = f"{query} in {location}"

    params = {"query": query, "page": "1", "num_pages": "1"}

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
            timeout=15,
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
    for item in job_results[:5]:
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
    jobs_text = "\n".join([f"- {j['title']}: {j['description']}" for j in state.get("job_descriptions", [])])

    prompt = f"""
    Analyze the skill gap.
    Resume: {state['base_resume']}
    Jobs: {jobs_text}
    Output a structured gap analysis and project recommendations.
    """
    response = invoke_with_retry(llm, prompt)
    return {"skill_analysis": response.content}


def resume_tailor_node(state: AgentState):
    print("📄 Resume Tailor: Rewriting...")
    jobs_text = "\n".join([f"- {j['title']}: {j['description']}" for j in state.get("job_descriptions", [])])

    prompt = f"""
    Rewrite this resume to match the target jobs. Use the gap analysis to emphasize transferable skills. DO NOT invent experience.

    Output ONLY the rewritten resume itself — no greeting, no explanation of your changes, no "Key Changes" section, no meta-commentary before or after. The output should be ready to copy directly into a document with no editing needed.

    If you notice something that looks like a date inconsistency, leave the original date exactly as given in the source resume — do not silently correct or annotate it.

    Resume: {state['base_resume']}
    Jobs: {jobs_text}
    Gap Analysis: {state.get('skill_analysis', '')}
    """
    response = invoke_with_retry(llm, prompt)
    return {"tailored_resume": response.content}


def cover_letter_node(state: AgentState):
    print("✍️ Cover Letter Agent: Drafting...")
    jobs = state.get("job_descriptions", [])
    target_job = jobs[0] if jobs else {"title": "Unknown", "company": "Unknown", "description": ""}

    prompt = f"""
    Write a 3-4 paragraph cover letter for this job using the tailored resume.

    Use the candidate's actual name, email, and phone number as they appear in the resume — never use placeholder text like "[Your Name]" or "[Your Email]". If a detail genuinely isn't available in the resume, omit it rather than inserting a bracketed placeholder.

    Output ONLY the cover letter itself — no explanation, no meta-commentary.
    Resume: {state.get('tailored_resume', '')}
    Target Job: {target_job}
    """
    response = invoke_with_retry(llm, prompt)
    return {"cover_letter": response.content}
