# API-only image: serves backend.main from the SQLite store in data/processed/.
# Scraping (Playwright) is a separate, host-side concern — see scraper/ and the
# README — so this image stays lean and does not install a browser.
FROM python:3.12-slim

WORKDIR /app

COPY backend/requirements.txt backend/requirements.txt
RUN pip install --no-cache-dir \
    fastapi>=0.115 "uvicorn[standard]>=0.30" pydantic>=2.7 email-validator>=2.1 python-dotenv>=1.0 \
    pandas>=2.2 numpy>=1.26 scikit-learn>=1.5 requests>=2.32

COPY backend/ backend/
COPY pipeline/ pipeline/
# Only scraper.base is needed at import time (pipeline.clean uses its constants);
# scraper.sources pulls in Playwright and is intentionally left out of this image.
COPY scraper/__init__.py scraper/base.py scraper/

EXPOSE 8000
CMD ["python", "-m", "uvicorn", "backend.main:app", "--host", "0.0.0.0", "--port", "8000"]
