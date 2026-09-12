import unittest
from datetime import date
from decimal import Decimal
from app.financiacion import cuota_fija, proyectar
class FinanciacionTest(unittest.TestCase):
    def test_tasa_cero(self): self.assertEqual(cuota_fija(Decimal('1200'), Decimal('0'), 12), Decimal('100.00'))
    def test_cierra_saldo(self):
        r = proyectar('100000', '0', 10, date(2026, 1, 15)); self.assertEqual(len(r['cuotas']), 10); self.assertEqual(r['cuotas'][-1]['saldo'], 0.0)
    def test_adelanto_mide_interes_que_se_evitaria(self):
        r = proyectar('100000', '12', 12, date(2026, 1, 1), adelanto_meses=3)
        self.assertGreater(r['ahorro_adelantando'], 0)
        self.assertLess(r['ahorro_adelantando'], r['total_proyectado'])
