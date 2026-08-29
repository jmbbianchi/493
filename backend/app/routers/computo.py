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
from ..acceso import exige_acceso

router = APIRouter(prefix="/api/obras/{obra_id}", tags=["computo"],
                   dependencies=[Depends(exige_acceso)])

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


# ─────────────────────────────────────────── computo de material directo

COMPUTO_MATERIAL = """
SELECT cm.id, cm.material_id,
       COALESCE(om.nombre, m.nombre) AS material,
       m.unidad_consumo, m.tipo,
       COALESCE(om.presentacion, m.presentacion) AS presentacion,
       r.nombre AS rubro,
       cm.ubicacion, cm.cantidad, cm.notas
FROM dbo.computo_material cm
JOIN dbo.material m ON m.id = cm.material_id
JOIN dbo.rubro r ON r.id = m.rubro_id
LEFT JOIN dbo.obra_material om ON om.obra_id = cm.obra_id AND om.material_id = m.id
WHERE cm.obra_id = %s
"""


class FilaMaterial(BaseModel):
    material_id: int
    ubicacion: str | None = None
    cantidad: float = Field(gt=0)
    notas: str | None = None


@router.get("/computo-material")
def listar_material(obra_id: str):
    return db.query(COMPUTO_MATERIAL + " ORDER BY r.orden, material, cm.ubicacion", (obra_id,))


@router.post("/computo-material", status_code=201)
def agregar_material(obra_id: str, f: FilaMaterial):
    """Siete caños, tres inodoros, una ventana. Sin coeficiente de por medio."""
    nuevo = str(uuid.uuid4())
    db.execute(
        """INSERT INTO dbo.computo_material (id, obra_id, material_id, ubicacion, cantidad, notas)
           VALUES (%s,%s,%s,%s,%s,%s)""",
        (nuevo, obra_id, f.material_id, f.ubicacion, f.cantidad, f.notas))
    filas = db.query(COMPUTO_MATERIAL + " AND cm.id = %s", (obra_id, nuevo))
    return filas[0]


@router.delete("/computo-material/{fila_id}")
def borrar_material(obra_id: str, fila_id: str):
    n = db.execute("DELETE FROM dbo.computo_material WHERE id = %s AND obra_id = %s",
                   (fila_id, obra_id))
    if not n:
        raise HTTPException(404, "No existe esa fila.")
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
           m.tipo,
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
crudo AS (
    /* Material por rendimiento: sale del computo de tareas por su
       coeficiente. El desperdicio cae en cascada coeficiente -> material
       -> obra. */
    SELECT co.material_id,
           cp.cantidad * co.consumo AS neto,
           cp.cantidad * co.consumo *
               (1 + COALESCE(co.desp_coef, mat.desp_material, %s) / 100.0) AS bruto
    FROM dbo.computo cp
    JOIN coef co ON co.tarea_tipo_id = cp.tarea_tipo_id
    JOIN mat     ON mat.id = co.material_id
    WHERE cp.obra_id = %s

    UNION ALL

    /* Material por cantidad: caños, artefactos, aberturas. La cantidad es
       literal -- son siete caños, no siete m2 de cañeria -- asi que NO se
       le aplica el desperdicio por defecto de la obra. Aplicarselo
       convertiria tres ventanas en cuatro. Si un material de estos tiene
       recorte real, se le carga su propio desperdicio y ese si se usa. */
    SELECT cm.material_id,
           cm.cantidad AS neto,
           cm.cantidad * (1 + COALESCE(mat.desp_material, 0) / 100.0) AS bruto
    FROM dbo.computo_material cm
    JOIN mat ON mat.id = cm.material_id
    WHERE cm.obra_id = %s
),
uso AS (
    /* Se reagrupa porque un mismo material puede entrar por las dos vias,
       y el redondeo tiene que ir una sola vez sobre el total consolidado. */
    SELECT material_id,
           SUM(neto)  AS consumo_neto,
           SUM(bruto) AS consumo_bruto
    FROM crudo
    GROUP BY material_id
)
SELECT mat.id AS material_id, mat.nombre, mat.marca, mat.rubro, mat.tipo,
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


MANO_OBRA = """
SELECT r.nombre AS rubro, r.orden AS rubro_orden,
       COALESCE(ot.nombre, t.nombre) AS tarea,
       t.unidad_medicion,
       SUM(c.cantidad) AS cantidad,
       COALESCE(ot.costo_mo, t.costo_mo) AS costo_unitario,
       CASE WHEN COALESCE(ot.costo_mo, t.costo_mo) IS NULL THEN NULL
            ELSE CAST(SUM(c.cantidad) * COALESCE(ot.costo_mo, t.costo_mo)
                      AS decimal(18,2)) END AS subtotal
FROM dbo.computo c
JOIN dbo.tarea_tipo t ON t.id = c.tarea_tipo_id
JOIN dbo.rubro r ON r.id = t.rubro_id
LEFT JOIN dbo.obra_tarea ot ON ot.obra_id = c.obra_id AND ot.tarea_tipo_id = t.id
WHERE c.obra_id = %s
GROUP BY r.nombre, r.orden, COALESCE(ot.nombre, t.nombre), t.unidad_medicion,
         COALESCE(ot.costo_mo, t.costo_mo)
ORDER BY r.orden, tarea
"""


@router.get("/lista-materiales")
def lista_materiales(obra_id: str):
    """El teorico de la obra: materiales mas mano de obra.

    Devuelve el desglose por rubro ya consolidado. Antes cada pantalla
    reagrupaba las filas por su cuenta y hacian tres cuentas distintas
    para el mismo numero; la unica que puede decidir que entra en el
    teorico de un rubro es esta funcion.
    """
    obra = db.query("SELECT desperdicio_pct FROM dbo.obra WHERE id = %s", (obra_id,))
    if not obra:
        raise HTTPException(404, "No existe esa obra.")
    desp = float(obra[0]["desperdicio_pct"])

    filas = db.query(LISTA, (obra_id, obra_id, obra_id, obra_id,
                             desp, obra_id, obra_id, obra_id))
    mano_obra = db.query(MANO_OBRA, (obra_id,))
    sin_coef = db.query(
        """SELECT tarea, rubro, tiene_mano_obra FROM dbo.v_tarea_sin_coeficiente
           WHERE obra_id = %s""", (obra_id,))

    total_mat = sum(float(f["subtotal"]) for f in filas if f["subtotal"] is not None)
    total_mo = sum(float(f["subtotal"]) for f in mano_obra if f["subtotal"] is not None)
    sin_precio = [f["nombre"] for f in filas if f["subtotal"] is None]
    sin_costo_mo = [f["tarea"] for f in mano_obra if f["subtotal"] is None]

    return {
        "filas": filas,
        "mano_obra": mano_obra,
        "rubros": _teorico_por_rubro(filas, mano_obra),
        "total_materiales": total_mat,
        "total_mano_obra": total_mo,
        "total": total_mat + total_mo,
        "sin_precio": sin_precio,
        "sin_costo_mano_obra": sin_costo_mo,
        "tareas_sin_coeficiente": sin_coef,
        "desperdicio_obra": desp,
    }


def _teorico_por_rubro(filas: list[dict], mano_obra: list[dict]) -> list[dict]:
    """Materiales + mano de obra por rubro, y si el numero esta completo.

    "Completo" no quiere decir que sea correcto: quiere decir que no falta
    ningun precio ni ningun costo de mano de obra dentro de ese rubro. Un
    rubro incompleto muestra un numero que es DE MENOS, y eso hay que
    poder decirlo en la pantalla en vez de dejar que se lea como total.
    """
    acc: dict = {}

    def entrada(rubro: str) -> dict:
        return acc.setdefault(rubro, {
            "rubro": rubro, "materiales": 0.0, "mano_obra": 0.0,
            "falta_precio": 0, "falta_costo_mo": 0, "items": 0,
        })

    for f in filas:
        e = entrada(f["rubro"])
        e["items"] += 1
        if f["subtotal"] is None:
            e["falta_precio"] += 1
        else:
            e["materiales"] += float(f["subtotal"])

    for f in mano_obra:
        e = entrada(f["rubro"])
        e["items"] += 1
        if f["subtotal"] is None:
            e["falta_costo_mo"] += 1
        else:
            e["mano_obra"] += float(f["subtotal"])

    salida = []
    for e in acc.values():
        conocido = e["falta_precio"] + e["falta_costo_mo"] < e["items"]
        salida.append({
            **e,
            "total": e["materiales"] + e["mano_obra"],
            # Sin un solo dato conocido el teorico no es cero: es
            # desconocido, y la pantalla tiene que mostrar raya.
            "hay": conocido,
            "completo": e["falta_precio"] == 0 and e["falta_costo_mo"] == 0,
        })
    return salida
