from __future__ import annotations

from typing import List

from pydantic_settings import BaseSettings
from functools import lru_cache


class Settings(BaseSettings):
    mongodb_uri: str = "mongodb://localhost:27017"
    database_name: str = "engagement_engine"

    # VoyageAI via MongoDB Atlas endpoint
    voyage_api_key: str = ""
    voyage_base_url: str = "https://ai.mongodb.com/v1"
    embedding_model: str = "voyage-4"
    embedding_dimensions: int = 1024

    # Claude Haiku 4.5 via AWS Bedrock (API Gateway → Lambda)
    llm_endpoint: str = ""

    friction_threshold: int = 3
    friction_window_seconds: int = 60
    cors_origins: List[str] = ["http://localhost:3000"]

    model_config = {"env_file": ".env", "env_file_encoding": "utf-8"}


@lru_cache
def get_settings() -> Settings:
    return Settings()
