import unittest
from datetime import date
from unittest.mock import patch
from fastapi import HTTPException
from app.cierres import aplicar_cierre
from app.routers.presupuestos import cerrar, CierrePresupuesto
from app.routers.pagos import registrar, PagoNuevo, eliminar

class CierresTests(unittest.TestCase):
    def test_cierre_no_es_pago_y_no_reaparece_ipc(self):
        total={'nominal':590000,'pagado':490000,'proyectado':900000,'saldo':410000}
        aplicar_cierre(total,dict(cierre_fecha=date(2026,1,1),cierre_cancelado=100000,cierre_pagado=490000,cierre_proyectado=590000))
        self.assertEqual(total['pagado'],490000)
        self.assertEqual(total['nominal'],590000)
        self.assertEqual(total['cancelado'],100000)
        self.assertEqual(total['saldo'],0)
        self.assertEqual(total['resuelto_pct'],100)
        self.assertLess(total['avance_pago_pct'],100)

    def cierre(self, revision='h', monto=100000, reemplazo=None):
        p={'estado':'confirmado'}
        lectura=(p,[],[],{},'h')
        datos=CierrePresupuesto(fecha='2026-01-01',motivo='Reemplazado por acuerdo actualizado',monto_cancelado=monto,reemplazo_id=reemplazo)
        with patch('app.routers.desembolsos.leer',side_effect=[lectura,(*lectura[:4],revision),(*lectura[:4],revision)]), patch('app.routers.presupuestos.ver',return_value={'total':{'saldo':100000,'pagado':490000,'proyectado':590000}}), patch('app.routers.presupuestos.db.cursor') as db:
            cur=db.return_value.__enter__.return_value
            cur.fetchone.return_value=None
            result=cerrar('obra','presupuesto',datos)
            sql, params=cur.execute.call_args.args
            self.assertIn('cierre_cancelado',sql)
            self.assertNotIn('monto_base=',sql)
            self.assertEqual(params[2],100000)
            self.assertFalse(any('INSERT' in c.args[0] for c in cur.execute.call_args_list))
            return result

    def test_cierra_sin_crear_pago(self):
        self.assertEqual(self.cierre()['saldo'],0)

    def test_rechaza_cambio_concurrente(self):
        with self.assertRaises(HTTPException): self.cierre(revision='nuevo')

    def test_rechaza_monto_desactualizado(self):
        with self.assertRaises(HTTPException): self.cierre(monto=90000)

    def test_rechaza_reemplazo_ajeno(self):
        with self.assertRaises(HTTPException): self.cierre(reemplazo='00000000-0000-0000-0000-000000000001')

    def test_cerrado_no_admite_nuevo_pago(self):
        with patch('app.routers.pagos.db.cursor') as db:
            cur=db.return_value.__enter__.return_value
            cur.fetchone.return_value={'cierre_fecha':date(2026,1,1)}
            with self.assertRaises(HTTPException): registrar('obra',PagoNuevo(rubro_id=1,presupuesto_id='p',fecha='2026-01-01',monto=100))
            self.assertFalse(any('INSERT' in c.args[0] for c in cur.execute.call_args_list))

    def test_cerrado_no_permite_borrar_pago(self):
        with patch('app.routers.pagos.db.cursor') as db:
            cur=db.return_value.__enter__.return_value
            cur.fetchone.side_effect=[{'id':'p'},{'cierre_fecha':date(2026,1,1)}]
            with self.assertRaises(HTTPException): eliminar('obra','p')
            self.assertFalse(any('DELETE' in c.args[0] for c in cur.execute.call_args_list))
