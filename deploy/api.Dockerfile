FROM python:3.11-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1

RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates git \
    && rm -rf /var/lib/apt/lists/*

ARG KUHI_API_REF=main
RUN git clone --depth 1 --branch "${KUHI_API_REF}" https://github.com/aryaniiil/anime-api.git /opt/kuhi-api

WORKDIR /opt/kuhi-api
RUN python -m pip install --upgrade pip \
    && python -m pip install -r requirements.txt

EXPOSE 8000
CMD ["sh", "-c", "uvicorn src.main:app --host 0.0.0.0 --port ${PORT:-8000}"]
