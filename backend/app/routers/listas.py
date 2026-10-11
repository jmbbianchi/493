"""
Las listas desplegables, en un solo lugar.

Las unicas dos listas de la app que son datos y no codigo son rubro y
subrubro. El resto de los desplegables -- moneda, medio de pago,
periodicidad, estado -- son opciones del motor: detras de cada valor hay
una cuenta distinta, y renombrarlos no los haria configurables, los haria
mentirosos. Por eso aca hay dos y no diez.

Se renombra, se reordena, se oculta, y se borra SOLO lo que no usa nadie.

El uso se declara una sola vez, en USOS, y de ahi salen las tres cosas:
la cuenta que muestra la pantalla, la condicion del borrado y el motivo
que se devuelve cuando no se puede. Si estuvieran escritas por separado
alcanzaria con que una quedara corta para que la pantalla diga "libre"
sobre algo que no lo esta, y eso es exactamente lo que no puede pasar
cuando del otro lado hay un boton de borrar.

La lista salio de sys.foreign_keys y no de buscar "rubro_id" en el
codigo: buscando se me paso proyecto_rubro.rubro_origen_id, que apunta a
rubro con otro nombre de columna.
"""
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from .. import db
from ..acceso import exige_acceso

router = APIRouter(prefix="/api/obras/{obra_id}", tags=["listas"],
                   dependencies=[Depends(exige_acceso)])


# (clave que viaja al front, tabla, columna, palabra en singular)
USOS = {
    "rubros": [
        ("presupuestos", "presupuesto", "rubro_id", "presupuesto"),
        ("pagos", "pago", "rubro_id", "pago"),
        ("materiales", "material", "rubro_id", "material"),
        ("tareas", "tarea_tipo", "rubro_id", "tarea"),
        ("documentos", "documento", "rubro_id", "documento"),
        ("proyectos", "proyecto_rubro", "rubro_origen_id", "rubro del cronograma"),
    ],
    "subrubros": [
        ("presupuestos", "presupuesto", "subrubro_id", "presupuesto"),
        ("pagos", "pago", "subrubro_id", "pago"),
        ("computo", "computo", "subrubro_id", "renglon de computo"),
    ],
}

# tabla propia y largo del nombre, que sale de la columna real:
# rubro.nombre es nvarchar(80) y subrubro.nombre nvarchar(60).
CATALOGOS = {"rubros": ("rubro", 80), "subrubros": ("subrubro", 60)}


def _consulta(lista: str, uno=False) -> str:
    tabla, _ = CATALOGOS[lista]
    cuentas = "".join(
        f",\n       (SELECT COUNT(*) FROM dbo.{t} x WHERE x.{c} = e.id) AS {clave}"
        for clave, t, c, _ in USOS[lista])
    return (f"SELECT e.id, e.nombre, e.orden, e.activo{cuentas}\n"
            f"FROM dbo.{tabla} e "
            + ("WHERE e.id = %s" if uno else "ORDER BY e.orden, e.nombre"))


class Cambio(BaseModel):
    nombre: str | None = Field(default=None, min_length=1, max_length=80)
    activo: bool | None = None


def _catalogo(lista: str):
    if lista not in CATALOGOS:
        raise HTTPException(404, "No existe esa lista.")
    return CATALOGOS[lista]


def _plural(n, palabra):
    return f"{n} {palabra}{'' if n == 1 else 's'}"


@router.get("/listas")
def listar(obra_id: str):
    """Las dos listas de una, que es como se miran: una al lado de la otra.

    El uso se cuenta en TODAS las obras y no solo en la actual: la lista
    es compartida, y renombrar un rubro desde una obra se lo renombra a
    las demas. Si la cuenta fuera local, la pantalla diria "libre"
    mirando media realidad.
    """
    return {clave: db.query(_consulta(clave)) for clave in CATALOGOS}


@router.patch("/listas/{lista}/{item_id}")
def editar(obra_id: str, lista: str, item_id: int, c: Cambio):
    tabla, largo = _catalogo(lista)
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


@router.delete("/listas/{lista}/{item_id}")
def borrar(obra_id: str, lista: str, item_id: int):
    """Borra, pero solo lo que de verdad no usa nadie.

    La condicion viaja adentro del DELETE y no en un SELECT previo: entre
    mirar y borrar entra un presupuesto cargado desde otra pestaña, y la
    foranea lo rechazaria con un error de SQL que no le dice nada a nadie.
    Asi el borrado no pasa, y recien despues se averigua por que.
    """
    tabla, _ = _catalogo(lista)
    libre = " AND ".join(
        f"NOT EXISTS (SELECT 1 FROM dbo.{t} x WHERE x.{c} = e.id)"
        for _, t, c, _ in USOS[lista])
    n = db.execute(f"DELETE e FROM dbo.{tabla} e WHERE e.id = %s AND {libre}",
                   (item_id,))
    if n:
        return {"borrados": n}

    fila = db.query(_consulta(lista, uno=True), (item_id,))
    if not fila:
        raise HTTPException(404, "No existe ese elemento.")
    usado = [_plural(fila[0][clave], palabra)
             for clave, _, _, palabra in USOS[lista] if fila[0][clave]]
    raise HTTPException(409, f"No se puede borrar: está usado en {', '.join(usado)}. "
                             "Ocultalo y sigue intacto lo que ya cargaste.")


@router.put("/listas/{lista}/orden")
def reordenar(obra_id: str, lista: str, ids: list[int]):
    """Recibe la lista entera en el orden que quedo y la numera de diez en
    diez. Mandar el orden completo y no "subi este" evita que dos pestañas
    abiertas dejen dos elementos con el mismo numero."""
    tabla, _ = _catalogo(lista)
    if not ids:
        raise HTTPException(422, "Falta el orden.")
    if len(set(ids)) != len(ids):
        raise HTTPException(422, "El orden trae elementos repetidos.")
    with db.cursor() as cur:
        for posicion, item_id in enumerate(ids, start=1):
            cur.execute(f"UPDATE dbo.{tabla} SET orden = %s WHERE id = %s",
                        (posicion * 10, item_id))
    return {"ordenados": len(ids)}
