FROM node:22-bookworm-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PATH="/opt/venv/bin:$PATH"

RUN apt-get update && apt-get install -y --no-install-recommends python3 python3-venv git ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
RUN git clone --depth 1 https://github.com/walterwhite-69/ReAnime.to-API.git /app
# ReAnime may reject server-to-server requests that omit browser-origin headers.
RUN python3 - <<'PY'
from pathlib import Path
p = Path("/app/reanime.py")
s = p.read_text()
old = 'HEADERS = {"User-Agent": _UA, "Accept": "application/json, */*"}'
new = 'HEADERS = {"User-Agent": _UA, "Accept": "application/json, */*", "Referer": "https://reanime.to/", "Origin": "https://reanime.to"}'
if old not in s:
    raise SystemExit("Expected ReAnime request headers were not found; refusing to build an unpatched image")
p.write_text(s.replace(old, new, 1))
PY
RUN python3 -m venv /opt/venv && /opt/venv/bin/pip install --no-cache-dir -r requirements.txt

EXPOSE 8000
CMD ["sh", "-c", "uvicorn reanime:app --host 0.0.0.0 --port ${PORT:-8000} --workers 1"]
