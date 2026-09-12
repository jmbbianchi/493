import unittest
from datetime import date
from decimal import Decimal

from app.programacion_pagos import generar, periodo, tramos_a_cuotas


def hoja(id, ini='2026-09-01', fin='2026-09-21', padre=None):
    return {'id': id, 'tipo': 'tarea', 'padre_id': padre,
            'fecha_inicio': date.fromisoformat(ini) if ini else None,
            'fecha_fin': date.fromisoformat(fin) if fin else None}


class ProgramacionTests(unittest.TestCase):
    def test_cementista_anticipo_y_semanales_cierra_total(self):
        cuotas = generar(85000000, date(2026, 9, 1), date(2026, 10, 21), 'semanal', 20)
        self.assertEqual(cuotas[0]['monto_nominal'], Decimal('17000000.00'))
        self.assertEqual(sum(c['monto_nominal'] for c in cuotas), Decimal('85000000.00'))
        self.assertEqual(cuotas[0]['fecha_prevista'], date(2026, 8, 31))
        self.assertEqual(cuotas[1]['fecha_prevista'], date(2026, 9, 7))
        self.assertTrue(all(c['indexa'] for c in cuotas[1:]))

    def test_cemento_se_paga_completo_antes(self):
        cuotas = generar(1000000, date(2026, 9, 10), date(2026, 11, 10), 'anticipado')
        self.assertEqual(len(cuotas), 1)
        self.assertEqual(cuotas[0]['monto_nominal'], Decimal('1000000.00'))
        self.assertFalse(cuotas[0]['indexa'])

    def test_saldo_semanal_incluye_ultima_semana_incompleta(self):
        cuotas = generar(101, date(2026, 9, 1), date(2026, 9, 9), 'semanal', 0)
        self.assertEqual([c['fecha_prevista'] for c in cuotas], [date(2026, 9, 7), date(2026, 9, 9)])
        self.assertEqual(sum(c['monto_nominal'] for c in cuotas), Decimal('101.00'))

    def test_periodo_de_grupo_expande_hojas_y_no_duplica(self):
        tareas = [
            {'id': 'g', 'tipo': 'grupo', 'padre_id': None, 'fecha_inicio': date(2026, 9, 1), 'fecha_fin': date(2026, 9, 30)},
            hoja('a', '2026-09-01', '2026-09-10', 'g'), hoja('b', '2026-09-20', '2026-09-30', 'g')]
        self.assertEqual(periodo(tareas, ['g', 'a']), (date(2026, 9, 1), date(2026, 9, 30)))

    def test_periodo_incompleto_no_genera_pago(self):
        self.assertEqual(periodo([hoja('a', None, None)], ['a']), (None, None))

    def test_tramos_redondean_una_sola_vez(self):
        cuotas = tramos_a_cuotas([
            {'monto_base': None, 'porcentaje': 33.3333},
            {'monto_base': None, 'porcentaje': 33.3333},
            {'monto_base': None, 'porcentaje': 33.3334}], 100)
        self.assertEqual(sum(c['monto_nominal'] for c in cuotas), Decimal('100.00'))
        self.assertEqual(cuotas[-1]['monto_nominal'], Decimal('33.34'))


if __name__ == '__main__':
    unittest.main()
