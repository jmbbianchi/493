"""Escenarios de pago vinculados al trabajo. No modifica pagos reales."""
from datetime import timedelta
from decimal import Decimal, ROUND_HALF_UP
from hashlib import sha256
import json

CENTAVO = Decimal("0.01")

def dinero(valor):
    return Decimal(str(valor)).quantize(CENTAVO, rounding=ROUND_HALF_UP)


def huella(presupuesto, tramos, cuotas):
    # Las rutas anteriores no incrementan la revision de Proyecto. Esta
    # huella detecta tambien cambios en el presupuesto y en el plan legado.
    return sha256(json.dumps([presupuesto, tramos, cuotas], default=str,
                             sort_keys=True, separators=(",", ":")).encode()).hexdigest()


def periodo(tareas, seleccion):
    if len(seleccion) != len(set(seleccion)):
        raise ValueError("No repitas tareas en el vínculo.")
    ids = {t["id"]: t for t in tareas}
    if any(i not in ids for i in seleccion):
        raise ValueError("Todas las tareas deben pertenecer a esta obra.")
    elegidas = [ids[i] for i in seleccion]
    # Los grupos se expanden a hojas una sola vez, incluso si tambien se
    # selecciono una subtarea. No se usa el rango parcial de un grupo.
    incluidos = set(seleccion)
    cambio = True
    while cambio:
        cambio = False
        for t in tareas:
            if t.get("padre_id") in incluidos and t["id"] not in incluidos:
                incluidos.add(t["id"])
                cambio = True
    hojas = [t for t in tareas if t["id"] in incluidos and t["tipo"] != "grupo"]
    if not hojas or any(not t.get("fecha_inicio") or not t.get("fecha_fin") for t in hojas):
        return None, None
    for g in (t for t in elegidas if t["tipo"] == "grupo"):
        if not any(t.get("padre_id") == g["id"] for t in tareas):
            return None, None
    return min(t["fecha_inicio"] for t in hojas), max(t["fecha_fin"] for t in hojas)


def generar(total, inicio, fin, modo, anticipo_pct=20, dias_anticipo=1,
            primer_pago_dias=6, anticipo_indexa=False, cuotas_indexan=True):
    if inicio is None or fin is None:
        raise ValueError("Programá todas las tareas vinculadas antes de generar el plan.")
    if fin < inicio:
        raise ValueError("El fin no puede ser anterior al inicio.")
    total = dinero(total)
    if total <= 0:
        raise ValueError("El presupuesto debe tener un monto mayor que cero.")
    if modo not in ("semanal", "anticipado"):
        raise ValueError("Elegí anticipo y saldo semanal, o pago anticipado completo.")
    anticipo_pct = Decimal(str(100 if modo == "anticipado" else anticipo_pct))
    if not 0 <= anticipo_pct <= 100 or not 0 <= dias_anticipo <= 365 or not 0 <= primer_pago_dias <= 6:
        raise ValueError("Las condiciones del plan están fuera de rango.")
    anticipo = dinero(total * anticipo_pct / 100)
    filas = []
    if anticipo:
        filas.append(dict(tipo="anticipo", descripcion="Anticipo", fecha_prevista=inicio - timedelta(days=dias_anticipo),
                          monto_nominal=anticipo, indexa=anticipo_indexa, indice_codigo="IPC_NIVEL"))
    saldo = total - anticipo
    if saldo:
        fechas = []
        actual = min(inicio + timedelta(days=primer_pago_dias), fin)
        while actual <= fin:
            fechas.append(actual)
            actual += timedelta(days=7)
        # El tramo final incompleto se cancela el ultimo dia de trabajo.
        if fechas[-1] != fin:
            fechas.append(fin)
        if len(fechas) > 520:
            raise ValueError("El plan supera 520 pagos. Revisá el período del trabajo.")
        # Repartir centavos enteros evita una ultima cuota negativa con
        # importes muy chicos y muchas semanas.
        base, resto = divmod(int(saldo * 100), len(fechas))
        for i, fecha in enumerate(fechas):
            monto = Decimal(base + (1 if i < resto else 0)) / 100
            if monto:
                filas.append(dict(tipo="cuota", descripcion=f"Pago semanal {i + 1} de {len(fechas)}",
                                  fecha_prevista=fecha, monto_nominal=monto,
                                  indexa=cuotas_indexan, indice_codigo="IPC_NIVEL"))
    for i, fila in enumerate(filas, 1):
        fila.update(orden=i, estado="pendiente")
    return filas


def tramos_a_cuotas(tramos, total):
    total = dinero(total)
    filas = []
    for t in tramos:
        monto = dinero(t["monto_base"]) if t["monto_base"] is not None else dinero(total * Decimal(str(t["porcentaje"])) / 100)
        filas.append({**t, "monto_nominal": monto, "estado": "pendiente"})
    if filas:
        filas[-1]["monto_nominal"] += total - sum(t["monto_nominal"] for t in filas)
    if any(t["monto_nominal"] < 0 for t in filas):
        raise ValueError("El plan contiene importes negativos. Revisá los tramos del presupuesto.")
    return filas
