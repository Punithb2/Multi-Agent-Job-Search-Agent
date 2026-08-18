from fastapi import FastAPI, HTTPException, UploadFile, File, Form
from fastapi.middleware.cors import CORSMiddleware
import uvicorn
from pypdf import PdfReader
import io
from agents import job_researcher_node, skill_gap_node, resume_tailor_node, cover_letter_node
import os
from mock_data import get_mock_analysis, get_mock_jobs

# 1. Initialize the API
app = FastAPI(title="Job Search AI Backend")

# 2. Configure CORS so React can talk to this API
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],  # The default port for Vite/React
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- mock mode flag ---
MOCK_MODE = os.getenv("MOCK_MODE", "false").lower() == "true"


# 3. Define Endpoints
@app.get("/")
def read_root():
    return {"message": "Job Search AI API is running!"}


@app.post("/api/search/start")
async def start_job_search(
    target_role: str = Form(..., min_length=2, max_length=100),
    resume_pdf: UploadFile = File(...),
    location: str = Form(""),
    remote_only: bool = Form(False),
    experience_level: str = Form("any"),
    date_posted: str = Form("all"),
):
    try:
        print(f"\nAPI Triggered: Searching jobs for '{target_role}'")

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
            "location": location,
            "remote_only": remote_only,
            "experience_level": experience_level,
            "date_posted": date_posted,
        }

        # 7. Search only. Analysis is run later for the one job the user selects.
        if MOCK_MODE:
            print("MOCK MODE: Returning sample job listings")
            jobs = get_mock_jobs(
                target_role=target_role,
                location=location,
                remote_only=remote_only,
                experience_level=experience_level,
                date_posted=date_posted,
            )
        else:
            jobs = job_researcher_node(initial_state).get("job_descriptions", [])

        print("API workflow complete.")

        return {
            "status": "success",
            "jobs_found": jobs,
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
    uvicorn.run(app, host="localhost", port=8000)
