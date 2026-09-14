import os
import unittest
from datetime import date
from unittest.mock import patch
from fastapi import HTTPException
os.environ.setdefault('SQL_CONNECTION_STRING','Server=localhost;User ID=test;Password=test;Database=test')
from app.routers.cotizaciones import series
from app.jobs.indices import _filas_oficial

class CotizacionesTests(unittest.TestCase):
    def test_rango_completo_y_ipc_anual_fuera_de_filtro(self):
        filas=[dict(codigo='USD_OFICIAL_COMPRA',fecha=date(2026,3,1),valor=100),dict(codigo='IPC_MENSUAL',fecha=date(2026,1,1),valor=2)]
        with patch('app.routers.cotizaciones.db.query',return_value=filas) as query:
            resultado=series(date(2026,3,1),date(2026,9,14))
        self.assertNotIn('TOP 120',query.call_args.args[0])
        self.assertEqual(query.call_args.args[1][0],date(2026,1,1))
        self.assertEqual(len(resultado['ipc_anio']),1)
        self.assertEqual(next(s for s in resultado['series'] if s['codigo']=='IPC_MENSUAL')['valores'],[])

    def test_fechas_invertidas_no_consultan(self):
        with patch('app.routers.cotizaciones.db.query') as query:
            with self.assertRaises(HTTPException):series(date(2026,2,1),date(2026,1,1))
            query.assert_not_called()

    def test_compra_venta_separadas_sin_inventar_faltantes(self):
        datos=[dict(casa='oficial',fecha='2026-09-14',compra=1480,venta=1530),
            dict(casa='oficial',fecha='2026-09-13',compra=None,venta=1530),
            dict(casa='blue',fecha='2026-09-14',compra=1500,venta=1600),
            dict(casa='oficial',fecha='2027-01-01',compra=1700,venta=1800)]
        filas=_filas_oficial(datos,date(2026,9,14))
        self.assertEqual(len(filas),3)
        self.assertEqual(filas[0][0],'USD_OFICIAL_COMPRA')
        self.assertEqual(filas[0][2],1480)
        self.assertEqual(filas[1][2],1530)
