from __future__ import annotations

from typing import Any


MOCK_JOBS = [
    {
        "job_id": "mock-ml-001",
        "title": "Machine Learning Engineer",
        "company": "Acme AI Corp",
        "description": "Build, deploy, and monitor production ML models for personalization and forecasting. Work with Python, PyTorch, feature pipelines, and cloud infrastructure.",
        "url": "https://example.com/jobs/mock-ml-001",
        "location": "Bengaluru, India",
        "employment_type": "Full-time",
        "is_remote": False,
    },
    {
        "job_id": "mock-ai-002",
        "title": "AI Engineer",
        "company": "Nexus IT Group",
        "description": "Design LLM-powered assistants using prompt engineering, retrieval pipelines, vector databases, and evaluation workflows for enterprise use cases.",
        "url": "https://example.com/jobs/mock-ai-002",
        "location": "Remote",
        "employment_type": "Full-time",
        "is_remote": True,
    },
    {
        "job_id": "mock-ds-003",
        "title": "Data Scientist",
        "company": "InsightForge Analytics",
        "description": "Own experimentation, statistical analysis, and predictive modeling for product and growth teams. Strong SQL, Python, and communication skills required.",
        "url": "https://example.com/jobs/mock-ds-003",
        "location": "Hyderabad, India",
        "employment_type": "Full-time",
        "is_remote": False,
    },
    {
        "job_id": "mock-nlp-004",
        "title": "NLP Engineer",
        "company": "LexiMind Labs",
        "description": "Develop NLP pipelines for entity extraction, classification, semantic search, and LLM-based text workflows. Experience with transformers is preferred.",
        "url": "https://example.com/jobs/mock-nlp-004",
        "location": "Pune, India",
        "employment_type": "Full-time",
        "is_remote": False,
    },
    {
        "job_id": "mock-mle-005",
        "title": "Junior ML Engineer",
        "company": "BrightPath Systems",
        "description": "Support data preparation, model training, dashboard delivery, and ML experimentation. Great fit for candidates with strong project work and internship experience.",
        "url": "https://example.com/jobs/mock-mle-005",
        "location": "Chennai, India",
        "employment_type": "Full-time",
        "is_remote": False,
    },
    {
        "job_id": "mock-genai-006",
        "title": "Generative AI Developer",
        "company": "PromptStack",
        "description": "Build GenAI product features using agent workflows, tool calling, embeddings, and response evaluation. FastAPI and React experience are a plus.",
        "url": "https://example.com/jobs/mock-genai-006",
        "location": "Remote",
        "employment_type": "Contract",
        "is_remote": True,
    },
    {
        "job_id": "mock-de-007",
        "title": "Data Engineer",
        "company": "CloudRiver Tech",
        "description": "Create reliable ETL pipelines, warehouse models, and data quality checks. Looking for Python, SQL, orchestration, and cloud data platform experience.",
        "url": "https://example.com/jobs/mock-de-007",
        "location": "Mumbai, India",
        "employment_type": "Full-time",
        "is_remote": False,
    },
    {
        "job_id": "mock-cv-008",
        "title": "Computer Vision Engineer",
        "company": "VisionGrid Robotics",
        "description": "Ship computer vision models for detection, segmentation, and visual understanding in edge and robotics workflows. OpenCV and PyTorch required.",
        "url": "https://example.com/jobs/mock-cv-008",
        "location": "Bengaluru, India",
        "employment_type": "Full-time",
        "is_remote": False,
    },
    {
        "job_id": "mock-analyst-009",
        "title": "AI Research Analyst",
        "company": "SignalNorth Research",
        "description": "Track AI trends, benchmark models, summarize papers, and build lightweight prototypes to support product strategy and technical direction.",
        "url": "https://example.com/jobs/mock-analyst-009",
        "location": "Remote",
        "employment_type": "Internship",
        "is_remote": True,
    },
    {
        "job_id": "mock-fullstack-010",
        "title": "Full Stack AI Engineer",
        "company": "OrbitFlow",
        "description": "Own AI-powered product features across backend APIs, prompt orchestration, frontend UX, and deployment. Seeking strong Python and JavaScript fundamentals.",
        "url": "https://example.com/jobs/mock-fullstack-010",
        "location": "Delhi, India",
        "employment_type": "Full-time",
        "is_remote": False,
    },
]


def _tokenize(value: str) -> list[str]:
    return [token for token in value.lower().replace("/", " ").replace("-", " ").split() if token]


def get_mock_jobs(
    target_role: str,
    location: str = "",
    remote_only: bool = False,
    experience_level: str = "any",
    date_posted: str = "all",
) -> list[dict[str, Any]]:
    role_tokens = _tokenize(target_role)
    location_lower = (location or "").strip().lower()

    ranked_jobs = []
    for job in MOCK_JOBS:
        if remote_only and not job.get("is_remote"):
            continue
        if location_lower and location_lower not in job.get("location", "").lower():
            continue
        if experience_level == "entry" and "junior" not in job.get("title", "").lower() and job.get("employment_type") != "Internship":
            continue

        haystack = " ".join(
            [
                job.get("title", ""),
                job.get("company", ""),
                job.get("description", ""),
            ]
        ).lower()
        score = sum(3 for token in role_tokens if token in job.get("title", "").lower())
        score += sum(1 for token in role_tokens if token in haystack)
        if remote_only and job.get("is_remote"):
            score += 1
        if date_posted == "today":
            score += 1
        ranked_jobs.append((score, job))

    ranked_jobs.sort(key=lambda item: (-item[0], item[1]["title"], item[1]["company"]))
    jobs = [job for _, job in ranked_jobs]
    return jobs[:6] if jobs else MOCK_JOBS[:6]


def get_mock_analysis(action: str, selected_job: dict[str, Any]) -> str:
    title = selected_job.get("title", "the selected role")
    company = selected_job.get("company", "the company")
    location = selected_job.get("location", "the listed location")
    description = selected_job.get("description", "")

    if action == "skill_gap":
        return (
            f"## Skill Gap Analysis for {title} at {company}\n\n"
            f"**Role snapshot:** {description or 'This role focuses on applied AI and production delivery.'}\n\n"
            "**Likely strengths from your profile**\n"
            "- Python development and API work\n"
            "- Applied machine learning project experience\n"
            "- Building end-to-end prototypes with modern AI tooling\n\n"
            "**Likely gaps to close for this role**\n"
            "- Stronger production deployment stories with measurable results\n"
            "- More explicit experience with evaluation, monitoring, and model iteration\n"
            "- Clear examples of collaboration with product or business stakeholders\n\n"
            "**Recommended portfolio upgrades**\n"
            "1. Build one production-style project with logging, feedback capture, and evaluation metrics.\n"
            "2. Add one case study showing business impact, not just model accuracy.\n"
            f"3. Tailor examples toward {title} workflows relevant to {location} hiring expectations.\n"
        )

    if action == "resume_tailor":
        return (
            "## Punith B\n"
            f"**Target Role:** {title}\n\n"
            "**Professional Summary**\n"
            "AI/ML engineer with hands-on experience building intelligent applications using Python, FastAPI, machine learning pipelines, and generative AI workflows. Strong at turning experimental ideas into usable prototypes and presenting technical work clearly.\n\n"
            "**Relevant Strengths**\n"
            "- Python, FastAPI, REST APIs, data preprocessing\n"
            "- Machine learning model development and evaluation\n"
            "- LLM workflow prototyping, prompt design, and retrieval-based concepts\n"
            "- Frontend-backend integration for applied AI products\n\n"
            "**Selected Projects**\n"
            "- Built a job-search assistant that searches roles, analyzes fit, and generates job-specific application materials.\n"
            "- Developed AI-driven applications that connect model outputs to practical user workflows.\n"
            "- Created end-to-end ML/NLP prototypes with clear problem framing and iterative improvements.\n\n"
            f"**Tailoring Notes for {company}**\n"
            f"- Emphasize project outcomes that connect directly to {title} responsibilities.\n"
            "- Highlight measurable improvements, deployment readiness, and stakeholder value where possible.\n"
        )

    return (
        f"Dear Hiring Manager,\n\n"
        f"I am excited to apply for the {title} role at {company}. The position stands out to me because it combines applied AI problem-solving with real product impact, which closely matches the kind of work I have been building through my machine learning and software projects.\n\n"
        "My background includes developing AI-focused applications with Python, FastAPI, and modern ML workflows, along with translating technical ideas into usable tools. I enjoy working across the implementation lifecycle, from experimentation and data handling to backend integration and user-facing delivery.\n\n"
        f"I would welcome the opportunity to contribute this mindset to your team in {location}. I am especially interested in bringing a practical, product-oriented approach while continuing to grow in areas that matter most for the role.\n\n"
        "Thank you for your time and consideration. I look forward to the opportunity to discuss how I can contribute.\n\n"
        "Sincerely,\n"
        "Punith B"
    )
