from typing import TypedDict, List, Literal
from pydantic import BaseModel

# 1. The LangGraph Shared Memory
class AgentState(TypedDict):
    base_resume: str
    target_role: str
    location: str
    remote_only: bool
    experience_level: str
    date_posted: str
    job_descriptions: List[dict]
    selected_job: dict
    research_attempted: bool
    skill_analysis: str
    tailored_resume: str
    cover_letter: str
    next_agent: str

# 2. Supervisor Routing Options
class Route(BaseModel):
    next_agent: Literal["researcher", "skill_gap", "resume_tailor", "cover_letter", "FINISH"]

# 3. Web Scraping Extraction Models
class JobListing(BaseModel):
    job_id: str = ""
    title: str
    company: str
    description: str
    url: str = ""
    location: str = ""
    employment_type: str = ""

# 4. FastAPI Incoming Request Model
class JobSearchRequest(BaseModel):
    base_resume: str
    target_role: str
