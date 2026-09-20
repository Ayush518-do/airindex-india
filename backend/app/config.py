from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    database_url: str = "postgresql://airindex:airindex@localhost:5432/airindex_db"
    api_title: str = "AIRINDEX INDIA"
    api_version: str = "0.1.0"
    debug: bool = False
    cors_origins: list = ["http://localhost:5173", "http://localhost:3000", "*"]

    class Config:
        env_file = ".env"
        case_sensitive = False

settings = Settings()
