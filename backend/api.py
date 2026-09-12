from fastapi import FastAPI, HTTPException, UploadFile, File, Form
from fastapi.middleware.cors import CORSMiddleware
import uvicorn
from pypdf import PdfReader
import asyncio
import io
import time
from agents import (
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
from mock_data import get_mock_analysis, get_mock_jobs

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

# --- mock mode flag ---
MOCK_MODE = os.getenv("MOCK_MODE", "false").lower() == "true"

print(f"CORS allowed origins: {ALLOWED_ORIGINS} (+ *.vercel.app previews)")


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
        "mock_mode": MOCK_MODE,
        "jsearch_configured": bool(os.getenv("RAPIDAPI_KEY")),
        "gemini_configured": bool(os.getenv("GOOGLE_API_KEY") or os.getenv("GEMINI_API_KEY")),
    }


@app.post("/api/search/start")
async def start_job_search(
    target_role: str = Form(..., min_length=2, max_length=100),
    resume_pdf: UploadFile = File(...),
    country: str = Form("in", min_length=2, max_length=2),
    location: str = Form(""),
    remote_only: bool = Form(False),
    experience_level: str = Form("any"),
    date_posted: str = Form("all"),
):
    try:
        print(f"\nAPI Triggered: Searching jobs for '{target_role}'")

        if "," in target_role or ";" in target_role:
            raise HTTPException(
                status_code=422,
                detail="Search one target role at a time for more relevant matches.",
            )

        country = country.strip().lower()
        if not re.fullmatch(r"[a-z]{2}", country):
            raise HTTPException(status_code=422, detail="Choose a valid two-letter country code.")

        # 1. VALIDATION: Check file type
        if resume_pdf.content_type != "application/pdf":
            raise HTTPException(status_code=400, detail="Invalid file type. Please upload a PDF.")

        # 2. READ: Load file into memory
        pdf_bytes = await resume_pdf.read()

        # 3. VALIDATION: Check file size (e.g., max 5MB to prevent memory overload)
        if len(pdf_bytes) > 5 * 1024 * 1024:
            raise HTTPException(status_code=413, detail="File too large. Maximum size is 5MB.")

        if len(pdf_bytes) == 0:
            raise HTTPException(status_code=400, detail="The uploaded PDF file is empty.")

        # 4. EXTRACTION: Parse the PDF
        pdf_file = io.BytesIO(pdf_bytes)
        reader = PdfReader(pdf_file)
        extracted_text = ""

        for page in reader.pages:
            text = page.extract_text()
            if text:
                extracted_text += text + "\n"

        # 5. VALIDATION: Check if extraction worked (fails on image-only scanned PDFs)
        extracted_text = extracted_text.strip()
        if not extracted_text:
            raise HTTPException(
                status_code=422,
                detail="Could not extract any text from the PDF. Please ensure it is a text-based PDF and not a scanned image.",
            )

        print(f"PDF text extracted successfully. ({len(extracted_text)} characters)")

        # 6. Setup the clipboard for LangGraph
        initial_state = {
            "base_resume": extracted_text,
            "target_role": target_role,
            "country": country,
            "location": location,
            "remote_only": remote_only,
            "experience_level": experience_level,
            "date_posted": date_posted,
        }

        # 7. Reading the resume and searching for jobs do not depend on each
        # other, so run them at the same time instead of one after the other.
        # Both are blocking network calls, so each goes to a worker thread.
        async def build_candidate_profile():
            if MOCK_MODE:
                return _fallback_candidate_profile(target_role), "fallback"
            try:
                profile = await asyncio.to_thread(extract_candidate_profile, extracted_text, target_role)
                return profile, "ai"
            except Exception as profile_error:
                print(f"Candidate profile extraction unavailable: {profile_error}")
                return _fallback_candidate_profile(target_role), "fallback"

        async def find_jobs():
            if MOCK_MODE:
                print("MOCK MODE: Returning sample job listings")
                return get_mock_jobs(
                    target_role=target_role,
                    location=location,
                    remote_only=remote_only,
                    experience_level=experience_level,
                    date_posted=date_posted,
                )
            result = await asyncio.to_thread(job_researcher_node, initial_state)
            return result.get("job_descriptions", [])

        stage_started = time.perf_counter()
        (candidate_profile, profile_mode), jobs = await asyncio.gather(
            build_candidate_profile(), find_jobs()
        )
        print(f"[timing] profile + job search (parallel): {time.perf_counter() - stage_started:.1f}s")

        ranking_started = time.perf_counter()
        ranked_jobs, ranking_mode = await asyncio.to_thread(
            rank_jobs_for_candidate,
            jobs,
            candidate_profile,
            target_role,
            not MOCK_MODE and profile_mode == "ai",
        )
        print(f"[timing] ranking ({ranking_mode}): {time.perf_counter() - ranking_started:.1f}s")

        print("API workflow complete.")

        return {
            "status": "success",
            "jobs_found": ranked_jobs,
            "ranking_mode": ranking_mode,
        }

    except HTTPException as http_exc:
        # If it's one of our custom errors, pass it directly to the frontend
        print(f"Validation error: {http_exc.detail}")
        raise http_exc
    except Exception as e:
        # Catch unexpected crashes gracefully
        print(f"Critical server error: {e}")
        raise HTTPException(status_code=500, detail="An unexpected error occurred on the server.")


@app.post("/api/jobs/analyze")
async def analyze_selected_job(
    action: str = Form(...),
    selected_job_json: str = Form(...),
    resume_pdf: UploadFile = File(...),
):
    """Generate requested material for exactly one selected listing."""
    import json

    if action not in {"skill_gap", "resume_tailor", "cover_letter"}:
        raise HTTPException(status_code=400, detail="Unsupported analysis action.")
    if resume_pdf.content_type != "application/pdf":
        raise HTTPException(status_code=400, detail="Invalid file type. Please upload a PDF.")

    try:
        selected_job = json.loads(selected_job_json)
        if not isinstance(selected_job, dict) or not selected_job.get("title"):
            raise ValueError
    except (json.JSONDecodeError, ValueError):
        raise HTTPException(status_code=400, detail="Choose a valid job listing before generating materials.")

    pdf_bytes = await resume_pdf.read()
    if len(pdf_bytes) > 5 * 1024 * 1024:
        raise HTTPException(status_code=413, detail="File too large. Maximum size is 5MB.")
    reader = PdfReader(io.BytesIO(pdf_bytes))
    resume_text = "\n".join(page.extract_text() or "" for page in reader.pages).strip()
    if not resume_text:
        raise HTTPException(status_code=422, detail="Could not extract text from the PDF resume.")

    state = {"base_resume": resume_text, "selected_job": selected_job}
    if MOCK_MODE:
        result = get_mock_analysis(action, selected_job)
        return {"status": "success", "action": action, "content": result}

    # Each click runs only its requested agent. Resume and letter can still be
    # generated independently, using the original resume and selected job.
    node = {"skill_gap": skill_gap_node, "resume_tailor": resume_tailor_node, "cover_letter": cover_letter_node}[action]
    result = node(state)
    field = {"skill_gap": "skill_analysis", "resume_tailor": "tailored_resume", "cover_letter": "cover_letter"}[action]
    return {"status": "success", "action": action, "content": result.get(field, "")}


if __name__ == "__main__":
    # Hosts such as Render inject the port to listen on, and require binding to
    # 0.0.0.0 rather than localhost so traffic from outside the container arrives.
    uvicorn.run(
        app,
        host=os.getenv("HOST", "0.0.0.0"),
        port=int(os.getenv("PORT", "8000")),
    )
