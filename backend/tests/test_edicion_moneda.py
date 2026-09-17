import unittest
from unittest.mock import patch
from fastapi import HTTPException
from app.routers.pagos import PagoEdicion, editar, eliminar

class EdicionMonedaTests(unittest.TestCase):
    def test_cambiar_moneda_conserva_importe(self):
        with patch('app.routers.pagos.db.execute', return_value=1) as ejecutar:
            editar('obra','pago',PagoEdicion(fecha='2025-06-02',monto=1600,moneda='USD',medio='efectivo'))
        self.assertEqual(ejecutar.call_args.args[1][1],1600)
        self.assertEqual(ejecutar.call_args.args[1][4],'USD')

    def test_elimina_conservando_documentos_en_transaccion(self):
        with patch('app.routers.pagos.db.cursor') as db:
            cur=db.return_value.__enter__.return_value
            cur.fetchone.return_value={'id':'pago'}
            eliminar('obra','pago')
            llamadas=cur.execute.call_args_list
            self.assertIn('pago_id=NULL',llamadas[-2].args[0])
            self.assertIn('DELETE FROM dbo.pago',llamadas[-1].args[0])
            self.assertEqual(llamadas[-1].args[1],('pago','obra'))

    def test_pago_ajeno_no_modifica_documentos(self):
        with patch('app.routers.pagos.db.cursor') as db:
            cur=db.return_value.__enter__.return_value
            cur.fetchone.return_value=None
            with self.assertRaises(HTTPException): eliminar('obra','pago')
            self.assertEqual(cur.execute.call_count,1)
