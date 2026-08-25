# Imagen magra a proposito: ~180 MB.
# NADA de pandas, openai, litellm, boto3. Solo lo que la app importa.
FROM python:3.12-slim AS base

# Linkea el package de GHCR con el repo: sin esto el package queda huerfano
# y los pushes desde Actions pueden fallar por permisos.
LABEL org.opencontainers.image.source="https://github.com/jmbbianchi/493"
LABEL org.opencontainers.image.description="API de obra493 - computo y presupuesto de obra"

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1

WORKDIR /app

# pymssql trae FreeTDS en la wheel -> no hace falta instalar msodbcsql18
# por apt, que agrega ~250 MB y tres claves GPG.
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY app ./app
# Lanzador del job: ver el comentario adentro (el az CLI no acepta "-m").
COPY run_indices.py .

# Usuario sin privilegios. OJO: por esto el puerto tiene que ser >= 1024.
# Con USER appuser, uvicorn en el 80 muere con:
#   [Errno 13] error while attempting to bind on address ('0.0.0.0', 80)
RUN useradd -r -u 1001 appuser && chown -R appuser /app
USER appuser

EXPOSE 8080
# 1 worker: con un usuario no hace falta mas, y multiples workers
# multiplican las conexiones abiertas contra SQL (ver nota de auto-pause).
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8080", "--workers", "1"]
