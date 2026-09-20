# AIRINDEX INDIA

Real-Time Airfare Price Index Platform for India - Smart India Hackathon PS 26056

## Quick Start

docker compose up --build

Visit:
- Frontend: http://localhost:5173
- Backend: http://localhost:8000
- API Docs: http://localhost:8000/docs

## Features

- Airfare Price Index (weighted fixed-basket)
- Route Analytics
- Airline Contribution Analysis
- Anomaly Detection
- Data Quality Monitoring
- Source Health Tracking
- ML Forecasting (XGBoost)
- Holiday/Event Analysis
- India Route Map
- Index Simulator

## Technology Stack

- Backend: FastAPI, SQLAlchemy, PostgreSQL
- Frontend: React, TypeScript, Tailwind CSS, Recharts
- Data: Pandas, NumPy, scikit-learn, XGBoost, SHAP
- Infrastructure: Docker, Docker Compose

## Database

Automatically seeded with:
- 10 Indian airports
- 6 airlines
- 15+ routes
- 1000+ synthetic fare observations

All data clearly labeled as SYNTHETIC/DEMO.

## API Endpoints

GET /api/dashboard/summary - KPI cards
GET /api/index/current - Current index
GET /api/index/history - Historical values
GET /api/routes - All routes
GET /api/anomalies - Detected anomalies
GET /api/data-quality - Quality metrics
GET /api/source-health - Source status

## Index Methodology

Price Relative = (Current Fare / Base Period Fare) × 100
Index = SUM(Route Weight × Price Relative)

Base Period: Jan 2024 = 100

DISCLAIMER: This is a PROTOTYPE index for demonstration. NOT the official MoSPI CPI.

## Project Structure

backend/ - FastAPI application
frontend/ - React dashboard
scripts/ - Utility scripts
data/ - Reference data
docker-compose.yml - Multi-container setup

## Development

Backend:
cd backend
pip install -r requirements.txt
uvicorn app.main:app --reload

Frontend:
cd frontend
npm install
npm run dev

## Testing

cd backend
pytest tests/

---

Built for Smart India Hackathon PS 26056
"Development of a Real-time Airfare Price Index for India"
