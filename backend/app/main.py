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
from datetime import date

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from . import db
from .routers import (calculadora, computo, cronograma, documentos, obras,
                      pagos, presupuestos, usuarios, proyecto, financiacion, desembolsos, calendario)

app = FastAPI(title="obra493", docs_url="/docs")

# El hostname de la Static Web App lleva un sufijo aleatorio, asi que
# viene por variable de entorno. La setea deploy-obra493.ps1.
# El origen de producción queda incluido como red de seguridad. La variable
# permite sumar previews o dominios propios sin dejar la app inaccesible si
# se olvidó actualizar la configuración del Container App.
ORIGENES = {
    o.strip() for o in os.environ.get("CORS_ORIGINS", "").split(",") if o.strip()
}
ORIGENES.update({
    "http://localhost:5173",
    "https://proud-cliff-0e19abc0f.7.azurestaticapps.net",
})

app.add_middleware(
    CORSMiddleware,
    allow_origins=sorted(ORIGENES),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(obras.router)
app.include_router(calculadora.router)
app.include_router(computo.router)
app.include_router(presupuestos.router)
app.include_router(pagos.router)
app.include_router(documentos.router)
app.include_router(cronograma.router)
app.include_router(usuarios.router)
app.include_router(proyecto.router)
app.include_router(financiacion.router)
app.include_router(desembolsos.router)
app.include_router(calendario.router)


@app.get("/health")
def health():
    """Liviano a proposito: NO toca la base.

    Si el health check consultara SQL, cada probe despertaria la base y
    el auto-pause no se activaria nunca.
    """
    return {"status": "ok"}


@app.get("/api/indices/ultimo")
def ultimo_indice(codigo: str):
    """Sin clave: son datos publicos del BCRA y los usa la portada."""
    filas = db.query(
        "SELECT TOP 1 fecha, valor FROM indice_valor "
        "WHERE codigo = %s ORDER BY fecha DESC",
        (codigo,),
    )
    return filas[0] if filas else {"detail": "sin datos"}

@app.get('/api/indices/historia')
def historia_indice(codigo: str, hasta: date):
    return db.query('SELECT TOP 120 fecha,valor FROM dbo.indice_valor WHERE codigo=%s AND fecha<=%s ORDER BY fecha DESC', (codigo,hasta))

@app.get('/api/indices/dolar-calendario')
def dolar_calendario():
    return db.query("SELECT fecha,valor FROM dbo.indice_valor WHERE codigo='USD_MINORISTA' AND valor>0 AND fecha<=%s ORDER BY fecha", (date.today(),))
