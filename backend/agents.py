import os
from dotenv import load_dotenv
from langchain_google_genai import ChatGoogleGenerativeAI
from langchain_tavily import TavilySearch

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

def supervisor_node(state: AgentState):
    print("👑 Supervisor: Routing workflow...")
    jobs_exist = bool(state.get("job_descriptions"))
    skills_exist = bool(state.get("skill_analysis"))
    resume_exists = bool(state.get("tailored_resume"))
    cover_exists = bool(state.get("cover_letter"))
    
    prompt = f"""
    You are the Supervisor. Route the workflow.
    Jobs found: {jobs_exist} | Skill gap analyzed: {skills_exist} | Resume tailored: {resume_exists} | Cover letter written: {cover_exists}
    
    Rules:
    1. If Jobs found is False -> 'researcher'
    2. If Skill gap analyzed is False -> 'skill_gap'
    3. If Resume tailored is False -> 'resume_tailor'
    4. If Cover letter written is False -> 'cover_letter'
    5. If all are True -> 'FINISH'
    """
    router = llm.with_structured_output(Route)
    decision = router.invoke(prompt)
    return {"next_agent": decision.next_agent}

def job_researcher_node(state: AgentState):
    print("🔍 Researcher: Scouring the web...")
    search_query = f"recent job descriptions and requirements for {state['target_role']}"
    raw_results = tavily_tool.invoke(search_query)
    
    extractor = llm.with_structured_output(JobExtraction)
    prompt = f"Extract the job listings from this raw web data. Use 'Unknown' if company is missing. Data: {raw_results}"
    structured_data = extractor.invoke(prompt)
    
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
    response = llm.invoke(prompt)
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
    response = llm.invoke(prompt)
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
    response = llm.invoke(prompt)
    return {"cover_letter": response.content}