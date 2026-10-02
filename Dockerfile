FROM python:3.12-slim
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 DATA_DIR=/app/data
RUN apt-get update && apt-get install -y --no-install-recommends libreoffice-writer fonts-noto-cjk fonts-liberation \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY backend/requirements.txt /app/backend/requirements.txt
RUN pip install --no-cache-dir -r backend/requirements.txt
COPY backend /app/backend
COPY index.html styles.css app.js downloads.js pickup.js rules.js formatter.js local-files.js jszip.min.js /app/
RUN useradd -m -u 10001 appuser && mkdir -p /app/data && chown -R appuser:appuser /app
USER appuser
WORKDIR /app/backend
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8080/health', timeout=3)"
CMD ["gunicorn", "-w", "2", "-b", "0.0.0.0:8080", "--timeout", "300", "--graceful-timeout", "300", "app:app"]
