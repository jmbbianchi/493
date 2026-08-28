"""
Presupuestos recibidos y sus planes de pago.

LA IDEA QUE JUSTIFICA TODO EL ARCHIVO
-------------------------------------
Un presupuesto no es un monto. El cementista dice $85.000.000 y con el
anticipo, las catorce cuotas semanales y el ajuste mensual termina siendo
otro numero. Ese numero no esta escrito en ningun papel. Calcularlo y
mostrarlo antes de firmar es la razon de ser de la app.

LAS TRES COLUMNAS
-----------------
  nominal     lo que dice el papel, sin ajustar
  proyectado  con el coeficiente real donde existe, y con inflacion
              extrapolada donde todavia no se publico
  real        solo con coeficientes publicados; las cuotas que no lo
              tienen NO se suman y se informa cuantas son

Por que hay proyectado y real y no uno solo: el real es un hecho y el
proyectado es una estimacion, y mezclarlos es exactamente como se pierde
la nocion de cuanto va a salir la obra. El real de un plan que arranca el
mes que viene es cero, y ese cero no significa que sea gratis.

LO QUE NO SE HACE ACA
---------------------
Nunca se reemplaza un coeficiente faltante por 1. Un 1 se lee como "no
hubo inflacion" y se cobra la diferencia en silencio. Cuando falta, falta,
y la respuesta lo dice.
"""
import uuid
from datetime import date, timedelta
from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from .. import db
from ..seguridad import requiere_clave

router = APIRouter(prefix="/api/obras/{obra_id}", tags=["presupuestos"],
                   dependencies=[Depends(requiere_clave)])

# Cuantos dias tiene cada frecuencia. Semanal es 7 y no "un cuarto de mes":
# el proveedor cobra los viernes, no los dias 7, 14, 21 y 28.
DIAS = {"semanal": 7, "quincenal": 14, "mensual": 30}


# ─────────────────────────────────────────────────────────────
# Modelos
# ─────────────────────────────────────────────────────────────
class TramoNuevo(BaseModel):
    tipo: str = Field(pattern="^(anticipo|cuota)$")
    descripcion: str | None = None
    porcentaje: float | None = None
    monto_base: float | None = None
    fecha_prevista: date
    indexa: bool = True
    indice_codigo: str = "IPC_NIVEL"


class PresupuestoNuevo(BaseModel):
    rubro_id: int
    proveedor_id: int | None = None
    tipo: str = Field(default="materiales", pattern="^(materiales|mano_obra)$")
    nombre: str = Field(min_length=1, max_length=200)
    monto_base: float = Field(gt=0)
    moneda: str = Field(default="ARS", pattern="^(ARS|USD)$")
    fecha_base: date
    notas: str | None = None


class PresupuestoCambio(BaseModel):
    rubro_id: int | None = None
    proveedor_id: int | None = None
    tipo: str | None = Field(default=None, pattern="^(materiales|mano_obra)$")
    nombre: str | None = None
    monto_base: float | None = Field(default=None, gt=0)
    moneda: str | None = Field(default=None, pattern="^(ARS|USD)$")
    fecha_base: date | None = None
    notas: str | None = None


class PlanArmado(BaseModel):
    """El plan como se habla con el proveedor, no como se guarda.

    "20 % de anticipo y 14 cuotas semanales arrancando el 1 de noviembre"
    son cuatro campos, no dieciseis filas tipeadas a mano.
    """
    anticipo_pct: float = Field(default=0, ge=0, lt=100)
    anticipo_fecha: date | None = None
    anticipo_indexa: bool = False
    cuotas: int = Field(ge=1, le=120)
    frecuencia: str = Field(default="semanal", pattern="^(semanal|quincenal|mensual)$")
    fecha_inicio: date
    cuotas_indexan: bool = True
    indice_codigo: str = "IPC_NIVEL"


class Anulacion(BaseModel):
    motivo: str = Field(min_length=1, max_length=300)


# ─────────────────────────────────────────────────────────────
# Indexacion
# ─────────────────────────────────────────────────────────────
def _ancla_ipc() -> dict:
    """Ultimo nivel de IPC publicado y la variacion con que se proyecta.

    Se usa la ULTIMA variacion mensual publicada como tasa de proyeccion.
    No es un pronostico: es la unica cifra defendible que hay a mano, y la
    respuesta la devuelve explicita para que quien mira el numero sepa
    contra que se hizo y pueda no creerle.
    """
    filas = db.query(
        """SELECT TOP 1 v.fecha, v.valor,
                  (SELECT TOP 1 m.valor FROM dbo.indice_valor m
                    WHERE m.codigo = 'IPC_MENSUAL' ORDER BY m.fecha DESC) AS var_mensual
           FROM dbo.indice_valor v
           WHERE v.codigo = 'IPC_NIVEL'
           ORDER BY v.fecha DESC""")
    if not filas or filas[0]["valor"] is None:
        return {"hay": False, "mes": None, "nivel": None, "var_mensual": None}
    f = filas[0]
    return {
        "hay": True,
        "mes": f["fecha"],
        "nivel": Decimal(str(f["valor"])),
        "var_mensual": None if f["var_mensual"] is None else Decimal(str(f["var_mensual"])),
    }


def _meses(desde: date, hasta: date) -> int:
    return (hasta.year - desde.year) * 12 + (hasta.month - desde.month)


def _nivel_proyectado(mes: date, ancla: dict) -> Decimal | None:
    """Nivel de IPC para un mes que todavia no se publico.

    Capitaliza la ultima variacion conocida desde el ultimo mes publicado.
    Si el mes pedido ya paso pero no esta en la serie, no se inventa: eso
    es un agujero de datos, no el futuro.
    """
    if not ancla["hay"] or ancla["var_mensual"] is None:
        return None
    n = _meses(ancla["mes"], mes)
    if n <= 0:
        return None
    tasa = Decimal(1) + ancla["var_mensual"] / Decimal(100)
    return ancla["nivel"] * (tasa ** n)


def _con_coeficientes(cuotas: list[dict], fecha_base: date, ancla: dict,
                      niveles: dict) -> list[dict]:
    """Completa cada cuota con su coeficiente real y su proyectado.

    Regla del plan (decision 5): coeficiente = IPC(mes anterior al pago) /
    IPC(mes anterior a la base). El desfasaje de un mes no es un detalle:
    es que el INDEC publica el dia 12 del mes siguiente, asi que el indice
    del mes en curso no existe cuando hay que pagar.
    """
    mes_base = date(fecha_base.year, fecha_base.month, 1)
    # Un mes para atras, que es contra lo que se compara todo.
    mes_base_ant = _mes_anterior(mes_base)
    n0 = niveles.get(mes_base_ant)

    salida = []
    for c in cuotas:
        fila = dict(c)
        nominal = Decimal(str(c["monto_nominal"]))

        if not c["indexa"]:
            # Lo que no indexa vale lo mismo siempre. El anticipo es el
            # caso tipico: es justamente lo que congela el precio.
            fila["coeficiente_real"] = Decimal(1)
            fila["coeficiente_proyectado"] = Decimal(1)
            fila["monto_real"] = nominal
            fila["monto_proyectado"] = nominal
            fila["estado_coef"] = "fijo"
            salida.append(fila)
            continue

        mes_pago_ant = _mes_anterior(date(c["fecha_prevista"].year,
                                          c["fecha_prevista"].month, 1))
        n1 = niveles.get(mes_pago_ant)

        if n0 is not None and n1 is not None:
            coef = n1 / n0
            fila["coeficiente_real"] = coef
            fila["coeficiente_proyectado"] = coef
            fila["monto_real"] = nominal * coef
            fila["monto_proyectado"] = nominal * coef
            fila["estado_coef"] = "publicado"
        else:
            # Falta el indice. El real queda en NULL -- no en cero y no en
            # el nominal -- y el proyectado se estima capitalizando.
            n1p = _nivel_proyectado(mes_pago_ant, ancla) if n1 is None else n1
            fila["coeficiente_real"] = None
            fila["monto_real"] = None
            if n0 is not None and n1p is not None:
                fila["coeficiente_proyectado"] = n1p / n0
                fila["monto_proyectado"] = nominal * (n1p / n0)
                fila["estado_coef"] = "proyectado"
            else:
                # Ni siquiera se puede estimar: falta la base de la serie.
                fila["coeficiente_proyectado"] = None
                fila["monto_proyectado"] = None
                fila["estado_coef"] = "sin_datos"
        salida.append(fila)
    return salida


def _mes_anterior(mes: date) -> date:
    return date(mes.year - 1, 12, 1) if mes.month == 1 else date(mes.year, mes.month - 1, 1)


def _niveles_ipc() -> dict:
    """Toda la serie de IPC_NIVEL en un dict {primer dia del mes: nivel}.

    Se trae entera de una sola vez. Son unos pocos cientos de filas y la
    alternativa es llamar a fn_coef_ipc una vez por cuota: con 15 cuotas
    son 15 conexiones nuevas, porque db.py abre y cierra por operacion.
    """
    filas = db.query(
        "SELECT fecha, valor FROM dbo.indice_valor WHERE codigo = 'IPC_NIVEL'")
    return {date(f["fecha"].year, f["fecha"].month, 1): Decimal(str(f["valor"]))
            for f in filas}


def _totales(cuotas: list[dict]) -> dict:
    vivas = [c for c in cuotas if c["estado"] != "anulada"]
    nominal = sum((Decimal(str(c["monto_nominal"])) for c in vivas), Decimal(0))
    proyectado = sum((c["monto_proyectado"] for c in vivas
                      if c["monto_proyectado"] is not None), Decimal(0))
    real = sum((c["monto_real"] for c in vivas if c["monto_real"] is not None), Decimal(0))
    return {
        "nominal": float(nominal),
        "proyectado": float(proyectado),
        "real": float(real),
        "diferencia": float(proyectado - nominal),
        "diferencia_pct": float((proyectado / nominal - 1) * 100) if nominal else None,
        "cuotas": len(vivas),
        "cuotas_proyectadas": sum(1 for c in vivas if c["estado_coef"] == "proyectado"),
        "cuotas_sin_datos": sum(1 for c in vivas if c["estado_coef"] == "sin_datos"),
    }


def _serializar(c: dict) -> dict:
    def f(v):
        return None if v is None else float(v)
    return {
        "id": str(c["id"]),
        "orden": c["orden"],
        "tipo": c["tipo"],
        "descripcion": c["descripcion"],
        "fecha_prevista": c["fecha_prevista"],
        "indexa": bool(c["indexa"]),
        "estado": c["estado"],
        "estado_coef": c["estado_coef"],
        "monto_nominal": f(Decimal(str(c["monto_nominal"]))),
        "coeficiente": f(c["coeficiente_proyectado"]),
        "monto_proyectado": f(c["monto_proyectado"]),
        "monto_real": f(c["monto_real"]),
    }


# ─────────────────────────────────────────────────────────────
# Endpoints
# ─────────────────────────────────────────────────────────────
@router.get("/presupuestos")
def listar(obra_id: str, rubro_id: int | None = None):
    sql = """
        SELECT p.id, p.rubro_id, r.nombre AS rubro, p.proveedor_id,
               pr.nombre AS proveedor, p.tipo, p.nombre, p.monto_base,
               p.moneda, p.fecha_base, p.estado, p.notas,
               (SELECT COUNT(*) FROM dbo.cuota c
                 WHERE c.presupuesto_id = p.id AND c.estado <> 'anulada') AS cuotas
        FROM dbo.presupuesto p
        JOIN dbo.rubro r ON r.id = p.rubro_id
        LEFT JOIN dbo.proveedor pr ON pr.id = p.proveedor_id
        WHERE p.obra_id = %s
    """
    params: tuple = (obra_id,)
    if rubro_id is not None:
        sql += " AND p.rubro_id = %s"
        params += (rubro_id,)
    sql += " ORDER BY r.orden, p.creado_en"
    return db.query(sql, params)


@router.post("/presupuestos", status_code=201)
def crear(obra_id: str, p: PresupuestoNuevo):
    nuevo = str(uuid.uuid4())
    db.execute(
        """INSERT INTO dbo.presupuesto
             (id, obra_id, rubro_id, proveedor_id, tipo, nombre, monto_base,
              moneda, fecha_base, notas)
           VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)""",
        (nuevo, obra_id, p.rubro_id, p.proveedor_id, p.tipo, p.nombre,
         p.monto_base, p.moneda, p.fecha_base, p.notas),
    )
    return {"id": nuevo}


@router.patch("/presupuestos/{presupuesto_id}")
def editar(obra_id: str, presupuesto_id: str, cambios: PresupuestoCambio):
    p = _traer(obra_id, presupuesto_id)
    if p["estado"] != "borrador":
        # Confirmado quiere decir que las cuotas ya existen. Cambiarle el
        # monto por debajo dejaria un plan que no suma el total.
        raise HTTPException(409, "Un presupuesto confirmado no se edita: anulalo y carga otro.")
    campos = cambios.model_dump(exclude_unset=True)
    if not campos:
        return {"cambios": 0}
    sets = ", ".join(f"{k} = %s" for k in campos)
    n = db.execute(f"UPDATE dbo.presupuesto SET {sets} WHERE id = %s AND obra_id = %s",
                   tuple(campos.values()) + (presupuesto_id, obra_id))
    return {"cambios": n}


@router.put("/presupuestos/{presupuesto_id}/plan")
def armar_plan(obra_id: str, presupuesto_id: str, plan: PlanArmado):
    """Reemplaza el plan entero. Solo en borrador."""
    p = _traer(obra_id, presupuesto_id)
    if p["estado"] != "borrador":
        raise HTTPException(409, "El plan de un presupuesto confirmado no se toca.")

    tramos = _desarmar_plan(plan)
    db.execute("DELETE FROM dbo.plan_tramo WHERE presupuesto_id = %s", (presupuesto_id,))
    with db.cursor() as cur:
        for t in tramos:
            cur.execute(
                """INSERT INTO dbo.plan_tramo
                     (presupuesto_id, orden, tipo, descripcion, porcentaje,
                      monto_base, fecha_prevista, indexa, indice_codigo)
                   VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)""",
                (presupuesto_id, t["orden"], t["tipo"], t["descripcion"],
                 t["porcentaje"], None, t["fecha_prevista"],
                 1 if t["indexa"] else 0, plan.indice_codigo))
    return {"tramos": len(tramos)}


def _desarmar_plan(plan: PlanArmado) -> list[dict]:
    """Convierte "20 % y 14 semanales" en la lista de tramos.

    El resto del porcentaje se reparte en partes iguales entre las cuotas.
    El redondeo NO se hace aca: los tramos guardan porcentaje y el monto
    sale al confirmar, asi el ultimo tramo puede absorber la diferencia de
    centavos una sola vez.
    """
    tramos = []
    orden = 1
    if plan.anticipo_pct > 0:
        tramos.append({
            "orden": orden, "tipo": "anticipo", "descripcion": "Anticipo",
            "porcentaje": plan.anticipo_pct,
            "fecha_prevista": plan.anticipo_fecha or plan.fecha_inicio,
            "indexa": plan.anticipo_indexa,
        })
        orden += 1

    resto = Decimal(str(100 - plan.anticipo_pct))
    por_cuota = resto / Decimal(plan.cuotas)
    paso = DIAS[plan.frecuencia]
    for i in range(plan.cuotas):
        tramos.append({
            "orden": orden, "tipo": "cuota",
            "descripcion": f"Cuota {i + 1} de {plan.cuotas}",
            "porcentaje": float(por_cuota),
            "fecha_prevista": plan.fecha_inicio + timedelta(days=paso * i),
            "indexa": plan.cuotas_indexan,
        })
        orden += 1
    return tramos


@router.post("/presupuestos/{presupuesto_id}/confirmar")
def confirmar(obra_id: str, presupuesto_id: str):
    """Materializa las cuotas. Es lo que convierte un acuerdo en obligaciones."""
    p = _traer(obra_id, presupuesto_id)
    if p["estado"] == "anulado":
        raise HTTPException(409, "El presupuesto esta anulado.")
    if p["estado"] == "confirmado":
        raise HTTPException(409, "Ya estaba confirmado.")

    tramos = db.query(
        """SELECT id, orden, tipo, descripcion, porcentaje, monto_base,
                  fecha_prevista, indexa, indice_codigo
           FROM dbo.plan_tramo WHERE presupuesto_id = %s ORDER BY orden""",
        (presupuesto_id,))
    if not tramos:
        raise HTTPException(400, "El presupuesto no tiene plan de pago cargado.")

    total = Decimal(str(p["monto_base"]))
    montos = []
    for t in tramos:
        if t["monto_base"] is not None:
            montos.append(Decimal(str(t["monto_base"])))
        else:
            montos.append((total * Decimal(str(t["porcentaje"])) / Decimal(100))
                          .quantize(Decimal("0.01")))
    # El redondeo va una sola vez, al final: la diferencia de centavos la
    # absorbe el ultimo tramo en vez de repartirse y no cerrar nunca.
    if montos:
        montos[-1] += total - sum(montos)

    with db.cursor() as cur:
        for t, monto in zip(tramos, montos):
            cur.execute(
                """INSERT INTO dbo.cuota
                     (presupuesto_id, plan_tramo_id, orden, tipo, descripcion,
                      fecha_prevista, monto_nominal, indexa, indice_codigo)
                   VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)""",
                (presupuesto_id, t["id"], t["orden"], t["tipo"], t["descripcion"],
                 t["fecha_prevista"], float(monto), t["indexa"], t["indice_codigo"]))
        cur.execute(
            """UPDATE dbo.presupuesto
                 SET estado = 'confirmado', confirmado_en = sysutcdatetime()
               WHERE id = %s""", (presupuesto_id,))
    return {"cuotas": len(tramos)}


@router.post("/presupuestos/{presupuesto_id}/anular")
def anular(obra_id: str, presupuesto_id: str, a: Anulacion):
    """Se anula, no se borra: con quien negociaste y cuanto te pidio es historia."""
    _traer(obra_id, presupuesto_id)
    with db.cursor() as cur:
        cur.execute(
            """UPDATE dbo.presupuesto
                 SET estado = 'anulado', anulado_en = sysutcdatetime(), anulado_motivo = %s
               WHERE id = %s""", (a.motivo, presupuesto_id))
        cur.execute(
            "UPDATE dbo.cuota SET estado = 'anulada' WHERE presupuesto_id = %s", (presupuesto_id,))
    return {"estado": "anulado"}


@router.get("/presupuestos/{presupuesto_id}")
def ver(obra_id: str, presupuesto_id: str):
    """El presupuesto con su plan y las tres columnas calculadas."""
    p = _traer(obra_id, presupuesto_id)

    cuotas = db.query(
        """SELECT id, orden, tipo, descripcion, fecha_prevista, monto_nominal,
                  indexa, indice_codigo, estado
           FROM dbo.cuota WHERE presupuesto_id = %s ORDER BY orden""",
        (presupuesto_id,))

    tramos = db.query(
        """SELECT orden, tipo, descripcion, porcentaje, monto_base,
                  fecha_prevista, indexa
           FROM dbo.plan_tramo WHERE presupuesto_id = %s ORDER BY orden""",
        (presupuesto_id,))

    ancla = _ancla_ipc()
    niveles = _niveles_ipc()
    calculadas = _con_coeficientes(cuotas, p["fecha_base"], ancla, niveles)

    return {
        "presupuesto": {k: (str(v) if k == "id" else v) for k, v in p.items()},
        "tramos": tramos,
        "cuotas": [_serializar(c) for c in calculadas],
        "total": _totales(calculadas),
        # Que hipotesis se uso para proyectar, dicho en la respuesta y no
        # escondido en el codigo. Si el numero no convence, aca esta el por que.
        "proyeccion": {
            "hay_ipc": ancla["hay"],
            "ultimo_mes_publicado": ancla["mes"],
            "variacion_mensual_usada": (None if ancla["var_mensual"] is None
                                        else float(ancla["var_mensual"])),
        },
    }


def _traer(obra_id: str, presupuesto_id: str) -> dict:
    filas = db.query(
        """SELECT id, obra_id, rubro_id, proveedor_id, tipo, nombre, monto_base,
                  moneda, fecha_base, estado, notas
           FROM dbo.presupuesto WHERE id = %s AND obra_id = %s""",
        (presupuesto_id, obra_id))
    if not filas:
        raise HTTPException(404, "No existe ese presupuesto en esta obra.")
    return filas[0]
