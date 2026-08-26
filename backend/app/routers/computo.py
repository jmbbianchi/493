"""
Computo y lista de materiales.

Aca vive el motor que reemplaza a las 798 formulas de Corralon_Mat:

    a_comprar = TECHO( SUM_tareas( cantidad x consumo x (1 + desperdicio) )
                       / unidades_por_presentacion )

El redondeo va UNA vez, al final, sobre el total consolidado de todas las
tareas que usan ese material. Nunca por tarea: redondear por tarea infla la
compra y es uno de los errores que tenia la planilla.

El desperdicio sale de la primera cascada que encuentre un valor:
    coeficiente -> material -> obra
"""
import uuid

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from .. import db
from ..seguridad import requiere_clave

router = APIRouter(prefix="/api/obras/{obra_id}", tags=["computo"],
                   dependencies=[Depends(requiere_clave)])

COMPUTO = """
SELECT c.id, c.tarea_tipo_id,
       COALESCE(ot.nombre, t.nombre) AS tarea,
       t.unidad_medicion,
       r.nombre AS rubro,
       c.ubicacion, c.cantidad, c.cerrado, c.notas
FROM dbo.computo c
JOIN dbo.tarea_tipo t ON t.id = c.tarea_tipo_id
JOIN dbo.rubro r ON r.id = t.rubro_id
LEFT JOIN dbo.obra_tarea ot ON ot.obra_id = c.obra_id AND ot.tarea_tipo_id = t.id
WHERE c.obra_id = %s
"""


@router.get("/computo")
def listar(obra_id: str):
    return db.query(COMPUTO + " ORDER BY r.orden, tarea, c.ubicacion", (obra_id,))


class Fila(BaseModel):
    tarea_tipo_id: int
    ubicacion: str | None = None
    cantidad: float = Field(gt=0)
    notas: str | None = None


class FilaCambio(BaseModel):
    ubicacion: str | None = None
    cantidad: float | None = Field(default=None, gt=0)
    notas: str | None = None


@router.post("/computo", status_code=201)
def agregar(obra_id: str, f: Fila):
    nuevo = str(uuid.uuid4())
    db.execute(
        """INSERT INTO dbo.computo (id, obra_id, tarea_tipo_id, ubicacion, cantidad, notas)
           VALUES (%s,%s,%s,%s,%s,%s)""",
        (nuevo, obra_id, f.tarea_tipo_id, f.ubicacion, f.cantidad, f.notas))
    filas = db.query(COMPUTO + " AND c.id = %s", (obra_id, nuevo))
    return filas[0]


@router.patch("/computo/{fila_id}")
def editar(obra_id: str, fila_id: str, c: FilaCambio):
    cerrada = db.query("SELECT cerrado FROM dbo.computo WHERE id = %s AND obra_id = %s",
                       (fila_id, obra_id))
    if not cerrada:
        raise HTTPException(404, "No existe esa fila de computo.")
    if cerrada[0]["cerrado"]:
        raise HTTPException(409, "La fila esta cerrada. Reabrila para editarla.")
    campos = {k: v for k, v in c.model_dump(exclude_unset=True).items()
              if k in ("ubicacion", "cantidad", "notas")}
    if campos:
        sets = ", ".join(f"{k} = %s" for k in campos)
        db.execute(f"UPDATE dbo.computo SET {sets} WHERE id = %s",
                   tuple(campos.values()) + (fila_id,))
    return db.query(COMPUTO + " AND c.id = %s", (obra_id, fila_id))[0]


@router.delete("/computo/{fila_id}")
def borrar(obra_id: str, fila_id: str):
    n = db.execute("DELETE FROM dbo.computo WHERE id = %s AND obra_id = %s AND cerrado = 0",
                   (fila_id, obra_id))
    if not n:
        raise HTTPException(409, "No se borro: o no existe, o esta cerrada.")
    return {"ok": True}


# ─────────────────────────────────────────── el motor

LISTA = """
WITH mat AS (
    SELECT m.id,
           COALESCE(om.nombre, m.nombre)                   AS nombre,
           COALESCE(om.marca, m.marca)                     AS marca,
           m.unidad_consumo,
           COALESCE(om.presentacion, m.presentacion)       AS presentacion,
           COALESCE(om.unidades_x_pres, m.unidades_x_pres) AS unidades_x_pres,
           COALESCE(om.desperdicio_pct, m.desperdicio_pct) AS desp_material,
           r.nombre AS rubro, r.orden AS rubro_orden
    FROM dbo.material m
    JOIN dbo.rubro r ON r.id = m.rubro_id
    LEFT JOIN dbo.obra_material om ON om.obra_id = %s AND om.material_id = m.id
    WHERE (m.obra_id IS NULL OR m.obra_id = %s)
      AND m.activo = 1
      AND ISNULL(om.oculto, 0) = 0
),
coef AS (
    SELECT c.tarea_tipo_id, c.material_id,
           COALESCE(oc.consumo, c.consumo)                 AS consumo,
           COALESCE(oc.desperdicio_pct, c.desperdicio_pct) AS desp_coef
    FROM dbo.coeficiente c
    LEFT JOIN dbo.obra_coeficiente oc
           ON oc.obra_id = %s AND oc.tarea_tipo_id = c.tarea_tipo_id
          AND oc.material_id = c.material_id
    UNION ALL
    SELECT oc.tarea_tipo_id, oc.material_id, oc.consumo, oc.desperdicio_pct
    FROM dbo.obra_coeficiente oc
    WHERE oc.obra_id = %s
      AND NOT EXISTS (SELECT 1 FROM dbo.coeficiente c
                      WHERE c.tarea_tipo_id = oc.tarea_tipo_id
                        AND c.material_id = oc.material_id)
),
uso AS (
    SELECT co.material_id,
           SUM(cp.cantidad * co.consumo) AS consumo_neto,
           SUM(cp.cantidad * co.consumo *
               (1 + COALESCE(co.desp_coef, mat.desp_material, %s) / 100.0)) AS consumo_bruto
    FROM dbo.computo cp
    JOIN coef co ON co.tarea_tipo_id = cp.tarea_tipo_id
    JOIN mat     ON mat.id = co.material_id
    WHERE cp.obra_id = %s
    GROUP BY co.material_id
)
SELECT mat.id AS material_id, mat.nombre, mat.marca, mat.rubro,
       mat.unidad_consumo, mat.presentacion, mat.unidades_x_pres,
       CAST(uso.consumo_neto  AS decimal(18,4)) AS consumo_neto,
       CAST(uso.consumo_bruto AS decimal(18,4)) AS consumo_bruto,
       CEILING(uso.consumo_bruto / mat.unidades_x_pres) AS a_comprar,
       pv.importe_final AS precio_unitario,
       pv.moneda,
       pv.vigente_desde AS precio_desde,
       CASE WHEN pv.importe_final IS NULL THEN NULL
            ELSE CAST(CEILING(uso.consumo_bruto / mat.unidades_x_pres)
                      * pv.importe_final AS decimal(18,2)) END AS subtotal
FROM uso
JOIN mat ON mat.id = uso.material_id
LEFT JOIN dbo.v_precio_vigente pv ON pv.obra_id = %s AND pv.material_id = mat.id
ORDER BY mat.rubro_orden, mat.nombre
"""


@router.get("/lista-materiales")
def lista_materiales(obra_id: str):
    obra = db.query("SELECT desperdicio_pct FROM dbo.obra WHERE id = %s", (obra_id,))
    if not obra:
        raise HTTPException(404, "No existe esa obra.")
    desp = float(obra[0]["desperdicio_pct"])
    filas = db.query(LISTA, (obra_id, obra_id, obra_id, obra_id, desp, obra_id, obra_id))
    total = sum(float(f["subtotal"]) for f in filas if f["subtotal"] is not None)
    sin_precio = [f["nombre"] for f in filas if f["subtotal"] is None]
    return {"filas": filas, "total": total, "sin_precio": sin_precio,
            "desperdicio_obra": desp}
