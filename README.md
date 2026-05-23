# BugLens 🐛🔍

> An advanced, AI-powered platform for automated code reviews, PR analysis, and repository-wide Q&A.

**BugLens** acts as your personal Staff-Level AI Code Reviewer. By seamlessly integrating with GitHub and utilizing state-of-the-art LLMs (Gemini, OpenAI, Claude), BugLens analyzes pull requests, flags bugs, highlights security vulnerabilities, suggests performance optimizations, and provides an interactive chat interface to let you "talk" to your codebase.

---

## 🌟 Key Features

* **Multi-Model AI Reviews**: Dynamic switching between LLMs (Gemini, OpenAI, Claude) for code analysis.
* **Automated GitHub PR Importer & Webhooks**: Directly import a PR URL or set up webhooks to automatically review GitHub Pull Requests as they are opened.
* **Repository Q&A (RAG)**: Ingest entire repositories into a local vector database (ChromaDB) and chat with your codebase using Retrieval-Augmented Generation.
* **Multi-Tenant Credentials**: Bring your own keys! Users can override system API keys securely in the dashboard for localized usage.
* **Real-time Streaming**: Utilizes Server-Sent Events (SSE) to stream live LLM analysis tokens directly to the frontend.
* **Premium Dashboard UI**: Built with React, TailwindCSS, and shadcn/ui components, featuring dark mode, code syntax highlighting, and an intuitive layout.

---

## 🛠️ Technology Stack

### **Frontend**
* **Framework**: React via [TanStack Start](https://tanstack.com/start) & [Vite](https://vitejs.dev/)
* **Styling**: TailwindCSS & [shadcn/ui](https://ui.shadcn.com/)
* **Auth**: Firebase Authentication (Google, GitHub, Email/Password)
* **Deployment**: Cloudflare Pages / Workers

### **Backend**
* **Framework**: Python 3 & [FastAPI](https://fastapi.tiangolo.com/)
* **Database**: MongoDB (async storage) & ChromaDB (Vector database)
* **AI Tooling**: `google-generativeai`, `openai`, `anthropic`, custom prompt engineering.
* **Auth Verification**: Firebase Admin SDK

---

## 📂 Project Structure

```text
buglens/
├── frontend/               # React / Vite frontend application
│   ├── src/                # Components, Pages, Context, Hooks
│   ├── package.json        # Node dependencies
│   └── wrangler.jsonc      # Cloudflare deployment config
├── backend/                # FastAPI backend application
│   ├── app/
│   │   ├── api/            # Route endpoints (reviews, chat, webhooks, etc.)
│   │   ├── core/           # Firebase, Config, and Prompts
│   │   ├── db/             # MongoDB connection logic
│   │   ├── schemas/        # Pydantic validation models
│   │   └── services/       # LLM Factory, GitHub Service, RAG Service, Embeddings
│   ├── main.py             # FastAPI application entry point
│   └── requirements.txt    # Python dependencies
└── README.md               # You are here
```

---

## 🚀 Getting Started (Local Development)

### Prerequisites
* **Node.js** (v18+)
* **Python** (v3.10+)
* **MongoDB** (Local instance or MongoDB Atlas)
* **Firebase Project** (Client Config & Admin Service Account JSON)

### 1. Backend Setup

1. **Navigate to backend and create a virtual environment**:
   ```bash
   cd backend
   python -m venv venv
   source venv/bin/activate  # On Windows: .\venv\Scripts\activate
   ```

2. **Install dependencies**:
   ```bash
   pip install -r requirements.txt
   ```

3. **Configure Environment Variables**:
   Create a `.env` file in the `backend/` directory (DO NOT commit this file):
   ```ini
   # Firebase Admin SDK Credentials
   FIREBASE_SERVICE_ACCOUNT_JSON={"type": "service_account", ...}
   
   # MongoDB Connection
   MONGODB_URL="mongodb+srv://..."
   
   # System Fallback AI Keys
   GEMINI_API_KEY="AIzaSy..."
   OPENAI_API_KEY="sk-proj-..."
   ```

4. **Run the FastAPI server**:
   ```bash
   uvicorn app.main:app --reload --port 8000
   ```

### 2. Frontend Setup

1. **Navigate to the frontend**:
   ```bash
   cd frontend
   ```

2. **Install dependencies**:
   ```bash
   npm install
   ```

3. **Configure Environment Variables**:
   Create a `.env.local` file in the `frontend/` directory (DO NOT commit this file):
   ```ini
   # Firebase Client Config
   VITE_FIREBASE_API_KEY="..."
   VITE_FIREBASE_AUTH_DOMAIN="..."
   VITE_FIREBASE_PROJECT_ID="..."
   VITE_FIREBASE_STORAGE_BUCKET="..."
   VITE_FIREBASE_MESSAGING_SENDER_ID="..."
   VITE_FIREBASE_APP_ID="..."

   # Backend Connection
   VITE_API_URL="http://localhost:8000/api/v1"
   VITE_BACKEND_URL="http://localhost:8000"
   ```

4. **Start the development server**:
   ```bash
   npm run dev
   ```

---

## ☁️ Deployment

### Frontend (Cloudflare)
The frontend is optimized to be deployed on Cloudflare Pages or Workers.
1. Connect your repository to Cloudflare.
2. Set the build command to `npm run build`.
3. Provide the `VITE_FIREBASE_*` and backend URL variables inside **Settings > Builds & Deployments > Build environment variables**.

### Backend
The backend can be deployed via Docker, Render, Railway, or any standard VPS.
1. Ensure the production environment exposes the necessary `.env` secrets.
2. Bind the server to host `0.0.0.0` and standard HTTP/HTTPS ports using `gunicorn` with Uvicorn workers.

---

## 🔐 Security & Privacy
BugLens implements strict filtering and error sanitization (`_sanitize_error`) to ensure that no LLM API keys (OpenAI, Gemini, Claude, or GitHub access tokens) are ever leaked in API tracebacks, error messages, or SSE stream chunks. Custom user tokens remain encrypted in the database and are utilized entirely in-memory during RAG queries and Code Reviews.

---

*Built by the Advanced Agentic Coding Team.*
