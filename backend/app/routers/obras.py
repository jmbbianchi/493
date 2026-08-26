"""Obras: alta, listado y edicion de la ficha."""
import uuid

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from .. import db
from ..seguridad import requiere_clave

router = APIRouter(prefix="/api/obras", tags=["obras"], dependencies=[Depends(requiere_clave)])

# Mientras no haya login, todas las obras cuelgan de un usuario local.
# El dia que entre Entra, este id se reemplaza por el del token.
_OID_LOCAL = "local-sin-login"


def _usuario_local() -> str:
    filas = db.query("SELECT id FROM dbo.usuario WHERE entra_oid = %s", (_OID_LOCAL,))
    if filas:
        return str(filas[0]["id"])
    nuevo = str(uuid.uuid4())
    db.execute(
        "INSERT INTO dbo.usuario (id, entra_oid, email, nombre) VALUES (%s, %s, %s, %s)",
        (nuevo, _OID_LOCAL, "local@obra493", "Usuario local"),
    )
    return nuevo


class ObraNueva(BaseModel):
    nombre: str = Field(min_length=1, max_length=160)
    direccion: str | None = None
    nomenclatura: str | None = None
    partida_inmob: str | None = None
    sup_terreno: float | None = None
    sup_cubierta: float | None = None
    sup_semicubierta: float | None = None
    sup_descubierta: float | None = None
    criterio_m2: str = "cubierta"
    desperdicio_pct: float = 5.0


class ObraCambio(BaseModel):
    nombre: str | None = None
    direccion: str | None = None
    nomenclatura: str | None = None
    partida_inmob: str | None = None
    sup_terreno: float | None = None
    sup_cubierta: float | None = None
    sup_semicubierta: float | None = None
    sup_descubierta: float | None = None
    criterio_m2: str | None = None
    desperdicio_pct: float | None = None


SELECT_OBRA = """
SELECT id, nombre, direccion, nomenclatura, partida_inmob,
       sup_terreno, sup_cubierta, sup_semicubierta, sup_descubierta,
       criterio_m2, moneda_base, desperdicio_pct, fecha_inicio, estado
FROM dbo.obra
"""


@router.get("")
def listar():
    return db.query(SELECT_OBRA + " ORDER BY creado_en DESC")


@router.get("/{obra_id}")
def ver(obra_id: str):
    filas = db.query(SELECT_OBRA + " WHERE id = %s", (obra_id,))
    if not filas:
        raise HTTPException(404, "No existe esa obra.")
    return filas[0]


@router.post("", status_code=201)
def crear(o: ObraNueva):
    nuevo = str(uuid.uuid4())
    db.execute(
        """INSERT INTO dbo.obra
           (id, owner_id, nombre, direccion, nomenclatura, partida_inmob,
            sup_terreno, sup_cubierta, sup_semicubierta, sup_descubierta,
            criterio_m2, desperdicio_pct)
           VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)""",
        (nuevo, _usuario_local(), o.nombre, o.direccion, o.nomenclatura,
         o.partida_inmob, o.sup_terreno, o.sup_cubierta, o.sup_semicubierta,
         o.sup_descubierta, o.criterio_m2, o.desperdicio_pct),
    )
    return ver(nuevo)


# Campos que se pueden tocar. Lista blanca a proposito: sin esto, un PATCH
# con un nombre de columna raro arma un SQL que no queremos.
_EDITABLES = {
    "nombre", "direccion", "nomenclatura", "partida_inmob",
    "sup_terreno", "sup_cubierta", "sup_semicubierta", "sup_descubierta",
    "criterio_m2", "desperdicio_pct",
}


@router.patch("/{obra_id}")
def editar(obra_id: str, cambios: ObraCambio):
    campos = {k: v for k, v in cambios.model_dump(exclude_unset=True).items()
              if k in _EDITABLES}
    if not campos:
        return ver(obra_id)
    sets = ", ".join(f"{k} = %s" for k in campos)
    db.execute(f"UPDATE dbo.obra SET {sets} WHERE id = %s",
               tuple(campos.values()) + (obra_id,))
    return ver(obra_id)
