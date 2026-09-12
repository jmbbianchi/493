from calendar import monthrange
from datetime import date
from decimal import Decimal, ROUND_HALF_UP

Q = Decimal('0.01')

def cuota_fija(capital: Decimal, tasa_anual: Decimal, meses: int) -> Decimal:
    if meses < 1 or capital <= 0: raise ValueError('capital y meses deben ser positivos')
    r = tasa_anual / Decimal(1200)
    if r == 0: return (capital / meses).quantize(Q, rounding=ROUND_HALF_UP)
    return (capital * r / (1 - (1 + r) ** (-meses))).quantize(Q, rounding=ROUND_HALF_UP)

def sumar_meses(d: date, meses: int) -> date:
    n = d.month - 1 + meses; y, m = d.year + n // 12, n % 12 + 1
    return date(y, m, min(d.day, monthrange(y, m)[1]))

def proyectar(capital, tasa_anual, meses, inicio, ajuste_mensual=Decimal(0), adelanto_meses=0):
    capital, tasa_anual = Decimal(capital), Decimal(tasa_anual)
    cuota = cuota_fija(capital, tasa_anual, meses); saldo = capital; filas = []; total = Decimal(0)
    for n in range(1, meses + 1):
        interes = (saldo * tasa_anual / Decimal(1200)).quantize(Q, rounding=ROUND_HALF_UP)
        pago = cuota
        if ajuste_mensual: pago = (pago * (1 + ajuste_mensual / 100) ** (n - 1)).quantize(Q, rounding=ROUND_HALF_UP)
        amort = min(saldo, max(Decimal(0), pago - interes)); saldo = max(Decimal(0), saldo - amort); total += pago
        filas.append({'numero': n, 'fecha': sumar_meses(inicio, n - 1), 'pago': float(pago), 'interes': float(interes), 'amortizacion': float(amort), 'saldo': float(saldo)})
        if saldo == 0: break
    if adelanto_meses and adelanto_meses < len(filas):
        pagos_restantes = sum((Decimal(str(f['pago'])) for f in filas[adelanto_meses:]), Decimal(0))
        saldo_tras_adelanto = Decimal(str(filas[adelanto_meses - 1]['saldo']))
        ahorro = max(Decimal(0), pagos_restantes - saldo_tras_adelanto)
    else:
        ahorro = Decimal(0)
    return {'cuota_inicial': float(cuota), 'total_proyectado': float(total), 'ahorro_adelantando': float(ahorro), 'cuotas': filas}
