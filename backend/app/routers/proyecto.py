"""Edicion atomica del proyecto, con revision para evitar pisar otra sesion."""
from ..fechas import hoy_argentina
from datetime import date
from typing import Literal
from uuid import UUID, uuid4

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, ConfigDict, Field, field_validator

from .. import db
from ..acceso import exige_acceso
from ..planificacion import resumir, validar_y_programar

router = APIRouter(prefix="/api/obras/{obra_id}/proyecto", tags=["proyecto"])


class Revision(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)
    version: int = Field(ge=0)


class Rubro(Revision):
    nombre: str = Field(min_length=1, max_length=100)
    orden: int = Field(default=0, ge=0, le=100000)


class Dependencia(BaseModel):
    model_config = ConfigDict(extra="forbid")
    depende_de_id: UUID
    dias_desfase: int = Field(default=0, ge=-3650, le=3650)


class Tarea(Revision):
    nombre: str = Field(min_length=1, max_length=200)
    rubro_id: UUID
    padre_id: UUID | None = None
    tipo: Literal["tarea", "grupo", "hito"] = "tarea"
    responsable: str | None = Field(default=None, max_length=160)
    fecha_inicio: date | None = None
    fecha_fin: date | None = None
    orden: int = Field(default=0, ge=0, le=100000)
    notas: str | None = Field(default=None, max_length=2000)
    dependencias: list[Dependencia] = Field(default_factory=list, max_length=100)


class Avance(Revision):
    fecha: date
    avance_pct: float = Field(ge=0, le=100, allow_inf_nan=False)
    nota: str | None = Field(default=None, max_length=1000)

    @field_validator("fecha")
    @classmethod
    def no_futuro(cls, valor):
        if valor > hoy_argentina():
            raise ValueError("El avance real no puede registrarse en una fecha futura.")
        return valor


class Vinculos(Revision):
    tarea_ids: list[UUID] = Field(default_factory=list, max_length=200)


def _abrir(cur, obra_id, version=None):
    # Todas las mutaciones toman el mismo bloqueo por obra antes de leer el
    # grafo. La revision rechaza formularios viejos aun con dos editores.
    # XLOCK tambien excluye lecturas compartidas: GET no debe combinar una
    # revision anterior con tareas ya modificadas por otro editor.
    bloqueo = "XLOCK, HOLDLOCK" if version is not None else "HOLDLOCK"
    cur.execute(f"SELECT id FROM dbo.obra WITH ({bloqueo}) WHERE id=%s", (str(obra_id),))
    if not cur.fetchone():
        raise HTTPException(404, "No existe esa obra.")
    cur.execute("SELECT OBJECT_ID('dbo.proyecto_revision','U') AS tabla")
    if cur.fetchone()["tabla"] is None:
        raise HTTPException(503, "La planificación de este proyecto todavía no está habilitada.")
    cur.execute("SELECT version FROM dbo.proyecto_revision WHERE obra_id=%s", (str(obra_id),))
    fila = cur.fetchone()
    actual = fila["version"] if fila else 0
    if version is not None and version != actual:
        raise HTTPException(409, "Otra sesión modificó el proyecto. Cerrá el editor y actualizá antes de guardar.")
    return actual


def _incrementar(cur, obra_id, version):
    cur.execute("UPDATE dbo.proyecto_revision SET version=version+1 WHERE obra_id=%s", (str(obra_id),))
    if not cur.rowcount:
        cur.execute("INSERT dbo.proyecto_revision (obra_id,version,importado) VALUES (%s,1,1)", (str(obra_id),))
    return version + 1


def _leer(cur, obra_id):
    cur.execute("SELECT id,nombre,orden FROM dbo.proyecto_rubro WHERE obra_id=%s ORDER BY orden,nombre,id", (str(obra_id),))
    rubros = cur.fetchall()
    for r in rubros:
        r["id"] = str(r["id"])
    cur.execute("""SELECT t.id,t.rubro_id,t.padre_id,t.nombre,t.tipo,t.responsable,
        t.fecha_inicio,t.fecha_fin,t.orden,t.notas,t.computo_origen_id,
        a.fecha AS avance_fecha,a.avance_pct
        FROM dbo.proyecto_tarea t OUTER APPLY (
          SELECT TOP 1 fecha,avance_pct FROM dbo.proyecto_avance a
          WHERE a.obra_id=t.obra_id AND a.tarea_id=t.id AND a.fecha<=CAST(SYSUTCDATETIME() AT TIME ZONE 'UTC' AT TIME ZONE 'Argentina Standard Time' AS date)
          ORDER BY fecha DESC) a
        WHERE t.obra_id=%s ORDER BY t.orden,t.nombre,t.id""", (str(obra_id),))
    tareas = cur.fetchall()
    cur.execute("SELECT tarea_id,depende_de_id,dias_desfase FROM dbo.proyecto_dependencia WHERE obra_id=%s", (str(obra_id),))
    deps = cur.fetchall()
    for t in tareas:
        for campo in ("id", "rubro_id", "padre_id", "computo_origen_id"):
            t[campo] = str(t[campo]) if t[campo] is not None else None
        t["tiene_avance"] = t["avance_pct"] is not None
        t["avance_pct"] = float(t["avance_pct"]) if t["tiene_avance"] else None
        t["dependencias"] = [{"depende_de_id": str(d["depende_de_id"]), "dias_desfase": d["dias_desfase"]}
                              for d in deps if str(d["tarea_id"]) == t["id"]]
    return tareas, rubros


@router.get("")
def ver(obra_id: UUID, acceso: dict = Depends(exige_acceso)):
    with db.cursor() as cur:
        version = _abrir(cur, obra_id)
        tareas, rubros = _leer(cur, obra_id)
    resumen = resumir(tareas, rubros)
    return {"version": version, "editable": acceso["rol"] == "editor",
            "tareas": tareas, "rubros": rubros, "resumen": resumen,
            "criterio_avance": "Promedio simple de tareas e hitos; las tareas sin avance cuentan como 0 %."}


def _guardar_rubro(obra_id, datos, rubro_id=None):
    nuevo = str(rubro_id or uuid4())
    with db.cursor() as cur:
        _abrir(cur, obra_id, datos.version)
        if rubro_id:
            cur.execute("SELECT id FROM dbo.proyecto_rubro WHERE obra_id=%s AND id=%s", (str(obra_id), nuevo))
            if not cur.fetchone():
                raise HTTPException(404, "No existe ese rubro en esta obra.")
        cur.execute("SELECT id FROM dbo.proyecto_rubro WHERE obra_id=%s AND nombre=%s AND id<>%s",
                    (str(obra_id), datos.nombre, nuevo))
        if cur.fetchone():
            raise HTTPException(422, "Ya existe un rubro con ese nombre en esta obra.")
        if rubro_id:
            cur.execute("UPDATE dbo.proyecto_rubro SET nombre=%s,orden=%s WHERE obra_id=%s AND id=%s",
                        (datos.nombre, datos.orden, str(obra_id), nuevo))
        else:
            cur.execute("INSERT dbo.proyecto_rubro (id,obra_id,nombre,orden) VALUES (%s,%s,%s,%s)",
                        (nuevo, str(obra_id), datos.nombre, datos.orden))
        version = _incrementar(cur, obra_id, datos.version)
    return {"id": nuevo, "version": version}


@router.post("/rubros", status_code=201, dependencies=[Depends(exige_acceso)])
def crear_rubro(obra_id: UUID, datos: Rubro):
    return _guardar_rubro(obra_id, datos)


@router.put("/rubros/{rubro_id}", dependencies=[Depends(exige_acceso)])
def editar_rubro(obra_id: UUID, rubro_id: UUID, datos: Rubro):
    return _guardar_rubro(obra_id, datos, rubro_id)


def _guardar_tarea(obra_id, datos, tarea_id=None):
    nuevo = str(tarea_id or uuid4())
    t = datos.model_dump(exclude={"version"})
    for campo in ("rubro_id", "padre_id"):
        t[campo] = str(t[campo]) if t[campo] else None
    t["dependencias"] = [{**d, "depende_de_id": str(d["depende_de_id"])} for d in t["dependencias"]]
    t["id"] = nuevo
    with db.cursor() as cur:
        _abrir(cur, obra_id, datos.version)
        tareas, rubros = _leer(cur, obra_id)
        anterior = next((x for x in tareas if x["id"] == nuevo), None)
        if tarea_id and not anterior:
            raise HTTPException(404, "No existe esa tarea en esta obra.")
        if anterior and anterior["tipo"] != t["tipo"]:
            raise HTTPException(422, "El tipo se define al crear la tarea. Creá un grupo para organizar subtareas.")
        todas = [x for x in tareas if x["id"] != nuevo] + [t]
        try:
            movidas = validar_y_programar(todas, rubros)
        except (ValueError, OverflowError) as e:
            raise HTTPException(422, str(e)) from e
        campos = ("rubro_id", "padre_id", "nombre", "tipo", "responsable", "fecha_inicio", "fecha_fin", "orden", "notas")
        valores = tuple(t[k] for k in campos)
        if anterior:
            cur.execute("UPDATE dbo.proyecto_tarea SET " + ",".join(f"{k}=%s" for k in campos)
                        + " WHERE obra_id=%s AND id=%s", valores + (str(obra_id), nuevo))
        else:
            cur.execute("INSERT dbo.proyecto_tarea (" + ",".join(campos)
                        + ",obra_id,id) VALUES (" + ",".join(["%s"] * 11) + ")", valores + (str(obra_id), nuevo))
        cur.execute("DELETE FROM dbo.proyecto_dependencia WHERE obra_id=%s AND tarea_id=%s", (str(obra_id), nuevo))
        for d in t["dependencias"]:
            cur.execute("INSERT dbo.proyecto_dependencia (obra_id,tarea_id,depende_de_id,dias_desfase) VALUES (%s,%s,%s,%s)",
                        (str(obra_id), nuevo, d["depende_de_id"], d["dias_desfase"]))
        for otra in todas:
            if otra["id"] in movidas and otra["id"] != nuevo:
                cur.execute("UPDATE dbo.proyecto_tarea SET fecha_inicio=%s,fecha_fin=%s WHERE obra_id=%s AND id=%s",
                            (otra["fecha_inicio"], otra["fecha_fin"], str(obra_id), otra["id"]))
        version = _incrementar(cur, obra_id, datos.version)
    return {"id": nuevo, "version": version, "movidas": len(movidas)}


@router.post("/tareas", status_code=201, dependencies=[Depends(exige_acceso)])
def crear_tarea(obra_id: UUID, datos: Tarea):
    return _guardar_tarea(obra_id, datos)


@router.put("/tareas/{tarea_id}", dependencies=[Depends(exige_acceso)])
def editar_tarea(obra_id: UUID, tarea_id: UUID, datos: Tarea):
    return _guardar_tarea(obra_id, datos, tarea_id)


@router.post("/tareas/{tarea_id}/avances", status_code=201, dependencies=[Depends(exige_acceso)])
def registrar_avance(obra_id: UUID, tarea_id: UUID, datos: Avance):
    with db.cursor() as cur:
        _abrir(cur, obra_id, datos.version)
        cur.execute("SELECT tipo FROM dbo.proyecto_tarea WHERE obra_id=%s AND id=%s", (str(obra_id), str(tarea_id)))
        tarea = cur.fetchone()
        if not tarea:
            raise HTTPException(404, "No existe esa tarea en esta obra.")
        if tarea["tipo"] == "grupo":
            raise HTTPException(422, "El avance del grupo se calcula desde sus subtareas.")
        if tarea["tipo"] == "hito" and datos.avance_pct not in (0, 100):
            raise HTTPException(422, "Un hito está pendiente (0 %) o cumplido (100 %).")
        cur.execute("""UPDATE dbo.proyecto_avance SET avance_pct=%s,nota=%s
                       WHERE obra_id=%s AND tarea_id=%s AND fecha=%s""",
                    (datos.avance_pct, datos.nota, str(obra_id), str(tarea_id), datos.fecha))
        if not cur.rowcount:
            cur.execute("INSERT dbo.proyecto_avance (obra_id,tarea_id,fecha,avance_pct,nota) VALUES (%s,%s,%s,%s,%s)",
                        (str(obra_id), str(tarea_id), datos.fecha, datos.avance_pct, datos.nota))
        version = _incrementar(cur, obra_id, datos.version)
    return {"version": version}


@router.get("/tareas/{tarea_id}/avances", dependencies=[Depends(exige_acceso)])
def historial(obra_id: UUID, tarea_id: UUID):
    with db.cursor() as cur:
        _abrir(cur, obra_id)
        cur.execute("SELECT id FROM dbo.proyecto_tarea WHERE obra_id=%s AND id=%s", (str(obra_id), str(tarea_id)))
        if not cur.fetchone():
            raise HTTPException(404, "No existe esa tarea en esta obra.")
        cur.execute("SELECT fecha,avance_pct,nota FROM dbo.proyecto_avance WHERE obra_id=%s AND tarea_id=%s ORDER BY fecha DESC",
                    (str(obra_id), str(tarea_id)))
        return cur.fetchall()


@router.get("/presupuestos", dependencies=[Depends(exige_acceso)])
def presupuestos_vinculados(obra_id: UUID):
    """Presupuestos y período de ejecución de sus tareas vinculadas."""
    with db.cursor() as cur:
        _abrir(cur, obra_id)
        cur.execute("""SELECT p.id,p.nombre,p.estado,p.elegido,p.monto_base,p.moneda,
                    p.rubro_id,COUNT(v.tarea_id) AS tareas,
                    MIN(t.fecha_inicio) AS fecha_inicio,MAX(t.fecha_fin) AS fecha_fin
                    FROM dbo.presupuesto p
                    LEFT JOIN dbo.proyecto_presupuesto_tarea v ON v.obra_id=p.obra_id AND v.presupuesto_id=p.id
                    LEFT JOIN dbo.proyecto_tarea t ON t.obra_id=v.obra_id AND t.id=v.tarea_id
                    WHERE p.obra_id=%s GROUP BY p.id,p.nombre,p.estado,p.elegido,p.monto_base,p.moneda,p.rubro_id
                    ORDER BY p.estado,p.nombre""", (str(obra_id),))
        presupuestos = cur.fetchall()
        cur.execute("SELECT presupuesto_id,tarea_id FROM dbo.proyecto_presupuesto_tarea WHERE obra_id=%s", (str(obra_id),))
        vinculos = cur.fetchall()
        cur.execute("SELECT version FROM dbo.proyecto_revision WHERE obra_id=%s", (str(obra_id),))
        revision = cur.fetchone()
        version = revision["version"] if revision else 0
    por_presupuesto = {}
    for v in vinculos:
        por_presupuesto.setdefault(str(v["presupuesto_id"]), []).append(str(v["tarea_id"]))
    for p in presupuestos:
        p["id"] = str(p["id"]); p["tarea_ids"] = por_presupuesto.get(p["id"], [])
        p["elegido"] = bool(p["elegido"])
        p["monto_base"] = float(p["monto_base"])
    return {"version": version, "presupuestos": presupuestos}


@router.put("/presupuestos/{presupuesto_id}/tareas", dependencies=[Depends(exige_acceso)])
def vincular_presupuesto(obra_id: UUID, presupuesto_id: UUID, datos: Vinculos):
    """Reemplaza los vínculos sin tocar el acuerdo ni los pagos."""
    ids = [str(x) for x in datos.tarea_ids]
    if len(ids) != len(set(ids)):
        raise HTTPException(422, "No repitas tareas en el vínculo.")
    with db.cursor() as cur:
        _abrir(cur, obra_id, datos.version)
        cur.execute("SELECT id FROM dbo.presupuesto WHERE id=%s AND obra_id=%s", (str(presupuesto_id), str(obra_id)))
        if not cur.fetchone():
            raise HTTPException(404, "No existe ese presupuesto en esta obra.")
        if ids:
            cur.execute("SELECT id,tipo FROM dbo.proyecto_tarea WHERE obra_id=%s AND id IN (" + ",".join(["%s"] * len(ids)) + ")",
                        (str(obra_id), *ids))
            tareas = cur.fetchall()
            if len(tareas) != len(ids):
                raise HTTPException(422, "Todas las tareas deben pertenecer a esta obra.")
            if any(t["tipo"] == "grupo" for t in tareas):
                raise HTTPException(422, "Vinculá tareas e hitos; los grupos resumen sus subtareas.")
        cur.execute("DELETE FROM dbo.proyecto_presupuesto_tarea WHERE obra_id=%s AND presupuesto_id=%s",
                    (str(obra_id), str(presupuesto_id)))
        for tid in ids:
            cur.execute("INSERT dbo.proyecto_presupuesto_tarea (obra_id,presupuesto_id,tarea_id) VALUES (%s,%s,%s)",
                        (str(obra_id), str(presupuesto_id), tid))
        version = _incrementar(cur, obra_id, datos.version)
    return {"version": version, "tarea_ids": ids}
