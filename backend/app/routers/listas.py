"""
Las listas desplegables, en un solo lugar.

Las unicas dos listas de la app que son datos y no codigo son rubro y
subrubro. El resto de los desplegables -- moneda, medio de pago,
periodicidad, estado -- son opciones del motor: detras de cada valor hay
una cuenta distinta, y renombrarlos no los haria configurables, los haria
mentirosos. Por eso aca hay dos y no diez.

Se renombra, se reordena y se oculta. No se borra: un rubro lo apuntan
cinco tablas, y el que no se usa se renombra y pasa a ser otro. Por eso
cada fila viaja con la cuenta de donde esta usada: es lo unico que
distingue "renombrar un rubro vivo" -- que le cambia el nombre a la
historia -- de "aprovechar uno que sobra", que no le cambia nada a nadie.
"""
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from .. import db
from ..acceso import exige_acceso

router = APIRouter(prefix="/api/obras/{obra_id}", tags=["listas"],
                   dependencies=[Depends(exige_acceso)])


# El uso se cuenta en TODAS las obras y no solo en la actual: la lista es
# compartida, y renombrar un rubro desde una obra se lo renombra a las
# demas. Si la cuenta fuera local, la pantalla diria "no lo usa nadie"
# mirando media realidad.
RUBROS = """
SELECT r.id, r.nombre, r.orden, r.activo,
       (SELECT COUNT(*) FROM dbo.material     x WHERE x.rubro_id = r.id) AS materiales,
       (SELECT COUNT(*) FROM dbo.tarea_tipo   x WHERE x.rubro_id = r.id) AS tareas,
       (SELECT COUNT(*) FROM dbo.presupuesto  x WHERE x.rubro_id = r.id) AS presupuestos,
       (SELECT COUNT(*) FROM dbo.pago         x WHERE x.rubro_id = r.id) AS pagos,
       (SELECT COUNT(*) FROM dbo.documento    x WHERE x.rubro_id = r.id) AS documentos
FROM dbo.rubro r ORDER BY r.orden, r.nombre
"""

SUBRUBROS = """
SELECT s.id, s.nombre, s.orden, s.activo,
       (SELECT COUNT(*) FROM dbo.presupuesto x WHERE x.subrubro_id = s.id) AS presupuestos,
       (SELECT COUNT(*) FROM dbo.pago        x WHERE x.subrubro_id = s.id) AS pagos,
       (SELECT COUNT(*) FROM dbo.computo     x WHERE x.subrubro_id = s.id) AS computo
FROM dbo.subrubro s ORDER BY s.orden, s.nombre
"""

# tabla, consulta, largo del nombre, y de donde cuelga cada uso. El largo
# sale de la columna real: rubro.nombre es nvarchar(80) y subrubro 60.
CATALOGOS = {
    "rubros": ("rubro", RUBROS, 80,
               [("materiales", "material"), ("tareas", "tarea"),
                ("presupuestos", "presupuesto"), ("pagos", "pago"),
                ("documentos", "documento")]),
    "subrubros": ("subrubro", SUBRUBROS, 60,
                  [("presupuestos", "presupuesto"), ("pagos", "pago"),
                   ("computo", "renglon de computo")]),
}


class Cambio(BaseModel):
    nombre: str | None = Field(default=None, min_length=1, max_length=80)
    activo: bool | None = None


def _catalogo(lista: str):
    if lista not in CATALOGOS:
        raise HTTPException(404, "No existe esa lista.")
    return CATALOGOS[lista]


@router.get("/listas")
def listar(obra_id: str):
    """Las dos listas de una, que es como se miran: una al lado de la otra."""
    return {clave: db.query(consulta)
            for clave, (_, consulta, _, _) in CATALOGOS.items()}


@router.patch("/listas/{lista}/{item_id}")
def editar(obra_id: str, lista: str, item_id: int, c: Cambio):
    tabla, _, largo, _ = _catalogo(lista)
    campos = c.model_dump(exclude_unset=True)
    if not campos:
        return {"cambios": 0}

    if "nombre" in campos:
        nombre = campos["nombre"].strip()
        if not nombre:
            raise HTTPException(422, "Ingresá un nombre.")
        if len(nombre) > largo:
            raise HTTPException(422, f"El nombre no puede pasar de {largo} caracteres.")
        # rubro.nombre es UNIQUE: sin este chequeo el choque llega como un
        # error de SQL crudo y la pantalla no puede decir con cual choca.
        repetido = db.query(
            f"SELECT id FROM dbo.{tabla} WHERE nombre = %s AND id <> %s",
            (nombre, item_id))
        if repetido:
            raise HTTPException(409, f"Ya hay otro con el nombre «{nombre}».")
        campos["nombre"] = nombre

    sets = ", ".join(f"{k} = %s" for k in campos)
    n = db.execute(f"UPDATE dbo.{tabla} SET {sets} WHERE id = %s",
                   tuple(campos.values()) + (item_id,))
    if not n:
        raise HTTPException(404, "No existe ese elemento.")
    return {"cambios": n}


@router.put("/listas/{lista}/orden")
def reordenar(obra_id: str, lista: str, ids: list[int]):
    """Recibe la lista entera en el orden que quedo y la numera de diez en
    diez. Mandar el orden completo y no "subi este" evita que dos pestañas
    abiertas dejen dos elementos con el mismo numero."""
    tabla, _, _, _ = _catalogo(lista)
    if not ids:
        raise HTTPException(422, "Falta el orden.")
    if len(set(ids)) != len(ids):
        raise HTTPException(422, "El orden trae elementos repetidos.")
    with db.cursor() as cur:
        for posicion, item_id in enumerate(ids, start=1):
            cur.execute(f"UPDATE dbo.{tabla} SET orden = %s WHERE id = %s",
                        (posicion * 10, item_id))
    return {"ordenados": len(ids)}
