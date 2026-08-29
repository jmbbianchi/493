"""
Cronograma, avance y las dos curvas.

LO QUE ESTE ARCHIVO EXISTE PARA CONTESTAR
-----------------------------------------
"¿Estas pagando mas rapido de lo que la obra avanza?" Es la tercera de las
tres preguntas y la unica que faltaba. Se contesta cruzando dos curvas
sobre el mismo eje de tiempo: cuanto llevas pagado y cuanto llevas
avanzado, las dos como porcentaje de la obra. La brecha entre ellas es la
respuesta.

Si el Gantt solo mostrara barras de plazos, no valdria el trabajo de
construirlo: eso ya lo hace un Excel.

EL PESO DE CADA TAREA
---------------------
El avance del rubro sale de sus tareas ponderadas por lo que cada una
cuesta (decision 13). El peso es el costo teorico de la tarea: los
materiales que consume mas su mano de obra.

Se usa el consumo SIN redondear a bulto. El redondeo existe para comprar
-- no se compran tres cuartos de bolsa -- pero aca el numero es un peso
relativo, y redondear cada tarea para arriba le daria mas peso a las que
usan materiales de bulto grande.

Si ninguna tarea del rubro tiene costo conocido, todas pesan igual y la
respuesta lo dice: un promedio simple es una hipotesis, no un hecho.
"""
from datetime import date, timedelta
from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from .. import db
from ..seguridad import requiere_clave

router = APIRouter(prefix="/api/obras/{obra_id}", tags=["cronograma"],
                   dependencies=[Depends(requiere_clave)])

# Cuanto vale cada tarea computada: materiales por precio vigente mas la
# mano de obra. Es el mismo motor de la lista de compra pero agrupado por
# fila de computo en vez de por material, y sin el redondeo a bulto.
PESOS = """
WITH coef AS (
    SELECT c.tarea_tipo_id, c.material_id,
           COALESCE(oc.consumo, c.consumo) AS consumo
    FROM dbo.coeficiente c
    LEFT JOIN dbo.obra_coeficiente oc
           ON oc.obra_id = %s AND oc.tarea_tipo_id = c.tarea_tipo_id
          AND oc.material_id = c.material_id
    UNION ALL
    SELECT oc.tarea_tipo_id, oc.material_id, oc.consumo
    FROM dbo.obra_coeficiente oc
    WHERE oc.obra_id = %s
      AND NOT EXISTS (SELECT 1 FROM dbo.coeficiente c
                      WHERE c.tarea_tipo_id = oc.tarea_tipo_id
                        AND c.material_id = oc.material_id)
)
SELECT cp.id,
       ISNULL(SUM(cp.cantidad * co.consumo * pv.importe_final), 0) AS materiales,
       ISNULL(MAX(cp.cantidad * COALESCE(ot.costo_mo, t.costo_mo)), 0) AS mano_obra
FROM dbo.computo cp
JOIN dbo.tarea_tipo t ON t.id = cp.tarea_tipo_id
LEFT JOIN dbo.obra_tarea ot ON ot.obra_id = cp.obra_id AND ot.tarea_tipo_id = t.id
LEFT JOIN coef co ON co.tarea_tipo_id = cp.tarea_tipo_id
LEFT JOIN dbo.v_precio_vigente pv ON pv.obra_id = %s AND pv.material_id = co.material_id
WHERE cp.obra_id = %s
GROUP BY cp.id
"""


class Fechas(BaseModel):
    fecha_inicio: date | None = None
    fecha_fin: date | None = None
    subrubro_id: int | None = None


class Avance(BaseModel):
    avance_pct: float = Field(ge=0, le=100)
    fecha: date | None = None
    nota: str | None = None


class Dependencia(BaseModel):
    depende_de_id: str
    dias_desfase: int = 0


def _pesos(obra_id: str) -> dict:
    filas = db.query(PESOS, (obra_id, obra_id, obra_id, obra_id))
    return {str(f["id"]): Decimal(str(f["materiales"])) + Decimal(str(f["mano_obra"]))
            for f in filas}


@router.get("/cronograma")
def cronograma(obra_id: str):
    """Las tareas con sus fechas, su avance y su peso, agrupadas por rubro."""
    tareas = db.query(
        """SELECT id, rubro_id, rubro, rubro_orden, subrubro_id, subrubro, tarea,
                  unidad_medicion, ubicacion, cantidad, fecha_inicio, fecha_fin,
                  avance_pct, avance_fecha, tiene_avance
           FROM dbo.v_cronograma WHERE obra_id = %s
           ORDER BY rubro_orden, fecha_inicio, tarea""",
        (obra_id,))

    deps = db.query(
        """SELECT d.computo_id, d.depende_de_id, d.dias_desfase
           FROM dbo.tarea_dependencia d
           JOIN dbo.computo c ON c.id = d.computo_id
           WHERE c.obra_id = %s""", (obra_id,))

    pesos = _pesos(obra_id)
    total_peso = sum(pesos.values())
    # Sin ningun costo cargado no hay como ponderar: todas pesan igual y la
    # respuesta lo dice, porque un promedio simple es una hipotesis.
    ponderado = total_peso > 0

    salida = []
    for t in tareas:
        tid = str(t["id"])
        peso = pesos.get(tid, Decimal(0))
        salida.append({
            **t, "id": tid,
            "peso": float(peso),
            "peso_pct": float(peso / total_peso * 100) if ponderado else None,
            "avance_pct": float(t["avance_pct"]),
            "dependencias": [{"depende_de_id": str(d["depende_de_id"]),
                              "dias_desfase": d["dias_desfase"]}
                             for d in deps if str(d["computo_id"]) == tid],
        })

    avance = _avance_obra(salida, ponderado)
    return {
        "tareas": salida,
        "avance_obra_pct": avance,
        "ponderado": ponderado,
        "rubros": _avance_por_rubro(salida, ponderado),
    }


def _avance_obra(tareas: list[dict], ponderado: bool) -> float:
    if not tareas:
        return 0.0
    if ponderado:
        peso = sum(t["peso"] for t in tareas)
        if peso:
            return sum(t["peso"] * t["avance_pct"] for t in tareas) / peso
    return sum(t["avance_pct"] for t in tareas) / len(tareas)


def _avance_por_rubro(tareas: list[dict], ponderado: bool) -> list[dict]:
    grupos: dict = {}
    for t in tareas:
        g = grupos.setdefault(t["rubro_id"], {
            "rubro_id": t["rubro_id"], "rubro": t["rubro"],
            "rubro_orden": t["rubro_orden"], "tareas": [],
        })
        g["tareas"].append(t)
    salida = []
    for g in grupos.values():
        fechas_i = [t["fecha_inicio"] for t in g["tareas"] if t["fecha_inicio"]]
        fechas_f = [t["fecha_fin"] for t in g["tareas"] if t["fecha_fin"]]
        salida.append({
            "rubro_id": g["rubro_id"], "rubro": g["rubro"],
            "rubro_orden": g["rubro_orden"],
            "tareas": len(g["tareas"]),
            "avance_pct": _avance_obra(g["tareas"], ponderado),
            "peso_pct": (sum(t["peso_pct"] or 0 for t in g["tareas"])
                         if ponderado else None),
            "desde": min(fechas_i) if fechas_i else None,
            "hasta": max(fechas_f) if fechas_f else None,
            "con_fecha": sum(1 for t in g["tareas"] if t["fecha_inicio"]),
        })
    salida.sort(key=lambda g: g["rubro_orden"])
    return salida


@router.patch("/cronograma/{computo_id}")
def mover(obra_id: str, computo_id: str, f: Fechas):
    """Mueve una tarea y empuja a las que dependen de ella.

    No es un motor de camino critico: eso es otro producto. Lo unico que
    hace es que si una tarea se corre dos semanas, las que dependen de ella
    se corren tambien, conservando su duracion y su desfase.
    """
    fila = db.query(
        "SELECT fecha_inicio, fecha_fin FROM dbo.computo WHERE id = %s AND obra_id = %s",
        (computo_id, obra_id))
    if not fila:
        raise HTTPException(404, "No existe esa tarea en esta obra.")

    campos = f.model_dump(exclude_unset=True)
    if not campos:
        return {"movidas": 0}
    sets = ", ".join(f"{k} = %s" for k in campos)
    db.execute(f"UPDATE dbo.computo SET {sets} WHERE id = %s",
               tuple(campos.values()) + (computo_id,))

    movidas = _empujar(obra_id, computo_id) if "fecha_fin" in campos or "fecha_inicio" in campos else 0
    return {"movidas": movidas}


def _empujar(obra_id: str, raiz: str) -> int:
    """Corre las tareas que dependen de la raiz, en cadena.

    Se trae TODO el grafo de una vez y se recorre en memoria. Ir a la base
    por cada dependiente serian N conexiones nuevas, porque db.py abre y
    cierra por operacion; con una cadena de diez tareas son diez esperas de
    red que se notan.
    """
    tareas = {str(t["id"]): t for t in db.query(
        "SELECT id, fecha_inicio, fecha_fin FROM dbo.computo WHERE obra_id = %s",
        (obra_id,))}
    deps = db.query(
        """SELECT d.computo_id, d.depende_de_id, d.dias_desfase
           FROM dbo.tarea_dependencia d
           JOIN dbo.computo c ON c.id = d.computo_id
           WHERE c.obra_id = %s""", (obra_id,))

    hijos: dict = {}
    for d in deps:
        hijos.setdefault(str(d["depende_de_id"]), []).append(
            (str(d["computo_id"]), d["dias_desfase"]))

    cambios: dict = {}
    # Anchura y no profundidad, con un tope: si alguien armo un ciclo
    # -- A depende de B y B de A -- esto termina igual en vez de colgarse.
    pendientes = [raiz]
    vistos = set()
    for _ in range(len(tareas) + 1):
        if not pendientes:
            break
        siguiente = []
        for padre in pendientes:
            if padre in vistos:
                continue
            vistos.add(padre)
            fin_padre = cambios.get(padre, {}).get("fecha_fin") or tareas[padre]["fecha_fin"]
            if not fin_padre:
                continue
            for hijo, desfase in hijos.get(padre, []):
                t = tareas.get(hijo)
                if not t or not t["fecha_inicio"]:
                    continue
                inicio_actual = cambios.get(hijo, {}).get("fecha_inicio") or t["fecha_inicio"]
                fin_actual = cambios.get(hijo, {}).get("fecha_fin") or t["fecha_fin"]
                nuevo_inicio = fin_padre + timedelta(days=desfase)
                if nuevo_inicio <= inicio_actual:
                    # Solo empuja hacia adelante. Si la tarea anterior se
                    # adelanto, la siguiente no se adelanta sola: quien
                    # decide arrancar antes es una persona, no el calendario.
                    continue
                dias = (nuevo_inicio - inicio_actual).days
                cambios[hijo] = {
                    "fecha_inicio": nuevo_inicio,
                    # La duracion se conserva: mover no es reprogramar.
                    "fecha_fin": (fin_actual + timedelta(days=dias)) if fin_actual else None,
                }
                siguiente.append(hijo)
        pendientes = siguiente

    if cambios:
        with db.cursor() as cur:
            for cid, c in cambios.items():
                cur.execute(
                    "UPDATE dbo.computo SET fecha_inicio = %s, fecha_fin = %s WHERE id = %s",
                    (c["fecha_inicio"], c["fecha_fin"], cid))
    return len(cambios)


@router.post("/cronograma/{computo_id}/avance", status_code=201)
def cargar_avance(obra_id: str, computo_id: str, a: Avance):
    """Un punto de la serie. Volver a cargar el mismo dia corrige."""
    fila = db.query("SELECT 1 AS x FROM dbo.computo WHERE id = %s AND obra_id = %s",
                    (computo_id, obra_id))
    if not fila:
        raise HTTPException(404, "No existe esa tarea en esta obra.")
    cuando = a.fecha or date.today()
    db.execute(
        """MERGE dbo.avance_tarea AS destino
           USING (SELECT %s AS computo_id, %s AS fecha) AS origen
              ON destino.computo_id = origen.computo_id AND destino.fecha = origen.fecha
           WHEN MATCHED THEN UPDATE SET avance_pct = %s, nota = %s
           WHEN NOT MATCHED THEN
             INSERT (computo_id, fecha, avance_pct, nota) VALUES (%s, %s, %s, %s);""",
        (computo_id, cuando, a.avance_pct, a.nota,
         computo_id, cuando, a.avance_pct, a.nota))
    return {"fecha": cuando, "avance_pct": a.avance_pct}


@router.put("/cronograma/{computo_id}/dependencias")
def guardar_dependencias(obra_id: str, computo_id: str, deps: list[Dependencia]):
    fila = db.query("SELECT 1 AS x FROM dbo.computo WHERE id = %s AND obra_id = %s",
                    (computo_id, obra_id))
    if not fila:
        raise HTTPException(404, "No existe esa tarea en esta obra.")
    with db.cursor() as cur:
        cur.execute("DELETE FROM dbo.tarea_dependencia WHERE computo_id = %s", (computo_id,))
        for d in deps:
            if d.depende_de_id == computo_id:
                continue
            cur.execute(
                """INSERT INTO dbo.tarea_dependencia (computo_id, depende_de_id, dias_desfase)
                   VALUES (%s,%s,%s)""", (computo_id, d.depende_de_id, d.dias_desfase))
    return {"dependencias": len(deps)}


# ─────────────────────────────────────────── las dos curvas

@router.get("/curvas")
def curvas(obra_id: str, escala: str = "semana"):
    """Pagado contra avance, sobre el mismo eje de tiempo.

    Las dos en porcentaje de la obra, que es lo unico que las hace
    comparables: pesos contra metros cuadrados no se cruzan.

    El pagado se mide contra lo comprometido -- la suma de los
    presupuestos elegidos -- y no contra el teorico, porque lo que hay que
    pagar es lo que se acordo con los proveedores, no lo que decia el
    computo.
    """
    if escala not in ("dia", "semana", "mes", "anio"):
        raise HTTPException(400, "La escala va en dia, semana, mes o anio.")

    pagos = db.query(
        """SELECT fecha, monto_ars FROM dbo.v_pago_ars
           WHERE obra_id = %s AND anulado = 0 AND monto_ars IS NOT NULL
           ORDER BY fecha""", (obra_id,))

    avances = db.query(
        """SELECT a.computo_id, a.fecha, a.avance_pct
           FROM dbo.avance_tarea a
           JOIN dbo.computo c ON c.id = a.computo_id
           WHERE c.obra_id = %s ORDER BY a.fecha""", (obra_id,))

    comprometido = db.query(
        """SELECT ISNULL(SUM(monto_base), 0) AS total FROM dbo.presupuesto
           WHERE obra_id = %s AND estado = 'confirmado' AND elegido = 1""",
        (obra_id,))[0]["total"]
    comprometido = Decimal(str(comprometido))

    pesos = _pesos(obra_id)
    total_peso = sum(pesos.values())
    ponderado = total_peso > 0
    cantidad_tareas = len(pesos)

    def cubeta(f: date) -> date:
        if escala == "dia":
            return f
        if escala == "semana":
            return f - timedelta(days=f.weekday())
        if escala == "mes":
            return date(f.year, f.month, 1)
        return date(f.year, 1, 1)

    # Todas las fechas donde paso algo, de las dos series.
    momentos = sorted({cubeta(p["fecha"]) for p in pagos}
                      | {cubeta(a["fecha"]) for a in avances})

    puntos = []
    acum_pago = Decimal(0)
    i_pago = 0
    # El avance de cada tarea al momento que se este mirando: se va
    # pisando a medida que avanza el tiempo, y por eso la serie tiene que
    # estar ordenada por fecha.
    ultimo: dict = {}
    i_av = 0

    for m in momentos:
        while i_pago < len(pagos) and cubeta(pagos[i_pago]["fecha"]) <= m:
            acum_pago += Decimal(str(pagos[i_pago]["monto_ars"]))
            i_pago += 1
        while i_av < len(avances) and cubeta(avances[i_av]["fecha"]) <= m:
            a = avances[i_av]
            ultimo[str(a["computo_id"])] = Decimal(str(a["avance_pct"]))
            i_av += 1

        if ponderado:
            avance = sum(pesos.get(k, Decimal(0)) * v for k, v in ultimo.items()) / total_peso
        elif cantidad_tareas:
            avance = sum(ultimo.values()) / cantidad_tareas
        else:
            avance = Decimal(0)

        puntos.append({
            "fecha": m,
            "pagado": float(acum_pago),
            "pagado_pct": float(acum_pago / comprometido * 100) if comprometido else None,
            "avance_pct": float(avance),
        })

    return {
        "escala": escala,
        "puntos": puntos,
        "comprometido": float(comprometido),
        "ponderado": ponderado,
        # Sin presupuestos elegidos no hay contra que medir el pagado: la
        # curva de plata queda en pesos y sin porcentaje, y se dice.
        "hay_comprometido": comprometido > 0,
    }
