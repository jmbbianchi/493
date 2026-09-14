import unittest
from datetime import date
from decimal import Decimal
from unittest.mock import patch
from app.monedas import convertir, saldo, pagos_convertidos

class MonedasTests(unittest.TestCase):
    def test_pago_historico_se_convierte_antes_de_revaluar_saldo(self):
        pago=dict(fecha=date(2025,6,2),monto=1600000,moneda='ARS',anulado=False)
        with patch('app.monedas.cotizacion',return_value=dict(fecha=date(2025,6,2),valor=1000)) as consulta:
            pagos_convertidos([pago],'USD')
            consulta.assert_called_once_with(date(2025,6,2))
        with patch('app.monedas.cotizacion',return_value=dict(fecha=date.today(),valor=1500)):
            resultado=saldo([pago],'USD',33600,33600)
        self.assertEqual(resultado['pagado'],1600)
        self.assertEqual(resultado['saldo'],32000)
        self.assertEqual(resultado['saldo_equivalente'],48000000)
    def test_misma_moneda_no_necesita_cotizacion(self):
        self.assertEqual(convertir(1600,'USD','USD',None),Decimal(1600))
    def test_ambas_direcciones(self):
        self.assertEqual(convertir(1600000,'ARS','USD',1000),Decimal(1600))
        self.assertEqual(convertir(1600,'USD','ARS',1000),Decimal(1600000))
        self.assertIsNone(convertir(1600,'ARS','USD',None))
    def test_saldo_contractual_y_equivalente_actual(self):
        pagos=[dict(fecha=date(2025,6,2),anulado=False,monto_presupuesto=Decimal(1600))]
        with patch('app.monedas.cotizacion',return_value=dict(fecha=date.today(),valor=1500)):
            r=saldo(pagos,'USD',33600,33600)
        self.assertEqual(r['saldo'],32000)
        self.assertEqual(r['saldo_equivalente'],48000000)
        self.assertAlmostEqual(r['avance_pago_pct'],1600/33600*100)
    def test_faltante_no_finge_saldo_completo(self):
        with patch('app.monedas.cotizacion',return_value=None):
            r=saldo([dict(fecha=date(2025,6,2),anulado=False,monto_presupuesto=None)],'USD',33600,33600)
        self.assertIsNone(r['saldo'])
