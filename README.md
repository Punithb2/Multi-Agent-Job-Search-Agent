# AI Multi-Agent Job Search Assistant

This repository contains a **FastAPI (backend)** + **React/Vite (frontend)** application for an AI-powered Job Search Assistant. It utilizes **LangGraph** to orchestrate a multi-agent workflow (Supervisor, Job Researcher, Skill Gap Advisor, Resume Tailor, and Cover Letter Writer) powered by the **Google Gemini API** and live web scraping via the **Tavily API**.

## Prerequisites (Install/Gather these first)

- **Git**
- **VS Code** (or your preferred IDE)
- **Python 3.10+** (recommended)
- **Node.js 18+** (recommended) and npm

*Required API Keys:*
- **Google Gemini API Key:** Get it free from [Google AI Studio](https://aistudio.google.com/)
- **Tavily Search API Key:** Get it free from [Tavily](https://tavily.com/)

---

## 1) Clone and open in VS Code

```bash
git clone <your-github-repo-url>
cd Multi-Agent-Job-Search
code .
```
(Note: Replace <your-github-repo-url> with your actual repository link once uploaded).

## 2) Backend (FastAPI) Setup — Terminal 1

Open Terminal 1 in VS Code.

### 2.1 Go to the backend directory
```bash
cd backend
```

### 2.2 Create and activate the virtual environment

**Windows (PowerShell / CMD):**
```bash
python -m venv venv
venv\Scripts\activate
```

**macOS / Linux:**
```bash
python3 -m venv venv
source venv/bin/activate
```

### 2.3 Install dependencies
```bash
pip install -r requirements.txt
```

### 2.4 Configure Environment Variables (IMPORTANT)

This project uses environment variables to keep your API keys secure. You must create a local .env file before running the server.

Copy the provided template file:

**Windows:**
```bash
copy .env.example .env
```

**macOS / Linux:**
```bash
cp .env.example .env
```

Open the newly created .env file in VS Code and update it with your actual GOOGLE_API_KEY and TAVILY_API_KEY.

## 3) Start Backend Server

With the virtual environment activated in backend, start the FastAPI server:

```bash
python api.py
```

The backend API should now be running. You can view the interactive API documentation at: http://localhost:8000/docs

## 4) Frontend (React) Setup — Terminal 2

Open Terminal 2 in VS Code.

### 4.1 Go to the frontend directory
```bash
cd frontend
```

### 4.2 Install dependencies
```bash
npm install
```

### 4.3 Start the frontend dev server
```bash
npm run dev
```

Open the URL printed in the terminal (commonly):

http://localhost:5173/

## 5) Common Fixes / Troubleshooting

### A) "429 RESOURCE_EXHAUSTED" Error (Gemini API)

If the backend crashes with a 429 error, you have hit the free-tier rate limit for the Gemini API (usually 15 requests per minute).

**Fix:** Wait 60 seconds and click the "Analyze & Tailor" button in the frontend again.

### B) CORS issues (Frontend cannot call backend)

If your React app is stuck loading or shows a Network Error:

- Ensure the FastAPI server is actively running in Terminal 1.
- Check backend/api.py to ensure http://localhost:5173 is listed in the CORSMiddleware allowed origins.

### C) File Upload Errors

If the PDF text isn't extracting properly:

- Ensure you are uploading a standard, text-based PDF (not an image-only scanned document).
- Verify that pypdf is installed in your backend virtual environment.

### D) Running the app in a new terminal later

Every time you restart your machine or reopen VS Code, you must reactivate both servers:

- **Backend Server:** cd backend -> Activate venv -> python api.py
- **Frontend Server:** cd frontend -> npm run dev
