import os
import unittest
from unittest.mock import patch
from decimal import Decimal
from fastapi import HTTPException
os.environ.setdefault('SQL_CONNECTION_STRING','Server=localhost;User ID=test;Password=test;Database=test')
from app.routers.desembolsos import Acuerdo, guardar, validar

CID='00000000-0000-0000-0000-000000000001'

class AcuerdosTests(unittest.TestCase):
    def datos(self, **extra):
        return Acuerdo(huella='h',nombre='Proveedor',monto_base='90',elegido=True,
                       cuotas=[dict(id=CID,descripcion='Saldo',monto_nominal='90')],**extra)

    def test_negociacion_items_y_cambio_rubro_reclasifica_pagos(self):
        p=dict(estado='confirmado',origen='items',monto_base=100,rubro_id=1,subrubro_id=2)
        cuota=dict(id=CID,estado='pendiente',orden=1)
        with patch('app.routers.desembolsos.leer',return_value=(p,[cuota],[],{},'h')), patch('app.routers.desembolsos.db.cursor') as db, patch('app.routers.proyecto._incrementar'):
            cur=db.return_value.__enter__.return_value
            cur.fetchone.return_value={'id':3}
            guardar('obra','presupuesto',self.datos(rubro_id=3,subrubro_id=4))
            llamadas=cur.execute.call_args_list
            actualizacion=next(c for c in llamadas if 'SET nombre=' in c.args[0])
            self.assertEqual(actualizacion.args[1][1],Decimal('90'))
            pago=next(c for c in llamadas if 'UPDATE dbo.pago' in c.args[0])
            self.assertEqual(pago.args[1],(3,4,'obra','presupuesto'))
            self.assertNotIn('monto=',pago.args[0])
            self.assertFalse(any('SET elegido=0' in c.args[0] for c in llamadas))

    def test_no_modifica_cuota_con_pago(self):
        anterior=dict(id=CID,estado='pendiente',monto_nominal=100,fecha_prevista=None,tipo='cuota',indexa=False)
        with self.assertRaises(HTTPException) as error:
            validar(self.datos(),[anterior],[dict(cuota_id=CID,anulado=False)])
        self.assertEqual(error.exception.status_code,409)

    def test_rubro_inexistente_no_escribe(self):
        p=dict(estado='confirmado',origen='monto',monto_base=100,rubro_id=1,subrubro_id=2)
        with patch('app.routers.desembolsos.leer',return_value=(p,[dict(id=CID,estado='pendiente')],[],{},'h')), patch('app.routers.desembolsos.db.cursor') as db:
            cur=db.return_value.__enter__.return_value
            cur.fetchone.return_value=None
            with self.assertRaises(HTTPException):guardar('obra','p',self.datos(rubro_id=99))
            self.assertFalse(any('UPDATE ' in c.args[0] for c in cur.execute.call_args_list))
