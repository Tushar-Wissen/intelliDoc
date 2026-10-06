FROM python:3.11-slim-bookworm

WORKDIR /app

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1

# Use HTTPS for Debian repositories to avoid HTTP 403 errors
RUN sed -i 's|http://deb.debian.org|https://deb.debian.org|g' /etc/apt/sources.list.d/debian.sources && \
    apt-get update && \
    apt-get install --no-install-recommends -y \
    curl \
    libgl1 \
    libglib2.0-0 \
    libgomp1 \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt requirements-pipeline.txt ./

RUN pip install --no-cache-dir -r requirements.txt -r requirements-pipeline.txt

COPY . .

# Use sed instead of dos2unix (no extra package needed)
RUN sed -i 's/\r$//' start.sh
RUN chmod +x start.sh

EXPOSE 8000

HEALTHCHECK --interval=10s --timeout=5s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:8000/health || exit 1

CMD ["./start.sh"]