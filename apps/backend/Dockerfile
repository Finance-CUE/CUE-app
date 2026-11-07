FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1

WORKDIR /app

COPY requirements.txt .
RUN pip install -r requirements.txt

COPY app ./app

# Run as an unprivileged user.
RUN useradd --create-home cue
USER cue

# Hosts like Render, Railway and Fly inject PORT. One worker: the rate limiter
# keeps its counters in process memory (see app/features/auth/router.py).
# --proxy-headers so the limiter sees the client IP, not the load balancer's.
CMD ["sh", "-c", "uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000} --proxy-headers --forwarded-allow-ips='*'"]
