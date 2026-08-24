FROM python:3.11-slim

WORKDIR /app

# libsndfile for soundfile; ffmpeg for the compressed-container decode path
RUN apt-get update && apt-get install -y --no-install-recommends \
        libsndfile1 ffmpeg \
    && rm -rf /var/lib/apt/lists/*

# CPU-only stack. Deliberately NOT ml/requirements-torch.txt — that file pins
# torch==2.7.1+cu126, whose wheels live only on the PyTorch CUDA index, so a
# plain `pip install -r` of it fails and the build breaks.
COPY backend/requirements.txt ./backend/
RUN pip install --no-cache-dir -r backend/requirements.txt

COPY backend/ ./backend/
COPY ml/ ./ml/

# /app so `import ml` resolves, /app/backend so `import app` resolves
ENV PYTHONPATH=/app:/app/backend
ENV VOICESHIELD_DETECTOR=auto
ENV DHWANI_MODEL_PATH=/app/data/external_models/dhwani/best_model.onnx

EXPOSE 8000

# The model is mounted, not baked: 1.26 GB does not belong in an image layer.
# docker-compose mounts ./data -> /app/data. Without it the service still
# starts and reports demo mode via /health rather than failing.
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s \
    CMD python -c "import urllib.request;urllib.request.urlopen('http://127.0.0.1:8000/health')"

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
