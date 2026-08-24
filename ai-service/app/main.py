# app/main.py
from typing_extensions import TypedDict
from fastapi import FastAPI
from app.services.redis import lifespan
from app.modules.forecast.router import router as forecast_router
from fastapi.middleware.cors import CORSMiddleware


class MessageResponse(TypedDict):
    message: str


class HealthResponse(TypedDict):
    status: str


app = FastAPI(lifespan=lifespan)

origins = [
    "https://stockplatform.vercel.app",  # Your Production Frontend
    "http://localhost:5173",             # Your Local Development (Vite default)
    "http://127.0.0.1:5173",
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,           # Allow these specific domains
    allow_credentials=True,
    allow_methods=["*"],              # Allow GET, POST, etc.
    allow_headers=["*"],              # Allow all headers
)

app.include_router(forecast_router)

@app.get("/")
def root() -> MessageResponse:
    return {"message": "Stock ML Service is running."}

@app.get("/health")
def health() -> HealthResponse:
    return {"status": "ok"}
