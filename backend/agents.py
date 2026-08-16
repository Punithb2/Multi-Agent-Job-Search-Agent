import os
import time
from dotenv import load_dotenv
from langchain_google_genai import ChatGoogleGenerativeAI
from langchain_tavily import TavilySearch
from google.api_core.exceptions import ResourceExhausted

# Import our blueprints from the state file
from state import AgentState, Route, JobExtraction

# Load API keys
load_dotenv()

# Initialize AI and Tools
llm = ChatGoogleGenerativeAI(
    model="gemini-2.5-flash",
    temperature=0.0
)
tavily_tool = TavilySearch(max_results=3)

def invoke_with_retry(chain, prompt, max_retries=3, base_delay=15):
    for attempt in range(max_retries):
        try:
            return chain.invoke(prompt)
        except ResourceExhausted as e:
            if attempt == max_retries - 1:
                raise
            wait = base_delay * (attempt + 1)
            print(f"⏳ Rate limited, retrying in {wait}s...")
            time.sleep(wait)

def supervisor_node(state: AgentState):
    print("👑 Supervisor: Routing workflow...")
    if not state.get("job_descriptions"):
        return {"next_agent": "researcher"}
    elif not state.get("skill_analysis"):
        return {"next_agent": "skill_gap"}
    elif not state.get("tailored_resume"):
        return {"next_agent": "resume_tailor"}
    elif not state.get("cover_letter"):
        return {"next_agent": "cover_letter"}
    return {"next_agent": "FINISH"}

def job_researcher_node(state: AgentState):
    print("🔍 Researcher: Scouring the web...")
    search_query = f"recent job openings and requirements for {state['target_role']}"
    raw_results = tavily_tool.invoke(search_query)
    print("🔎 RAW TAVILY OUTPUT:", raw_results)  # <-- add this line temporarily

    extractor = llm.with_structured_output(JobExtraction)
    prompt = f"""
    Extract the job listings from this raw web search data.
    For each listing, include the exact source 'url' field value from the search result it came from.
    Use 'Unknown' for company if missing. Use an empty string for url if genuinely no URL is present in the source data — never invent or guess a URL.
    Data: {raw_results}
    """
    structured_data = invoke_with_retry(extractor, prompt)
    print("📦 STRUCTURED JOBS:", structured_data.model_dump())  # <-- add this too
    return {"job_descriptions": [job.model_dump() for job in structured_data.jobs]}

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
    Resume: {state.get('tailored_resume', '')}
    Target Job: {target_job}
    """
    response = invoke_with_retry(llm, prompt)
    return {"cover_letter": response.content}