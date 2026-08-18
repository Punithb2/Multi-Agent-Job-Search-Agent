from fastapi import FastAPI, HTTPException, UploadFile, File, Form
from fastapi.middleware.cors import CORSMiddleware
import uvicorn
from pypdf import PdfReader
import io
from state import JobSearchRequest
from graph import workflow_app
import os

# 1. Initialize the API
app = FastAPI(title="Job Search AI Backend")

# 2. Configure CORS so React can talk to this API
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"], # The default port for Vite/React
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- mock mode flag + sample data ---
MOCK_MODE = os.getenv("MOCK_MODE", "false").lower() == "true"

MOCK_FINAL_STATE = {
    "job_descriptions": [
        {
            "title": "Machine Learning Engineer",
            "company": "Acme AI Corp",
            "description": "Build and deploy ML models at scale. Work with PyTorch, TensorFlow, and cloud infra.",
            "url": "https://example.com/jobs/ml-engineer-acme"
        },
        {
            "title": "AI Engineer",
            "company": "Nexus IT Group",
            "description": "Design conversational AI systems using LLMs and vector search.",
            "url": "https://example.com/jobs/ai-engineer-nexus"
        }
    ],
    "skill_analysis": "## Skill Gap Analysis\n\n**Strengths:** Python, FastAPI, PyTorch\n\n**Gaps:** LLM APIs, vector databases, prompt engineering\n\n### Recommended Projects\n1. Build a RAG chatbot\n2. Fine-tune an open-source LLM",
    "tailored_resume": "## Punith B\n**AI/ML Engineer**\n\nExperienced in building end-to-end ML pipelines...\n\n### Projects\n- OMNIMESH AI: 2D sketch to 3D reconstruction\n- RESUMIZER: NLP resume classifier",
    "cover_letter": "Dear Hiring Manager,\n\nI am writing to express interest in the AI Engineer role...\n\nSincerely,\nPunith B"
}

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
        print(f"\n🚀 API Triggered: Starting workflow for '{target_role}'")
        
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
            if text:  # Only add if text isn't None
                extracted_text += text + "\n"
        
        # 5. VALIDATION: Check if extraction worked (fails on image-only scanned PDFs)
        extracted_text = extracted_text.strip()
        if not extracted_text:
            raise HTTPException(
                status_code=422, 
                detail="Could not extract any text from the PDF. Please ensure it is a text-based PDF and not a scanned image."
            )
            
        print(f"📄 PDF Text Extracted successfully. ({len(extracted_text)} characters)")
        
        # 6. Setup the clipboard for LangGraph
        initial_state = {
            "base_resume": extracted_text,
            "target_role": target_role,
            "location": location,
            "remote_only": remote_only,
            "experience_level": experience_level,
            "date_posted": date_posted,
        }
        
        # 7. Execute the LangGraph workflow
        if MOCK_MODE:
          print("🧪 MOCK MODE: Skipping real agent workflow, returning sample data")
          final_state = MOCK_FINAL_STATE
        else:
          final_state = await workflow_app.ainvoke(initial_state)
        
        print("✅ API Workflow Complete!")
        
        return {
            "status": "success",
            "jobs_found": final_state.get("job_descriptions", []),
            "skill_gap_analysis": final_state.get("skill_analysis", ""),
            "tailored_resume": final_state.get("tailored_resume", ""),
            "cover_letter": final_state.get("cover_letter", "")
        }
        
    except HTTPException as http_exc:
        # If it's one of our custom errors, pass it directly to the frontend
        print(f"⚠️ Validation Error: {http_exc.detail}")
        raise http_exc
    except Exception as e:
        # Catch unexpected crashes gracefully
        print(f"❌ Critical Server Error: {e}")
        raise HTTPException(status_code=500, detail="An unexpected error occurred on the server.")

if __name__ == "__main__":
    uvicorn.run(app, host="localhost", port=8000)