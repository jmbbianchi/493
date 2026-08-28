"""
Pagos.

EL CRITERIO QUE MANDA EN ESTE ARCHIVO
-------------------------------------
Quince segundos parado en la obra, con el telefono en una mano. Todo lo
que agregue un paso al alta hay que justificarlo contra eso.

Por eso el alta acepta lo minimo: rubro, monto y fecha. El presupuesto es
opcional aunque casi siempre se va a completar, porque el pago suelto -- el
flete, el adicional acordado por telefono -- existe y si no entra rapido no
se carga nunca. Un pago no cargado es peor que un pago sin imputar.

POR QUE HAY UN ENDPOINT DE "DESTINOS"
-------------------------------------
La pantalla necesita, de una sola vez, la lista de rubros con presupuesto
abierto y cuanto queda de cada uno. Pedirlo en tres llamadas serian tres
conexiones nuevas contra una base que puede estar dormida: db.py abre y
cierra por operacion a proposito, asi que cada request extra son 40
segundos de riesgo. Una sola llamada, todo lo que la pantalla necesita.
"""
import uuid
from datetime import date
from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from .. import db
from ..seguridad import requiere_clave
from .presupuestos import _ancla_ipc, _con_coeficientes, _niveles_ipc

router = APIRouter(prefix="/api/obras/{obra_id}", tags=["pagos"],
                   dependencies=[Depends(requiere_clave)])


class PagoNuevo(BaseModel):
    rubro_id: int
    # Nullable como el presupuesto: el pago suelto que no se sabe bien a
    # que corresponde tiene que poder entrar igual.
    subrubro_id: int | None = None
    presupuesto_id: str | None = None
    cuota_id: str | None = None
    fecha: date
    monto: float = Field(gt=0)
    moneda: str = Field(default="ARS", pattern="^(ARS|USD)$")
    medio: str = Field(default="transferencia",
                       pattern="^(transferencia|efectivo|cheque|otro)$")
    notas: str | None = None


class Anulacion(BaseModel):
    motivo: str = Field(min_length=1, max_length=300)


@router.post("/pagos", status_code=201)
def registrar(obra_id: str, p: PagoNuevo):
    if p.presupuesto_id:
        # Que el presupuesto sea de esta obra y de este rubro. Un pago
        # imputado al presupuesto de otro rubro descuadra las dos columnas
        # a la vez y despues no hay como darse cuenta mirando la tabla.
        filas = db.query(
            """SELECT rubro_id, subrubro_id, estado FROM dbo.presupuesto
               WHERE id = %s AND obra_id = %s""",
            (p.presupuesto_id, obra_id))
        if not filas:
            raise HTTPException(404, "Ese presupuesto no es de esta obra.")
        if filas[0]["rubro_id"] != p.rubro_id:
            raise HTTPException(400, "El presupuesto es de otro rubro.")
        if filas[0]["estado"] == "anulado":
            raise HTTPException(409, "El presupuesto esta anulado.")
        # El sub-rubro del pago lo manda el presupuesto: si se pudieran
        # separar, un pago quedaria contado en un sub-rubro y su cuota en
        # otro, y las dos columnas dejarian de cerrar sin que se note.
        p.subrubro_id = filas[0]["subrubro_id"]

    nuevo = str(uuid.uuid4())
    db.execute(
        """INSERT INTO dbo.pago
             (id, obra_id, rubro_id, subrubro_id, presupuesto_id, cuota_id,
              fecha, monto, moneda, medio, notas)
           VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)""",
        (nuevo, obra_id, p.rubro_id, p.subrubro_id, p.presupuesto_id, p.cuota_id,
         p.fecha, p.monto, p.moneda, p.medio, p.notas))

    # El saldo nuevo vuelve en la misma respuesta y no en una segunda
    # llamada. Medido: releer los destinos despues de grabar duplicaba la
    # espera, y el criterio de esta pantalla son quince segundos parado en
    # la obra. Ademas ver cuanto queda es la mitad de la razon por la que
    # alguien carga el pago ahi mismo en vez de anotarlo en un papel.
    return {"id": nuevo, "saldo": _saldo(p.presupuesto_id) if p.presupuesto_id else None}


def _saldo(presupuesto_id: str) -> dict | None:
    """Proyectado, pagado y saldo de un presupuesto, en dos consultas."""
    cuotas = db.query(
        """SELECT c.orden, c.tipo, c.descripcion, c.fecha_prevista, c.monto_nominal,
                  c.indexa, c.estado, p.fecha_base
           FROM dbo.cuota c
           JOIN dbo.presupuesto p ON p.id = c.presupuesto_id
           WHERE c.presupuesto_id = %s AND c.estado <> 'anulada'""",
        (presupuesto_id,))
    if not cuotas:
        return None

    pagado = db.query(
        """SELECT ISNULL(SUM(monto), 0) AS pagado FROM dbo.pago
           WHERE presupuesto_id = %s AND anulado = 0""", (presupuesto_id,))
    ya = Decimal(str(pagado[0]["pagado"]))

    proyectado = Decimal(0)
    for c in _con_coeficientes(cuotas, cuotas[0]["fecha_base"], _ancla_ipc(), _niveles_ipc()):
        if c["monto_proyectado"] is not None:
            proyectado += c["monto_proyectado"]

    return {
        "proyectado": float(proyectado),
        "pagado": float(ya),
        "saldo": float(proyectado - ya),
        "avance_pct": float(ya / proyectado * 100) if proyectado else None,
    }


@router.get("/pagos")
def listar(obra_id: str, rubro_id: int | None = None, presupuesto_id: str | None = None):
    sql = """
        SELECT g.id, g.rubro_id, r.nombre AS rubro,
               g.subrubro_id, s.nombre AS subrubro,
               g.presupuesto_id, p.nombre AS presupuesto,
               g.fecha, g.monto, g.moneda, g.medio, g.notas,
               g.anulado, g.anulado_motivo
        FROM dbo.pago g
        JOIN dbo.rubro r ON r.id = g.rubro_id
        LEFT JOIN dbo.subrubro s ON s.id = g.subrubro_id
        LEFT JOIN dbo.presupuesto p ON p.id = g.presupuesto_id
        WHERE g.obra_id = %s
    """
    params: tuple = (obra_id,)
    if rubro_id is not None:
        sql += " AND g.rubro_id = %s"
        params += (rubro_id,)
    if presupuesto_id is not None:
        sql += " AND g.presupuesto_id = %s"
        params += (presupuesto_id,)
    sql += " ORDER BY g.fecha DESC, g.creado_en DESC"
    return db.query(sql, params)


@router.post("/pagos/{pago_id}/anular")
def anular(obra_id: str, pago_id: str, a: Anulacion):
    """Anular es corregir un error de carga, no hacer desaparecer plata:
    el pago queda con el motivo y deja de sumar."""
    n = db.execute(
        """UPDATE dbo.pago SET anulado = 1, anulado_motivo = %s
           WHERE id = %s AND obra_id = %s AND anulado = 0""",
        (a.motivo, pago_id, obra_id))
    if not n:
        raise HTTPException(404, "No existe ese pago, o ya estaba anulado.")
    return {"anulado": True}


@router.get("/pagar-destinos")
def destinos(obra_id: str):
    """Todo lo que la pantalla del telefono necesita, en una sola llamada.

    Devuelve los rubros que tienen presupuesto confirmado -- que es donde
    va a caer casi todo pago -- con el saldo de cada presupuesto ya
    calculado, mas la lista completa de rubros para el pago suelto.
    """
    rubros = db.query("SELECT id, nombre, orden FROM dbo.rubro ORDER BY orden")

    subrubros = db.query(
        "SELECT id, codigo, nombre, orden FROM dbo.subrubro ORDER BY orden")

    # Solo los ELEGIDOS. Ofrecer las cotizaciones descartadas invita a
    # imputarle un pago a un presupuesto que no se va a usar, y despues no
    # hay forma de darse cuenta mirando la tabla.
    presupuestos = db.query(
        """SELECT p.id, p.rubro_id, r.nombre AS rubro,
                  p.subrubro_id, s.nombre AS subrubro,
                  p.nombre, p.monto_base, p.fecha_base, p.moneda
           FROM dbo.presupuesto p
           JOIN dbo.rubro r ON r.id = p.rubro_id
           JOIN dbo.subrubro s ON s.id = p.subrubro_id
           WHERE p.obra_id = %s AND p.estado = 'confirmado' AND p.elegido = 1
           ORDER BY r.orden, s.orden""", (obra_id,))

    if not presupuestos:
        return {"rubros": rubros, "subrubros": subrubros, "presupuestos": []}

    # Una sola pasada por las cuotas de la obra y una sola por los pagos.
    cuotas = db.query(
        """SELECT c.presupuesto_id, p.fecha_base, c.orden, c.tipo, c.descripcion,
                  c.fecha_prevista, c.monto_nominal, c.indexa, c.estado
           FROM dbo.cuota c
           JOIN dbo.presupuesto p ON p.id = c.presupuesto_id
           WHERE p.obra_id = %s AND p.estado = 'confirmado' AND p.elegido = 1
             AND c.estado <> 'anulada'""",
        (obra_id,))
    pagado = {str(f["presupuesto_id"]): Decimal(str(f["pagado"])) for f in db.query(
        """SELECT v.presupuesto_id, v.pagado FROM dbo.v_pagado_presupuesto v
           JOIN dbo.presupuesto p ON p.id = v.presupuesto_id
           WHERE p.obra_id = %s""", (obra_id,))}

    ancla = _ancla_ipc()
    niveles = _niveles_ipc()

    por_presupuesto: dict = {}
    for c in cuotas:
        por_presupuesto.setdefault(str(c["presupuesto_id"]), []).append(c)

    salida = []
    for p in presupuestos:
        pid = str(p["id"])
        mias = por_presupuesto.get(pid, [])
        proyectado = Decimal(0)
        if mias:
            for c in _con_coeficientes(mias, p["fecha_base"], ancla, niveles):
                if c["monto_proyectado"] is not None:
                    proyectado += c["monto_proyectado"]
        ya = pagado.get(pid, Decimal(0))
        salida.append({
            "id": pid,
            "rubro_id": p["rubro_id"],
            "rubro": p["rubro"],
            "subrubro_id": p["subrubro_id"],
            "subrubro": p["subrubro"],
            "nombre": p["nombre"],
            "moneda": p["moneda"],
            "proyectado": float(proyectado),
            "pagado": float(ya),
            "saldo": float(proyectado - ya),
            "avance_pct": float(ya / proyectado * 100) if proyectado else None,
        })

    return {"rubros": rubros, "subrubros": subrubros, "presupuestos": salida}
