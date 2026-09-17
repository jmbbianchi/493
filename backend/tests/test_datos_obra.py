import os
import unittest
from unittest.mock import patch
from pydantic import ValidationError
from fastapi import HTTPException
os.environ.setdefault('SQL_CONNECTION_STRING','Server=localhost;User ID=test;Password=test;Database=test')
from app.routers.obras import ObraCambio, editar
from app.routers.documentos import Pedido, TipoDocumento, clasificar

class DatosObraTests(unittest.TestCase):
    def test_edicion_devuelve_obra_con_usuario_resuelto(self):
        with patch('app.routers.obras.db.execute') as ejecutar,patch('app.routers.obras.ver',return_value={'sup_cubierta':231.46}) as ver:
            usuario={'id':'u','rol':'editor'}
            editar('obra',ObraCambio(sup_cubierta=231.46,fecha_inicio=None),usuario)
            ver.assert_called_once_with('obra',usuario)
            self.assertEqual(ejecutar.call_args.args[1],(231.46,None,'obra'))
    def test_valida_parametros(self):
        for d in [{'sup_cubierta':-1},{'sup_cubierta':float('inf')},{'criterio_m2':'inventado'},{'estado':'otro'},{'desperdicio_pct':101}]:
            with self.assertRaises(ValidationError):ObraCambio(**d)
        with self.assertRaises(HTTPException):editar('o',ObraCambio(nombre=None),{'id':'u'})
    def test_tipos_comprobantes_y_alcance_obra(self):
        for tipo in ['recibo','transferencia','factura']:
            self.assertEqual(Pedido(tipo=tipo,nombre='archivo.pdf').tipo,tipo)
        with patch('app.routers.documentos.db.execute',return_value=1) as ejecutar:
            clasificar('obra','doc',TipoDocumento(tipo='recibo'))
            self.assertEqual(ejecutar.call_args.args[1],('recibo','doc','obra'))
            self.assertIn('obra_id=%s',ejecutar.call_args.args[0])
        with patch('app.routers.documentos.db.execute',return_value=0):
            with self.assertRaises(HTTPException):clasificar('otra','doc',TipoDocumento(tipo='recibo'))
