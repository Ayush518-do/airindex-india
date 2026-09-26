# Scheduler image: Playwright + Chromium + the pipeline. Kept separate from the
# lean API image (backend/Dockerfile), which deliberately ships no browser.
FROM python:3.12-slim

WORKDIR /app
ENV PYTHONUNBUFFERED=1 PYTHONIOENCODING=utf-8

COPY backend/requirements.txt backend/requirements.txt
RUN pip install --no-cache-dir -r backend/requirements.txt \
 && python -m playwright install --with-deps chromium

COPY pipeline/ pipeline/
COPY scraper/ scraper/
COPY backend/__init__.py backend/__init__.py

CMD ["python", "-m", "scraper.scheduler"]
