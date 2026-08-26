"""
Puerta de entrada temporal.

La API es publica en internet. Hasta que este el login con Entra External ID,
todo /api pide una clave compartida en el header X-Obra-Key, que se compara
contra la variable de entorno APP_KEY del Container App.

Esto NO es autenticacion: es un candado. No distingue usuarios, no expira y
si se filtra hay que rotarla a mano. Sirve para que la API no quede abierta
mientras se construye, y se saca el dia que entre Entra.

La clave NO viaja en el bundle del frontend: se pide una vez y queda en el
navegador de quien la escribio.
"""
import os
import secrets

from fastapi import Header, HTTPException

_CLAVE = os.environ.get("APP_KEY", "")


def requiere_clave(x_obra_key: str = Header(default="")):
    if not _CLAVE:
        raise HTTPException(
            status_code=503,
            detail="APP_KEY no esta configurada en el Container App.",
        )
    if not secrets.compare_digest(x_obra_key, _CLAVE):
        raise HTTPException(status_code=401, detail="Clave invalida.")
