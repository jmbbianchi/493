"""Saldos en moneda contractual y equivalencias con fecha explícita."""
from .fechas import hoy_argentina
from datetime import date
from decimal import Decimal
from . import db

def convertir(monto, origen, destino, dolar):
    monto = Decimal(str(monto))
    if origen == destino:
        return monto
    if dolar is None or Decimal(str(dolar)) <= 0:
        return None
    tasa = Decimal(str(dolar))
    return monto * tasa if destino == 'ARS' else monto / tasa

def cotizacion(fecha):
    filas = db.query("SELECT TOP 1 fecha,valor FROM dbo.indice_valor WHERE codigo='USD_MINORISTA' AND fecha<=%s AND valor>0 ORDER BY fecha DESC", (fecha,))
    return filas[0] if filas else None

def pagos_convertidos(pagos, moneda, cache=None):
    cache = {} if cache is None else cache
    for pago in pagos:
        f = pago['fecha']
        if f not in cache:
            cache[f] = cotizacion(f)
        tasa = cache[f]
        pago['monto_presupuesto'] = convertir(pago['monto'], pago['moneda'], moneda, tasa['valor'] if tasa else None)
        pago['cotizacion_fecha'] = tasa['fecha'] if tasa else None
    return pagos

def saldo(pagos, moneda, nominal, proyectado):
    hoy = hoy_argentina()
    vivos = [p for p in pagos if not p['anulado'] and p['fecha'] <= hoy]
    total = sum((p['monto_presupuesto'] for p in vivos if p['monto_presupuesto'] is not None), Decimal(0))
    faltantes = sum(p['monto_presupuesto'] is None for p in vivos)
    pendiente = Decimal(str(proyectado)) - total
    tasa = cotizacion(hoy)
    otra = 'ARS' if moneda == 'USD' else 'USD'
    equivalente = convertir(pendiente, moneda, otra, tasa['valor'] if tasa else None)
    return dict(moneda=moneda, pagado=float(total), saldo=None if faltantes else float(pendiente),
                saldo_nominal=None if faltantes else float(Decimal(str(nominal))-total),
                avance_pago_pct=None if faltantes or not proyectado else float(total/Decimal(str(proyectado))*100),
                pagos_sin_convertir=faltantes, equivalente_moneda=otra,
                saldo_equivalente=None if faltantes or equivalente is None else float(equivalente),
                cotizacion_actual=float(tasa['valor']) if tasa else None,
                cotizacion_actual_fecha=tasa['fecha'] if tasa else None)
