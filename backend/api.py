from fastapi import Depends, FastAPI, File, Form, HTTPException, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
import uvicorn
from pypdf import PdfReader
import asyncio
import io
import json
import time
from agents import (
    JobSearchUnavailable,
    job_researcher_node,
    skill_gap_node,
    resume_tailor_node,
    cover_letter_node,
    extract_candidate_profile,
    rank_jobs_for_candidate,
    _fallback_candidate_profile,
)
import os
import re
from job_extract import UNREADABLE, ExtractionError, extract_job_from_url
from resume_changes import compare_resumes
from resume_style import extract_resume_style
from security import (
    AUTH_CONFIGURED,
    BUDGET_MESSAGES,
    DailyBudgetExceeded,
    client_ip,
    enforce_rate_limit,
    jsearch_budget,
    require_user,
)

# 1. Initialize the API
app = FastAPI(title="Job Search AI Backend")

# 2. Configure CORS so the React app can talk to this API.
#
# Local development always works. Production origins come from the
# FRONTEND_ORIGINS environment variable, set on the host (Render) to the
# deployed Vercel URL. Use a comma-separated list for more than one, e.g.
#   FRONTEND_ORIGINS=https://career-atlas.vercel.app,https://careeratlas.dev
DEFAULT_ORIGINS = ["http://localhost:5173", "http://127.0.0.1:5173"]
configured_origins = [
    origin.strip().rstrip("/")
    for origin in os.getenv("FRONTEND_ORIGINS", "").split(",")
    if origin.strip()
]
ALLOWED_ORIGINS = DEFAULT_ORIGINS + configured_origins

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    # Vercel gives every deployment a unique preview URL, so allow those too.
    allow_origin_regex=r"https://.*\.vercel\.app",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

MAX_JOB_JSON_CHARS = 60_000
MAX_DESCRIPTION_CHARS = 15_000
MAX_RESUME_BYTES = 5 * 1024 * 1024
MAX_TAILORED_RESUME_CHARS = 40_000
MAX_RESULT_PAGE = 10

print(f"CORS allowed origins: {ALLOWED_ORIGINS} (+ *.vercel.app previews)")


SEARCH_UNAVAILABLE = "The job listings service didn't respond in time. Please try again in a moment."


def budget_error(error: DailyBudgetExceeded) -> HTTPException:
    return HTTPException(status_code=429, detail=BUDGET_MESSAGES.get(error.service, "Daily limit reached. Please try again tomorrow."))


async def read_resume(resume_pdf: UploadFile) -> tuple[bytes, str]:
    """Validate an uploaded resume and return its bytes and extracted text."""
    if resume_pdf.content_type != "application/pdf":
        raise HTTPException(status_code=400, detail="Invalid file type. Please upload a PDF.")
    pdf_bytes = await resume_pdf.read()
    if len(pdf_bytes) > MAX_RESUME_BYTES:
        raise HTTPException(status_code=413, detail="File too large. Maximum size is 5MB.")
    if not pdf_bytes:
        raise HTTPException(status_code=400, detail="The uploaded PDF file is empty.")
    try:
        reader = PdfReader(io.BytesIO(pdf_bytes))
        text = "\n".join(page.extract_text() or "" for page in reader.pages).strip()
    except Exception:
        raise HTTPException(status_code=422, detail="That PDF could not be read. Please upload a different file.")
    if not text:
        raise HTTPException(
            status_code=422,
            detail="Could not extract any text from the PDF. Please ensure it is a text-based PDF and not a scanned image.",
        )
    return pdf_bytes, text


# 3. Define Endpoints
@app.get("/")
def read_root():
    return {"message": "Job Search AI API is running!"}


@app.get("/health")
def health_check():
    """Cheap liveness probe.

    Used by the host's health check, by uptime monitors, and by the frontend on
    load to wake a free-tier instance that has spun down.
    """
    return {
        "status": "ok",
        "jsearch_configured": bool(os.getenv("RAPIDAPI_KEY")),
        "gemini_configured": bool(os.getenv("GOOGLE_API_KEY") or os.getenv("GEMINI_API_KEY")),
        "auth_configured": AUTH_CONFIGURED,
    }


@app.post("/api/search/start")
async def start_job_search(
    request: Request,
    target_role: str = Form(..., min_length=2, max_length=100),
    resume_pdf: UploadFile = File(...),
    country: str = Form("in", min_length=2, max_length=2),
    location: str = Form("", max_length=100),
    remote_only: bool = Form(False),
    experience_level: str = Form("any"),
    date_posted: str = Form("all"),
):
    try:
        # Searching stays open to guests, so the caller's IP is what gets limited.
        enforce_rate_limit("search", client_ip(request))
        print(f"\nAPI Triggered: Searching jobs for '{target_role}'")

        if "," in target_role or ";" in target_role:
            raise HTTPException(
                status_code=422,
                detail="Search one target role at a time for more relevant matches.",
            )

        country = country.strip().lower()
        if not re.fullmatch(r"[a-z]{2}", country):
            raise HTTPException(status_code=422, detail="Choose a valid two-letter country code.")

        _, extracted_text = await read_resume(resume_pdf)
        print(f"PDF text extracted successfully. ({len(extracted_text)} characters)")

        # Fail before spending a Gemini request on the profile if the search itself
        # cannot run today.
        if jsearch_budget.remaining() <= 0:
            raise DailyBudgetExceeded("JSearch")

        initial_state = {
            "base_resume": extracted_text,
            "target_role": target_role,
            "country": country,
            "location": location,
            "remote_only": remote_only,
            "experience_level": experience_level,
            "date_posted": date_posted,
        }

        # Reading the resume and searching for jobs do not depend on each other,
        # so run them at the same time instead of one after the other. Both are
        # blocking network calls, so each goes to a worker thread.
        async def build_candidate_profile():
            try:
                profile = await asyncio.to_thread(extract_candidate_profile, extracted_text, target_role)
                return profile, "ai"
            except Exception as profile_error:
                print(f"Candidate profile extraction unavailable: {profile_error}")
                return _fallback_candidate_profile(target_role), "fallback"

        async def find_jobs():
            result = await asyncio.to_thread(job_researcher_node, initial_state)
            return result.get("job_descriptions", [])

        stage_started = time.perf_counter()
        (candidate_profile, profile_mode), jobs = await asyncio.gather(
            build_candidate_profile(), find_jobs()
        )
        print(f"[timing] profile + job search (parallel): {time.perf_counter() - stage_started:.1f}s")

        # The experience filter the user picked outranks what was inferred from the
        # resume, so an entry-level search keeps senior roles out of the results.
        if experience_level == "entry":
            candidate_profile = {**candidate_profile, "experience_level": "entry"}

        ranking_started = time.perf_counter()
        ranked_jobs, ranking_mode = await asyncio.to_thread(
            rank_jobs_for_candidate,
            jobs,
            candidate_profile,
            target_role,
            profile_mode == "ai",
        )
        print(f"[timing] ranking ({ranking_mode}): {time.perf_counter() - ranking_started:.1f}s")
        print("API workflow complete.")

        return {
            "status": "success",
            "jobs_found": ranked_jobs,
            "ranking_mode": ranking_mode,
            # Returned so "Load more" can rank further pages against the same
            # profile without reading the resume (and calling Gemini) again.
            "candidate_profile": candidate_profile,
            "profile_mode": profile_mode,
            "has_more": len(jobs) > 0,
        }

    except HTTPException as http_exc:
        print(f"Validation error: {http_exc.detail}")
        raise http_exc
    except DailyBudgetExceeded as error:
        raise budget_error(error)
    except JobSearchUnavailable:
        raise HTTPException(status_code=503, detail=SEARCH_UNAVAILABLE)
    except Exception as e:
        print(f"Critical server error: {e}")
        raise HTTPException(status_code=500, detail="An unexpected error occurred on the server.")


class MoreJobsRequest(BaseModel):
    target_role: str = Field(min_length=2, max_length=100)
    country: str = Field(default="in", min_length=2, max_length=2)
    location: str = Field(default="", max_length=100)
    remote_only: bool = False
    experience_level: str = Field(default="any", max_length=20)
    date_posted: str = Field(default="all", max_length=20)
    page: int = Field(ge=2, le=MAX_RESULT_PAGE)
    profile: dict = Field(default_factory=dict)
    profile_mode: str = Field(default="fallback", max_length=20)
    exclude_ids: list[str] = Field(default_factory=list, max_length=300)


def _clean_profile(profile: dict, target_role: str) -> dict:
    """Keep only the profile fields ranking uses, bounded in size.

    The profile comes back from the browser, so it is treated as untrusted input
    that will be placed in a prompt.
    """
    def text_list(values, limit):
        return [str(value)[:80] for value in (values if isinstance(values, list) else []) if isinstance(value, (str, int, float))][:limit]

    skills = []
    for skill in profile.get("skills", []) if isinstance(profile.get("skills"), list) else []:
        if isinstance(skill, dict) and skill.get("name"):
            skills.append({key: str(skill.get(key, ""))[:160] for key in ("name", "category", "evidence")})
    cleaned = {
        "candidate_titles": text_list(profile.get("candidate_titles"), 6) or [target_role],
        "skills": skills[:40],
        "experience_level": str(profile.get("experience_level", "unknown"))[:20].lower(),
        "industries": text_list(profile.get("industries"), 10),
        "summary": str(profile.get("summary", ""))[:600],
    }
    return cleaned


@app.post("/api/search/more")
async def load_more_jobs(request: Request, body: MoreJobsRequest):
    """The next page of results for a search, ranked against the same profile."""
    enforce_rate_limit("search", client_ip(request))
    country = body.country.strip().lower()
    if not re.fullmatch(r"[a-z]{2}", country):
        raise HTTPException(status_code=422, detail="Choose a valid two-letter country code.")

    state = {
        "base_resume": "",
        "target_role": body.target_role,
        "country": country,
        "location": body.location,
        "remote_only": body.remote_only,
        "experience_level": body.experience_level,
        "date_posted": body.date_posted,
        "page": body.page,
    }
    profile = _clean_profile(body.profile, body.target_role)
    if body.experience_level == "entry":
        profile["experience_level"] = "entry"

    try:
        result = await asyncio.to_thread(job_researcher_node, state)
        exclude = {job_id[:600] for job_id in body.exclude_ids}
        jobs = [job for job in result.get("job_descriptions", []) if (job.get("job_id") or job.get("url")) not in exclude]
        ranked, ranking_mode = await asyncio.to_thread(
            rank_jobs_for_candidate, jobs, profile, body.target_role, body.profile_mode == "ai" and bool(jobs)
        )
    except DailyBudgetExceeded as error:
        raise budget_error(error)
    except JobSearchUnavailable:
        # Not "no more results": the frontend keeps Load more available to retry.
        raise HTTPException(status_code=503, detail=SEARCH_UNAVAILABLE)

    print(f"Load more: page {body.page} -> {len(ranked)} new jobs")
    return {
        "status": "success",
        "jobs_found": ranked,
        "ranking_mode": ranking_mode,
        "has_more": bool(result.get("job_descriptions")) and body.page < MAX_RESULT_PAGE,
    }


@app.post("/api/jobs/analyze")
async def analyze_selected_job(
    action: str = Form(...),
    selected_job_json: str = Form(...),
    resume_pdf: UploadFile = File(...),
    user_id: str = Depends(require_user),
):
    """Generate requested material for exactly one selected listing."""
    enforce_rate_limit("generate", user_id)

    if action not in {"skill_gap", "resume_tailor", "cover_letter"}:
        raise HTTPException(status_code=400, detail="Unsupported analysis action.")

    # Jobs pasted in by the user are unbounded, and every node puts the whole job
    # into its prompt, so cap the payload before it reaches Gemini.
    if len(selected_job_json) > MAX_JOB_JSON_CHARS:
        raise HTTPException(status_code=413, detail="That job description is too long. Trim it and try again.")

    try:
        selected_job = json.loads(selected_job_json)
        if not isinstance(selected_job, dict) or not selected_job.get("title"):
            raise ValueError
    except (json.JSONDecodeError, ValueError):
        raise HTTPException(status_code=400, detail="Choose a valid job listing before generating materials.")

    if isinstance(selected_job.get("description"), str):
        selected_job["description"] = selected_job["description"][:MAX_DESCRIPTION_CHARS]

    pdf_bytes, resume_text = await read_resume(resume_pdf)

    # The resume and cover letter are rebuilt as PDFs in the candidate's own
    # styling, so read it from the uploaded file. No AI request is involved, and a
    # PDF that cannot be read simply gets the default styling.
    style = None
    if action in ("resume_tailor", "cover_letter"):
        try:
            style = extract_resume_style(pdf_bytes)
        except Exception as style_error:
            print(f"Resume style could not be read: {style_error}")

    state = {"base_resume": resume_text, "selected_job": selected_job}

    # Each click runs only its requested agent, in a worker thread so a slow Gemini
    # call does not hold up every other request to the server.
    node = {"skill_gap": skill_gap_node, "resume_tailor": resume_tailor_node, "cover_letter": cover_letter_node}[action]
    try:
        result = await asyncio.to_thread(node, state)
    except DailyBudgetExceeded as error:
        raise budget_error(error)
    field = {"skill_gap": "skill_analysis", "resume_tailor": "tailored_resume", "cover_letter": "cover_letter"}[action]
    content = result.get(field, "")

    response = {"status": "success", "action": action, "content": content, "style": style}
    if action == "resume_tailor" and content:
        # Every difference from the uploaded resume, so the candidate can check it.
        response["changes"] = compare_resumes(resume_text, content)
    return response


@app.post("/api/resume/compare")
async def compare_tailored_resume(
    resume_pdf: UploadFile = File(...),
    tailored_resume: str = Form(..., max_length=MAX_TAILORED_RESUME_CHARS),
    user_id: str = Depends(require_user),
):
    """Re-check a tailored resume against the original, e.g. after edits. No AI involved."""
    enforce_rate_limit("compare", user_id)
    _, resume_text = await read_resume(resume_pdf)
    return {"status": "success", "changes": compare_resumes(resume_text, tailored_resume)}


@app.post("/api/jobs/extract")
async def extract_job_details(
    url: str = Form(..., max_length=2048),
    user_id: str = Depends(require_user),
):
    """Read a job posting from a link the user found on another site."""
    enforce_rate_limit("extract", user_id)
    try:
        job = await asyncio.to_thread(extract_job_from_url, url)
    except ExtractionError as error:
        raise HTTPException(status_code=422, detail=str(error))
    except DailyBudgetExceeded as error:
        raise budget_error(error)
    except Exception as error:
        print(f"Job extraction failed: {error}")
        raise HTTPException(status_code=422, detail=UNREADABLE)
    print(f"Extracted job '{job['title']}' via {job['extraction']}")
    return {"status": "success", "job": job}


if __name__ == "__main__":
    # Hosts such as Render inject the port to listen on, and require binding to
    # 0.0.0.0 rather than localhost so traffic from outside the container arrives.
    uvicorn.run(
        app,
        host=os.getenv("HOST", "0.0.0.0"),
        port=int(os.getenv("PORT", "8000")),
    )
