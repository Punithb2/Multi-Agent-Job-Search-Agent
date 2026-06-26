from fastapi import FastAPI, HTTPException, UploadFile, File, Form
from fastapi.middleware.cors import CORSMiddleware
import uvicorn
from pypdf import PdfReader
import io
from state import JobSearchRequest
from graph import workflow_app

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

# 3. Define Endpoints
@app.get("/")
def read_root():
    return {"message": "Job Search AI API is running!"}

@app.post("/api/search/start")
async def start_job_search(
    target_role: str = Form(...),
    resume_pdf: UploadFile = File(...)
):
    try:
        print(f"\n🚀 API Triggered: Starting workflow for {target_role}")
        
        # 1. Read the PDF file directly from the incoming web request
        pdf_bytes = await resume_pdf.read()
        pdf_file = io.BytesIO(pdf_bytes)
        
        # 2. Extract the text from the PDF pages
        reader = PdfReader(pdf_file)
        extracted_text = ""
        for page in reader.pages:
            extracted_text += page.extract_text() + "\n"
            
        print("📄 PDF Text Extracted successfully.")
        
        # 3. Setup the clipboard for LangGraph
        initial_state = {
            "base_resume": extracted_text,
            "target_role": target_role
        }
        
        # 4. Execute the LangGraph workflow
        final_state = workflow_app.invoke(initial_state)
        
        print("✅ API Workflow Complete!")
        
        return {
            "status": "success",
            "jobs_found": final_state.get("job_descriptions", []),
            "skill_gap_analysis": final_state.get("skill_analysis", ""),
            "tailored_resume": final_state.get("tailored_resume", ""),
            "cover_letter": final_state.get("cover_letter", "")
        }
        
    except Exception as e:
        print(f"❌ Error during workflow execution: {e}")
        raise HTTPException(status_code=500, detail=str(e))

if __name__ == "__main__":
    uvicorn.run(app, host="localhost", port=8000)