import os
import unittest
from datetime import date, timedelta
from unittest.mock import patch
from fastapi import HTTPException
os.environ.setdefault("SQL_CONNECTION_STRING", "Server=localhost;User ID=test;Password=test;Database=test")
from app.routers.pagos import PagoNuevo, registrar

class PagosVinculadosTests(unittest.TestCase):
    def datos(self, **extra):
        return PagoNuevo(rubro_id=1, presupuesto_id="p", fecha=date.today(), monto=100, **extra)

    def test_no_elegido_no_inserta_pago(self):
        with patch("app.routers.pagos.db.cursor") as db:
            cur = db.return_value.__enter__.return_value
            cur.fetchone.return_value = dict(rubro_id=1, subrubro_id=2, estado="confirmado", elegido=False)
            with self.assertRaises(HTTPException) as e:
                registrar("obra", self.datos())
            self.assertEqual(e.exception.status_code, 409)
            self.assertFalse(any("INSERT INTO dbo.pago" in c.args[0] for c in cur.execute.call_args_list))

    def test_cuota_ajena_no_inserta_pago(self):
        with patch("app.routers.pagos.db.cursor") as db:
            cur = db.return_value.__enter__.return_value
            cur.fetchone.side_effect = [dict(rubro_id=1, subrubro_id=2, estado="confirmado", elegido=True), None]
            with self.assertRaises(HTTPException):
                registrar("obra", self.datos(cuota_id="otra"))
            self.assertFalse(any("INSERT INTO dbo.pago" in c.args[0] for c in cur.execute.call_args_list))

    def test_pago_guardado_sobrevive_error_de_saldo(self):
        with patch("app.routers.pagos.db.cursor") as db, patch("app.routers.pagos._saldo", side_effect=RuntimeError()):
            cur = db.return_value.__enter__.return_value
            cur.fetchone.return_value = dict(rubro_id=1, subrubro_id=2, estado="confirmado", elegido=True)
            r = registrar("obra", self.datos())
            self.assertTrue(r["id"])
            self.assertIn("guardado", r["aviso"])
            self.assertIsNone(r["saldo"])

    def test_avance_requiere_revision_antes_de_escribir(self):
        with patch("app.routers.pagos.db.cursor") as db:
            with self.assertRaises(HTTPException):
                registrar("obra", self.datos(avances=[dict(tarea_id="00000000-0000-0000-0000-000000000001", avance_pct=25)]))
            db.assert_not_called()

    def test_avance_y_pago_comparten_transaccion(self):
        with patch("app.routers.pagos.db.cursor") as db, patch("app.routers.proyecto._abrir"), patch("app.routers.proyecto._incrementar") as incrementar, patch("app.routers.pagos._saldo", return_value=None):
            cur = db.return_value.__enter__.return_value
            cur.fetchone.side_effect = [dict(rubro_id=1, subrubro_id=2, estado="confirmado", elegido=True), dict(tipo="tarea")]
            registrar("obra", self.datos(proyecto_version=2, avances=[dict(tarea_id="00000000-0000-0000-0000-000000000001", avance_pct=25)]))
            self.assertEqual(db.call_count, 1)
            self.assertTrue(any("INSERT INTO dbo.pago" in c.args[0] for c in cur.execute.call_args_list))
            self.assertTrue(any("UPDATE dbo.proyecto_avance" in c.args[0] for c in cur.execute.call_args_list))
            incrementar.assert_called_once_with(cur, "obra", 2)
