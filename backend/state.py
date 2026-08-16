from typing import TypedDict, List, Literal
from pydantic import BaseModel

# 1. The LangGraph Shared Memory
class AgentState(TypedDict):
    base_resume: str
    target_role: str
    job_descriptions: List[dict]
    skill_analysis: str
    tailored_resume: str
    cover_letter: str
    next_agent: str

# 2. Supervisor Routing Options
class Route(BaseModel):
    next_agent: Literal["researcher", "skill_gap", "resume_tailor", "cover_letter", "FINISH"]

# 3. Web Scraping Extraction Models
class JobListing(BaseModel):
    title: str
    company: str
    description: str
    url: str

class JobExtraction(BaseModel):
    jobs: List[JobListing]

# 4. FastAPI Incoming Request Model
class JobSearchRequest(BaseModel):
    base_resume: str
    target_role: str