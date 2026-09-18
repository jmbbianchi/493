import unittest
from unittest.mock import patch
from fastapi import HTTPException
from app.routers.pagos import editar, PagoEdicion

PID='00000000-0000-0000-0000-000000000001'
class EdicionDestinoTests(unittest.TestCase):
    def datos(self,**extra):
        return PagoEdicion(fecha='2026-09-15',monto=100,moneda='ARS',medio='efectivo',rubro_id=2,subrubro_id=None,**extra)
    def test_desvincular_conserva_identidad_y_documentos(self):
        with patch('app.routers.pagos.db.cursor') as db:
            cur=db.return_value.__enter__.return_value
            cur.fetchone.side_effect=[{'id':'obra'},{'presupuesto_id':PID,'cuota_id':'cuota','rubro_id':1,'subrubro_id':1,'moneda':'ARS'},{'cierre_fecha':None},{'id':2}]
            editar('obra','pago',self.datos(presupuesto_id=None,cuota_id=None))
            sql,args=cur.execute.call_args.args
            self.assertEqual(args[5:9],(2,None,None,None))
            self.assertEqual(args[-2:],('pago','obra'))
            self.assertFalse(any('documento' in c.args[0] or 'DELETE' in c.args[0] for c in cur.execute.call_args_list))
    def test_no_asigna_presupuesto_ajeno(self):
        with patch('app.routers.pagos.db.cursor') as db:
            cur=db.return_value.__enter__.return_value
            cur.fetchone.side_effect=[{'id':'obra'},{'presupuesto_id':None,'cuota_id':None,'rubro_id':1,'subrubro_id':None,'moneda':'ARS'},{'id':2},None]
            with self.assertRaises(HTTPException): editar('obra','pago',self.datos(presupuesto_id=PID))
            self.assertFalse(any('UPDATE' in c.args[0] for c in cur.execute.call_args_list))
    def test_asigna_nuevo_presupuesto_sin_heredar_cuota(self):
        with patch('app.routers.pagos.db.cursor') as db:
            cur=db.return_value.__enter__.return_value
            cur.fetchone.side_effect=[{'id':'obra'},{'presupuesto_id':None,'cuota_id':None,'rubro_id':1,'subrubro_id':None,'moneda':'ARS'},{'id':2},{'rubro_id':2,'subrubro_id':None,'estado':'confirmado','cierre_fecha':None}]
            editar('obra','pago',self.datos(presupuesto_id=PID))
            self.assertEqual(cur.execute.call_args.args[1][7:9],(PID,None))
