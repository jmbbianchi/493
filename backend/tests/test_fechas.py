import unittest
from datetime import datetime, timezone
from unittest.mock import patch
from app.fechas import BUENOS_AIRES, hoy_argentina

class FechasTests(unittest.TestCase):
    def test_cambio_dia_en_buenos_aires(self):
        instante = datetime(2026, 1, 1, 2, 59, tzinfo=timezone.utc)
        with patch('app.fechas.datetime') as reloj:
            reloj.now.return_value = instante.astimezone(BUENOS_AIRES)
            self.assertEqual(str(hoy_argentina()), '2025-12-31')
            reloj.now.assert_called_once_with(BUENOS_AIRES)
