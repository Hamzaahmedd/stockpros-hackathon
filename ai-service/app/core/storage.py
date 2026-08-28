"""Supabase storage client used to sync trained ONNX models."""
from supabase import Client, create_client

from app.core.config import settings

BUCKET_NAME = "models"

supabase: Client = create_client(settings.SUPABASE_URL, settings.SUPABASE_KEY)
