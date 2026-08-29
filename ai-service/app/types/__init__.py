"""Shared type aliases, literals and response models for the AI service."""
from typing import Literal

from pydantic import BaseModel, Field

AppEnv = Literal["local", "prod"]
ModelExtension = Literal["keras", "onnx"]
PredictionStatus = Literal["success", "training"]


class MessageResponse(BaseModel):
    """Generic text response."""

    message: str = Field(..., examples=["Stock ML Service is running."])


class HealthResponse(BaseModel):
    """Lightweight health status for uptime monitors and load balancers."""

    status: str = Field(
        ...,
        description="'ok' when the service is healthy, 'error' when a dependency is unreachable",
        examples=["ok"],
    )
    timestamp: str = Field(
        ...,
        description="ISO-8601 UTC timestamp of the response",
        examples=["2026-08-28T23:15:00.000Z"],
    )
