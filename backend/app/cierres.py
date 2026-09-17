"""Un cierre extingue el saldo, nunca crea un pago ni cambia el precio original."""
from fastapi import HTTPException

def aplicar_cierre(total, presupuesto):
    if not presupuesto.get('cierre_fecha'):
        return total
    total.update(cerrado=True, cancelado=float(presupuesto['cierre_cancelado']),
                 pagado=float(presupuesto['cierre_pagado']),
                 proyectado=float(presupuesto['cierre_proyectado']), saldo=0,
                 saldo_nominal=0, saldo_equivalente=0, resuelto_pct=100,
                 avance_pago_pct=(float(presupuesto['cierre_pagado']) / float(presupuesto['cierre_proyectado']) * 100
                                  if presupuesto['cierre_proyectado'] else 0))
    return total

def exigir_abierto(p):
    if p.get('cierre_fecha'):
        raise HTTPException(409, 'El presupuesto está cerrado con saldo cancelado; su acuerdo y pagos quedan conservados como historial.')
