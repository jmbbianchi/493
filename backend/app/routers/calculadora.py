"""
La calculadora: biblioteca resuelta por obra, coeficientes y precios.

Regla del modelo: la biblioteca es un punto de partida. Cada obra ve
la biblioteca (material.obra_id IS NULL) mas lo suyo (obra_id = la obra),
con los campos que edito pisados por obra_material / obra_coeficiente,
y sin lo que marco como oculto.
"""
import datetime as dt

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from .. import db
from ..seguridad import requiere_clave

router = APIRouter(prefix="/api/obras/{obra_id}", tags=["calculadora"],
                   dependencies=[Depends(requiere_clave)])

# ─────────────────────────────────────────── materiales

MATERIALES = """
SELECT m.id,
       m.codigo,
       COALESCE(om.nombre, m.nombre)                     AS nombre,
       COALESCE(om.marca, m.marca)                       AS marca,
       m.unidad_consumo,
       COALESCE(om.presentacion, m.presentacion)         AS presentacion,
       COALESCE(om.unidades_x_pres, m.unidades_x_pres)   AS unidades_x_pres,
       COALESCE(om.desperdicio_pct, m.desperdicio_pct)   AS desperdicio_pct,
       r.nombre                                          AS rubro,
       CASE WHEN m.obra_id IS NULL THEN 0 ELSE 1 END     AS propio,
       CASE WHEN om.material_id IS NULL THEN 0 ELSE 1 END AS editado,
       pv.importe        AS precio,
       pv.importe_final  AS precio_final,
       pv.iva_incluido,
       pv.alicuota_iva,
       pv.moneda,
       pv.vigente_desde  AS precio_desde
FROM dbo.material m
JOIN dbo.rubro r ON r.id = m.rubro_id
LEFT JOIN dbo.obra_material om ON om.obra_id = %s AND om.material_id = m.id
LEFT JOIN dbo.v_precio_vigente pv ON pv.obra_id = %s AND pv.material_id = m.id
WHERE (m.obra_id IS NULL OR m.obra_id = %s)
  AND m.activo = 1
  AND ISNULL(om.oculto, 0) = 0
ORDER BY r.orden, nombre
"""


@router.get("/materiales")
def materiales(obra_id: str):
    return db.query(MATERIALES, (obra_id, obra_id, obra_id))


class MaterialNuevo(BaseModel):
    codigo: str = Field(min_length=1, max_length=32)
    nombre: str = Field(min_length=1, max_length=160)
    rubro_id: int
    unidad_consumo: str = Field(min_length=1, max_length=8)
    marca: str | None = None
    presentacion: str | None = None
    unidades_x_pres: float = 1.0


@router.post("/materiales", status_code=201)
def crear_material(obra_id: str, m: MaterialNuevo):
    """Material propio de la obra. No toca la biblioteca de nadie."""
    ya = db.query(
        "SELECT id FROM dbo.material WHERE obra_id = %s AND codigo = %s",
        (obra_id, m.codigo))
    if ya:
        raise HTTPException(409, f"Ya existe un material con el codigo {m.codigo} en esta obra.")
    db.execute(
        """INSERT INTO dbo.material
           (codigo, nombre, rubro_id, unidad_consumo, marca, presentacion,
            unidades_x_pres, obra_id)
           VALUES (%s,%s,%s,%s,%s,%s,%s,%s)""",
        (m.codigo, m.nombre, m.rubro_id, m.unidad_consumo, m.marca,
         m.presentacion, m.unidades_x_pres, obra_id))
    return db.query(MATERIALES.replace("ORDER BY r.orden, nombre",
                                       "AND m.codigo = %s AND m.obra_id = %s"),
                    (obra_id, obra_id, obra_id, m.codigo, obra_id))[0]


class MaterialCambio(BaseModel):
    nombre: str | None = None
    marca: str | None = None
    presentacion: str | None = None
    unidades_x_pres: float | None = None
    desperdicio_pct: float | None = None
    oculto: bool | None = None


_OVR = ("nombre", "marca", "presentacion", "unidades_x_pres", "desperdicio_pct", "oculto")


@router.patch("/materiales/{material_id}")
def editar_material(obra_id: str, material_id: int, c: MaterialCambio):
    """Guarda solo lo que se toco. Lo que queda en NULL sigue a la biblioteca."""
    campos = c.model_dump(exclude_unset=True)
    if not campos:
        return {"ok": True}
    existe = db.query(
        "SELECT 1 AS x FROM dbo.obra_material WHERE obra_id = %s AND material_id = %s",
        (obra_id, material_id))
    if existe:
        sets = ", ".join(f"{k} = %s" for k in campos if k in _OVR)
        db.execute(
            f"UPDATE dbo.obra_material SET {sets} WHERE obra_id = %s AND material_id = %s",
            tuple(campos[k] for k in campos if k in _OVR) + (obra_id, material_id))
    else:
        cols = [k for k in campos if k in _OVR]
        db.execute(
            f"""INSERT INTO dbo.obra_material (obra_id, material_id, {", ".join(cols)})
                VALUES (%s, %s, {", ".join(["%s"] * len(cols))})""",
            (obra_id, material_id) + tuple(campos[k] for k in cols))
    return {"ok": True}


@router.delete("/materiales/{material_id}/override")
def volver_a_biblioteca(obra_id: str, material_id: int):
    """Descarta las ediciones de este material y vuelve al valor de biblioteca."""
    db.execute("DELETE FROM dbo.obra_material WHERE obra_id = %s AND material_id = %s",
               (obra_id, material_id))
    return {"ok": True}


# ─────────────────────────────────────────── tareas y rendimientos

TAREAS = """
SELECT t.id,
       t.codigo,
       COALESCE(ot.nombre, t.nombre)                      AS nombre,
       t.unidad_medicion,
       r.nombre                                           AS rubro,
       r.orden                                            AS rubro_orden,
       CASE WHEN t.obra_id IS NULL THEN 0 ELSE 1 END      AS propia
FROM dbo.tarea_tipo t
JOIN dbo.rubro r ON r.id = t.rubro_id
LEFT JOIN dbo.obra_tarea ot ON ot.obra_id = %s AND ot.tarea_tipo_id = t.id
WHERE (t.obra_id IS NULL OR t.obra_id = %s)
  AND t.activo = 1
  AND ISNULL(ot.oculto, 0) = 0
ORDER BY r.orden, nombre
"""


@router.get("/tareas")
def tareas(obra_id: str):
    return db.query(TAREAS, (obra_id, obra_id))


COEFICIENTES = """
SELECT x.tarea_tipo_id,
       x.material_id,
       COALESCE(om.nombre, m.nombre)                   AS material,
       m.unidad_consumo,
       COALESCE(om.presentacion, m.presentacion)       AS presentacion,
       x.consumo,
       x.desperdicio_pct,
       x.editado
FROM (
    SELECT c.tarea_tipo_id, c.material_id,
           COALESCE(oc.consumo, c.consumo)                     AS consumo,
           COALESCE(oc.desperdicio_pct, c.desperdicio_pct)     AS desperdicio_pct,
           CASE WHEN oc.material_id IS NULL THEN 0 ELSE 1 END  AS editado
    FROM dbo.coeficiente c
    LEFT JOIN dbo.obra_coeficiente oc
           ON oc.obra_id = %s AND oc.tarea_tipo_id = c.tarea_tipo_id
          AND oc.material_id = c.material_id
    UNION ALL
    -- rendimientos que existen solo en esta obra (material agregado por vos)
    SELECT oc.tarea_tipo_id, oc.material_id, oc.consumo, oc.desperdicio_pct, 1
    FROM dbo.obra_coeficiente oc
    WHERE oc.obra_id = %s
      AND NOT EXISTS (SELECT 1 FROM dbo.coeficiente c
                      WHERE c.tarea_tipo_id = oc.tarea_tipo_id
                        AND c.material_id = oc.material_id)
) x
JOIN dbo.material m ON m.id = x.material_id
LEFT JOIN dbo.obra_material om ON om.obra_id = %s AND om.material_id = m.id
WHERE x.tarea_tipo_id = %s
  AND ISNULL(om.oculto, 0) = 0
ORDER BY material
"""


@router.get("/tareas/{tarea_id}/rendimientos")
def rendimientos(obra_id: str, tarea_id: int):
    return db.query(COEFICIENTES, (obra_id, obra_id, obra_id, tarea_id))


class Rendimiento(BaseModel):
    consumo: float = Field(gt=0)
    desperdicio_pct: float | None = None


@router.put("/tareas/{tarea_id}/rendimientos/{material_id}")
def guardar_rendimiento(obra_id: str, tarea_id: int, material_id: int, r: Rendimiento):
    ya = db.query(
        """SELECT 1 AS x FROM dbo.obra_coeficiente
           WHERE obra_id = %s AND tarea_tipo_id = %s AND material_id = %s""",
        (obra_id, tarea_id, material_id))
    if ya:
        db.execute(
            """UPDATE dbo.obra_coeficiente SET consumo = %s, desperdicio_pct = %s
               WHERE obra_id = %s AND tarea_tipo_id = %s AND material_id = %s""",
            (r.consumo, r.desperdicio_pct, obra_id, tarea_id, material_id))
    else:
        db.execute(
            """INSERT INTO dbo.obra_coeficiente
               (obra_id, tarea_tipo_id, material_id, consumo, desperdicio_pct)
               VALUES (%s,%s,%s,%s,%s)""",
            (obra_id, tarea_id, material_id, r.consumo, r.desperdicio_pct))
    return {"ok": True}


@router.delete("/tareas/{tarea_id}/rendimientos/{material_id}")
def borrar_rendimiento(obra_id: str, tarea_id: int, material_id: int):
    """Vuelve al rendimiento de la biblioteca. Si el material era propio,
    lo saca de la tarea."""
    db.execute(
        """DELETE FROM dbo.obra_coeficiente
           WHERE obra_id = %s AND tarea_tipo_id = %s AND material_id = %s""",
        (obra_id, tarea_id, material_id))
    return {"ok": True}


# ─────────────────────────────────────────── precios

class PrecioNuevo(BaseModel):
    material_id: int
    importe: float = Field(gt=0)
    iva_incluido: bool = True
    alicuota_iva: float = 21.0
    moneda: str = "ARS"
    vigente_desde: dt.date | None = None
    proveedor_id: int | None = None
    fuente: str | None = None


@router.post("/precios", status_code=201)
def cargar_precio(obra_id: str, p: PrecioNuevo):
    """El precio no se edita: se agrega. Cada cambio es una fila nueva."""
    db.execute(
        """INSERT INTO dbo.precio
           (obra_id, material_id, proveedor_id, moneda, importe,
            iva_incluido, alicuota_iva, vigente_desde, fuente)
           VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s)""",
        (obra_id, p.material_id, p.proveedor_id, p.moneda, p.importe,
         1 if p.iva_incluido else 0, p.alicuota_iva,
         p.vigente_desde or dt.date.today(), p.fuente))
    return {"ok": True}


@router.get("/materiales/{material_id}/precios")
def historial_precios(obra_id: str, material_id: int):
    return db.query(
        """SELECT id, importe, importe_final, iva_incluido, alicuota_iva,
                  moneda, vigente_desde, fuente, creado_en
           FROM dbo.precio
           WHERE obra_id = %s AND material_id = %s
           ORDER BY vigente_desde DESC, creado_en DESC""",
        (obra_id, material_id))


@router.get("/rubros")
def rubros(obra_id: str):
    return db.query("SELECT id, nombre, orden FROM dbo.rubro ORDER BY orden")
