from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.cache import lifespan
from app.modules.forecast.router import router as forecast_router
from app.types import HealthResponse, MessageResponse

app = FastAPI(lifespan=lifespan)

origins = [
    "https://stockplatform.vercel.app",
    "https://stockpros-platform.vercel.app",
    "http://localhost:5173",
    "http://127.0.0.1:5173",
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(forecast_router)


@app.get("/", response_model=MessageResponse)
def root() -> MessageResponse:
    return MessageResponse(message="Stock ML Service is running.")


@app.get("/health", response_model=HealthResponse)
def health() -> HealthResponse:
    return HealthResponse(status="ok")
