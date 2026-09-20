from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.config import settings
from app.database import init_db
from app.synthetic_data import seed_reference_data, generate_synthetic_observations

app = FastAPI(
    title=settings.api_title,
    version=settings.api_version,
    openapi_url="/openapi.json",
    docs_url="/docs",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.on_event("startup")
async def startup_event():
    try:
        init_db()
        seed_reference_data()
        generate_synthetic_observations()
        print("Database initialized successfully")
    except Exception as e:
        print(f"Startup error: {e}")

@app.get("/health")
async def health():
    return {"status": "ok", "service": "AIRINDEX INDIA"}

@app.get("/api/dashboard/summary")
async def dashboard_summary():
    return {
        "current_index": 115.4,
        "index_change": 2.1,
        "routes_covered": 18,
        "airlines_covered": 6,
        "observations_count": 1250,
        "data_quality_score": 0.93,
        "last_updated": "2024-01-20T15:30:00Z",
        "data_mode": "DEMONSTRATION DATA"
    }

@app.get("/api/index/current")
async def get_current_index():
    return {
        "index_value": 115.4,
        "index_change": 2.1,
        "calculation_period": "2024-01",
        "route_count": 18,
        "observation_count": 1250,
        "data_quality_score": 0.93,
        "last_updated": "2024-01-20T15:30:00Z"
    }

@app.get("/api/index/history")
async def get_index_history():
    return {
        "periods": ["2023-07", "2023-08", "2023-09", "2023-10", "2023-11", "2023-12", "2024-01"],
        "values": [100.0, 101.5, 103.2, 105.8, 109.3, 112.7, 115.4]
    }

@app.get("/api/routes")
async def get_routes():
    return {
        "total": 18,
        "routes": [
            {"id": 1, "origin": "DEL", "destination": "BOM", "index": 118.4, "change": 2.1},
            {"id": 2, "origin": "DEL", "destination": "BLR", "index": 112.3, "change": 1.8},
            {"id": 3, "origin": "BOM", "destination": "GOI", "index": 108.9, "change": 1.2},
        ]
    }

@app.get("/api/anomalies")
async def get_anomalies():
    return {
        "total": 2,
        "anomalies": [
            {"route": "DEL-BOM", "fare": 8900, "expected": 4200, "deviation": 112.0, "severity": "HIGH"},
            {"route": "BOM-GOI", "fare": 7500, "expected": 3100, "deviation": 142.0, "severity": "CRITICAL"},
        ]
    }

@app.get("/api/data-quality")
async def get_data_quality():
    return {
        "observation_coverage": 0.96,
        "route_coverage": 0.92,
        "airline_coverage": 0.88,
        "source_availability": 0.94,
        "overall_score": 0.93
    }

@app.get("/api/source-health")
async def get_source_health():
    return {
        "sources": [
            {"name": "SYNTHETIC", "status": "ACTIVE", "last_run": "2024-01-20T15:30:00Z", "success_rate": 1.0},
            {"name": "DEMO", "status": "ACTIVE", "last_run": "2024-01-20T15:30:00Z", "success_rate": 0.95},
        ]
    }
