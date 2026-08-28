"""Shared type aliases, literals and response models for the AI service."""
from typing import Literal

from pydantic import BaseModel

AppEnv = Literal["local", "prod"]
ModelExtension = Literal["keras", "onnx"]
PredictionStatus = Literal["success", "training"]


class MessageResponse(BaseModel):
    message: str


class HealthResponse(BaseModel):
    status: str
