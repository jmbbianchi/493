"""Obras: alta, listado y edicion de la ficha."""
import uuid

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from .. import db
from ..acceso import exige_acceso, usuario_actual

# Sin dependencia de obra: este router es el que decide cuales son "las
# tuyas", asi que no puede pedir permiso sobre una obra que todavia no
# eligio nadie.
router = APIRouter(prefix="/api/obras", tags=["obras"])

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

# Las obras a las que este usuario llega. Es el filtro que hace que un
# arquitecto vea las suyas y nada mas, y vive en la consulta y no en el
# codigo: filtrar despues de traer todo seria traer las de otro.
MIS_OBRAS = SELECT_OBRA + """
WHERE id IN (SELECT obra_id FROM dbo.v_acceso_obra WHERE usuario_id = %s)
"""


@router.get("")
def listar(usuario: dict = Depends(usuario_actual)):
    return db.query(MIS_OBRAS + " ORDER BY creado_en DESC", (usuario["id"],))


@router.get("/{obra_id}")
def ver(obra_id: str, usuario: dict = Depends(usuario_actual)):
    filas = db.query(MIS_OBRAS + " AND id = %s", (usuario["id"], obra_id))
    if not filas:
        # Mismo 404 exista o no: contestar "no tenes permiso" seria contar
        # que esa obra existe, y eso es informacion de otro.
        raise HTTPException(404, "No existe esa obra, o no tenes acceso.")
    return filas[0]


@router.post("", status_code=201)
def crear(o: ObraNueva, usuario: dict = Depends(usuario_actual)):
    nuevo = str(uuid.uuid4())
    with db.cursor() as cur:
        cur.execute(
            """INSERT INTO dbo.obra
               (id, owner_id, nombre, direccion, nomenclatura, partida_inmob,
                sup_terreno, sup_cubierta, sup_semicubierta, sup_descubierta,
                criterio_m2, desperdicio_pct)
               VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)""",
            (nuevo, usuario["id"], o.nombre, o.direccion, o.nomenclatura,
             o.partida_inmob, o.sup_terreno, o.sup_cubierta, o.sup_semicubierta,
             o.sup_descubierta, o.criterio_m2, o.desperdicio_pct))
        # Sin esta fila el que la creo no la veria: el filtro de acceso
        # mira obra_usuario, no owner_id.
        cur.execute(
            """INSERT INTO dbo.obra_usuario (obra_id, usuario_id, rol)
               VALUES (%s,%s,'editor')""", (nuevo, usuario["id"]))
    return ver(nuevo, usuario)


# Campos que se pueden tocar. Lista blanca a proposito: sin esto, un PATCH
# con un nombre de columna raro arma un SQL que no queremos.
_EDITABLES = {
    "nombre", "direccion", "nomenclatura", "partida_inmob",
    "sup_terreno", "sup_cubierta", "sup_semicubierta", "sup_descubierta",
    "criterio_m2", "desperdicio_pct",
}


@router.patch("/{obra_id}")
def editar(obra_id: str, cambios: ObraCambio,
           acceso: dict = Depends(exige_acceso)):
    campos = {k: v for k, v in cambios.model_dump(exclude_unset=True).items()
              if k in _EDITABLES}
    if not campos:
        return ver(obra_id)
    sets = ", ".join(f"{k} = %s" for k in campos)
    db.execute(f"UPDATE dbo.obra SET {sets} WHERE id = %s",
               tuple(campos.values()) + (obra_id,))
    return ver(obra_id)
