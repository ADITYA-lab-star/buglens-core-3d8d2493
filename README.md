<div align="center">
  <img src="https://img.shields.io/badge/Status-Live-success" alt="Status" />
  <img src="https://img.shields.io/badge/Frontend-React%20%7C%20Vite-blue" alt="Frontend" />
  <img src="https://img.shields.io/badge/Backend-FastAPI%20%7C%20Python-green" alt="Backend" />
  <img src="https://img.shields.io/badge/Database-MongoDB-47A248" alt="Database" />

  <h1>🐛 BugLens</h1>
  <p><strong>The AI-Powered Code Review Engine</strong></p>
  
  <p>
    BugLens is an enterprise-grade AI coding assistant platform that automatically analyzes your pull requests and code snippets for bugs, security vulnerabilities, performance bottlenecks, and clean code violations using state-of-the-art Large Language Models.
  </p>
</div>

---

## ✨ Features

- **🤖 Multi-Model AI Engine**: Seamlessly switch between OpenAI (GPT-4o) and Google (Gemini 1.5 Pro) for your reviews.
- **⚡ Real-time GitHub Automation**: Instantly analyzes code diffs on every Pull Request via Webhooks.
- **🛡️ Secure HMAC Verification**: Enterprise-grade webhook security ensuring payloads are strictly from GitHub.
- **📊 Developer Dashboard**: Visual analytics, severity breakdowns, and a history of all AI reviews.
- **🛠️ Manual Workspace**: Paste code snippets or drop files into the workspace for instant manual analysis.

## 🏗️ Architecture

BugLens is built on a modern, fully-decoupled architecture.

### Frontend
- **Framework**: React 18, Vite, TypeScript
- **Styling**: Tailwind CSS, Radix UI, shadcn/ui
- **State/Routing**: TanStack Router, React Query
- **Hosting**: Cloudflare Pages

### Backend
- **Framework**: FastAPI (Python 3.12+)
- **Database**: MongoDB (via Motor AsyncIO)
- **AI Integrations**: Native Gemini & OpenAI SDKs
- **Architecture**: Repository Pattern, Background Tasks for Webhooks
- **Hosting**: Render

## 🚀 Getting Started

### 1. Clone the repository
```bash
git clone https://github.com/ADITYA-lab-star/buglens-core-3d8d2493.git
cd buglens-core-3d8d2493
```

### 2. Backend Setup
```bash
cd backend
python -m venv venv
source venv/bin/activate  # Or `.\venv\Scripts\activate` on Windows
pip install -r requirements.txt
```
Create a `.env` file in the `backend/` directory:
```env
MONGODB_URL="mongodb+srv://<user>:<password>@cluster.mongodb.net"
GITHUB_WEBHOOK_SECRET="your_fallback_webhook_secret"
```
Run the backend server:
```bash
uvicorn app.main:app --reload --port 8000
```

### 3. Frontend Setup
```bash
cd frontend
npm install
```
Create a `.env` file in the `frontend/` directory:
```env
VITE_BACKEND_URL="http://localhost:8000"
```
Start the development server:
```bash
npm run dev
```

## 🔌 Webhook Configuration

BugLens can automatically review Pull Requests on any GitHub repository. 

1. Log into your BugLens dashboard and navigate to **Settings**.
2. Copy your unique **Webhook URL** and the 64-character **HMAC Secret**.
3. Go to your GitHub Repository -> **Settings** -> **Webhooks** -> **Add Webhook**.
4. Paste the URL and Secret.
5. Select **Content type**: `application/json`.
6. Select **Let me select individual events**, and check **Pull requests**.
7. Click **Add Webhook**. 

BugLens will now automatically post AI code reviews directly to your GitHub PRs!

## 📜 License

This project is proprietary and confidential.
