"""
API de obra493.

PROHIBIDO en este archivo (reglas de la auditoria de jun-2026):
  - Cualquier bucle de fondo, poller, websocket o SSE con keep-alive.
  - APScheduler embebido: mantendria el contenedor vivo 24/7.
    Las tareas programadas viven en el Container Apps Job 'obra493-indices'.
  - Health checks internos que consulten la base en intervalos.

El contenedor tiene que poder dormirse. Si no se duerme, factura.
"""
import os

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from . import db

app = FastAPI(title="obra493", docs_url="/docs")

# El hostname de la Static Web App lleva un sufijo aleatorio, asi que
# viene por variable de entorno. La setea deploy-obra493.ps1.
ORIGENES = [o for o in os.environ.get("CORS_ORIGINS", "").split(",") if o]

app.add_middleware(
    CORSMiddleware,
    allow_origins=ORIGENES or ["http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
def health():
    """Liviano a proposito: NO toca la base.

    Si el health check consultara SQL, cada probe despertaria la base y
    el auto-pause no se activaria nunca.
    """
    return {"status": "ok"}


@app.get("/api/indices/ultimo")
def ultimo_indice(codigo: str):
    filas = db.query(
        "SELECT TOP 1 fecha, valor FROM indice_valor "
        "WHERE codigo = %s ORDER BY fecha DESC",
        (codigo,),
    )
    return filas[0] if filas else {"detail": "sin datos"}
