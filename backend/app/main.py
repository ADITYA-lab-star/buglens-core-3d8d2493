from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.core.config import settings
from app.api.endpoints import reviews, webhooks, chat, dashboard, analyze, settings as settings_endpoint
from app.core.firebase import init_firebase

init_firebase()

app = FastAPI(title=settings.PROJECT_NAME)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(reviews.router, prefix="/api/v1/reviews", tags=["reviews"])
app.include_router(webhooks.router, prefix="/api/v1/webhooks", tags=["webhooks"])
app.include_router(webhooks.router, prefix="/api/v1/webhook", tags=["webhook"])
app.include_router(chat.router, prefix="/api/v1/chat", tags=["chat"])
app.include_router(dashboard.router, prefix="/api/v1/dashboard", tags=["dashboard"])
app.include_router(analyze.router, prefix="/api/v1/analyze", tags=["analyze"])
app.include_router(settings_endpoint.router, prefix="/api/v1/settings", tags=["settings"])

@app.get("/health")
async def health_check():
    return {"status": "ok", "project": settings.PROJECT_NAME}
