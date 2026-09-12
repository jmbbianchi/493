"""Contratos HTTP y transacciones; SQL Server se sustituye por un cursor espia.

Estos tests no validan la sintaxis ni la migracion T-SQL.
"""
import copy
import os
import unittest
from datetime import date, timedelta
from unittest.mock import MagicMock, patch

os.environ.setdefault("SQL_CONNECTION_STRING", "Server=localhost;User ID=test;Password=test;Database=test")

from fastapi import FastAPI
from fastapi.testclient import TestClient
from app import db, seguridad
from app.routers import proyecto

OBRA = "00000000-0000-0000-0000-000000000001"
RUBRO = "00000000-0000-0000-0000-000000000002"
TAREA = "00000000-0000-0000-0000-000000000003"
OTRA = "00000000-0000-0000-0000-000000000004"
RUTA = f"/api/obras/{OBRA}/proyecto"


class ProyectoApiTests(unittest.TestCase):
    def setUp(self):
        app = FastAPI()
        app.include_router(proyecto.router)
        self.client = TestClient(app)
        self.rol = "editor"
        self.estado = "activo"
        self.acceso = True
        self.con = MagicMock()
        self.cur = self.con.cursor.return_value
        self.cur.rowcount = 1
        self.cur.fetchone.side_effect = [{"id": OBRA}, {"tabla": 123}, {"version": 4}]
        self.tareas = []
        self.rubros = [{"id": RUBRO, "nombre": "Estructura", "orden": 10}]
        self.addCleanup(patch.stopall)
        patch.object(seguridad, "_CLAVE", "test-key").start()
        patch.object(db.pymssql, "connect", return_value=self.con).start()
        patch.object(db, "query", side_effect=self.autorizacion).start()
        patch.object(proyecto, "_leer", side_effect=lambda *_: (copy.deepcopy(self.tareas), copy.deepcopy(self.rubros))).start()

    def autorizacion(self, sql, params):
        if "FROM dbo.usuario" in sql:
            return [{"id": "test-user", "estado": self.estado, "rol_global": "duenio"}]
        if "v_acceso_obra" in sql:
            return [{"rol_efectivo": self.rol}] if self.acceso else []
        raise AssertionError(sql)

    def enviar(self, metodo="POST", ruta="/tareas", cuerpo=None):
        return self.client.request(metodo, RUTA + ruta, json=cuerpo, headers={"X-Obra-Key": "test-key"})

    def cuerpo(self, **cambios):
        return dict(version=4, nombre="Encofrado", rubro_id=RUBRO, **cambios)

    def hoja(self):
        return dict(id=TAREA, nombre="Encofrado", rubro_id=RUBRO, padre_id=None,
                    tipo="tarea", fecha_inicio=None, fecha_fin=None, dependencias=[],
                    avance_pct=None, tiene_avance=False)

    def test_crear_sin_computo_en_transaccion_y_con_revision(self):
        r = self.enviar(cuerpo=self.cuerpo())
        self.assertEqual(r.status_code, 201, r.text)
        self.assertEqual(r.json()["version"], 5)
        self.con.commit.assert_called_once()
        self.con.close.assert_called_once()
        escrituras = [c.args for c in self.cur.execute.call_args_list if c.args[0].startswith("INSERT dbo.proyecto_tarea")]
        self.assertEqual(len(escrituras), 1)
        self.assertIn(OBRA, escrituras[0][1])
        self.assertNotIn("computo", escrituras[0][0])

    def test_error_al_guardar_dependencias_revierte_toda_la_edicion(self):
        otra = {**self.hoja(), "id": OTRA}
        self.tareas = [self.hoja(), otra]
        def ejecutar(sql, params=()):
            if sql.startswith("INSERT dbo.proyecto_dependencia"):
                raise RuntimeError("fallo de almacenamiento simulado")
        self.cur.execute.side_effect = ejecutar
        with self.assertRaisesRegex(RuntimeError, "simulado"):
            self.enviar("PUT", f"/tareas/{TAREA}", self.cuerpo(dependencias=[{"depende_de_id": OTRA}]))
        self.con.commit.assert_not_called()
        self.con.rollback.assert_called_once()
        self.con.close.assert_called_once()

    def test_revision_obsoleta_devuelve_conflicto_sin_escribir(self):
        self.cur.fetchone.side_effect = [{"id": OBRA}, {"tabla": 123}, {"version": 5}]
        r = self.enviar(cuerpo=self.cuerpo())
        self.assertEqual(r.status_code, 409)
        self.assertTrue(all(c.args[0].startswith("SELECT") for c in self.cur.execute.call_args_list))
        self.con.commit.assert_not_called()
        self.con.rollback.assert_called_once()

    def test_lectura_puede_consultar_pero_no_mutar(self):
        self.rol = "lectura"
        r = self.enviar("GET", "")
        self.assertEqual(r.status_code, 200, r.text)
        self.assertFalse(r.json()["editable"])
        self.con.reset_mock()
        r = self.enviar(cuerpo=self.cuerpo())
        self.assertEqual(r.status_code, 403)
        self.con.cursor.assert_not_called()

    def test_sin_permiso_oculta_la_obra(self):
        self.acceso = False
        self.assertEqual(self.enviar("GET", "").status_code, 404)
        self.con.cursor.assert_not_called()

    def test_clave_incorrecta_no_consulta_datos(self):
        r = self.client.get(RUTA, headers={"X-Obra-Key": "incorrecta"})
        self.assertEqual(r.status_code, 401)
        db.query.assert_not_called()
        self.con.cursor.assert_not_called()

    def test_migracion_pendiente_responde_error_controlado(self):
        self.cur.fetchone.side_effect = [{"id": OBRA}, {"tabla": None}]
        r = self.enviar("GET", "")
        self.assertEqual(r.status_code, 503)
        self.assertIn("habilitada", r.json()["detail"])

    def test_rechaza_rubro_o_predecesora_de_otra_obra(self):
        r = self.enviar(cuerpo={**self.cuerpo(), "rubro_id": OTRA})
        self.assertEqual(r.status_code, 422)
        self.assertIn("obra", r.json()["detail"])
        self.assertTrue(all(c.args[0].startswith("SELECT") for c in self.cur.execute.call_args_list))

    def test_editar_tarea_ajena_es_404(self):
        self.assertEqual(self.enviar("PUT", f"/tareas/{OTRA}", self.cuerpo()).status_code, 404)

    def test_no_permite_cambiar_tipo_y_perder_historia(self):
        self.tareas = [self.hoja()]
        r = self.enviar("PUT", f"/tareas/{TAREA}", self.cuerpo(tipo="grupo"))
        self.assertEqual(r.status_code, 422)

    def test_fechas_y_nombres_invalidos(self):
        r = self.enviar(cuerpo=self.cuerpo(fecha_inicio="2026-09-15", fecha_fin="2026-09-10"))
        self.assertEqual(r.status_code, 422)
        r = self.enviar(cuerpo={**self.cuerpo(), "nombre": "   "})
        self.assertEqual(r.status_code, 422)

    def test_avance_futuro_y_fuera_de_rango_rechazados(self):
        for cambios in [{"fecha": (date.today() + timedelta(days=1)).isoformat()}, {"avance_pct": 101}]:
            cuerpo = {"version": 4, "fecha": date.today().isoformat(), "avance_pct": 20, **cambios}
            with self.subTest(cambios=cambios):
                self.assertEqual(self.enviar("POST", f"/tareas/{TAREA}/avances", cuerpo).status_code, 422)
        self.con.cursor.assert_not_called()

    def test_avance_mismo_dia_actualiza_con_nota_sin_insertar(self):
        self.cur.fetchone.side_effect = [{"id": OBRA}, {"tabla": 123}, {"version": 4}, {"tipo": "tarea"}]
        r = self.enviar("POST", f"/tareas/{TAREA}/avances", {"version": 4, "fecha": "2026-01-01", "avance_pct": 30, "nota": "Medición"})
        self.assertEqual(r.status_code, 201, r.text)
        self.assertFalse(any(c.args[0].startswith("INSERT dbo.proyecto_avance") for c in self.cur.execute.call_args_list))
        self.con.commit.assert_called_once()

    def test_avance_de_grupo_no_se_carga_directamente(self):
        self.cur.fetchone.side_effect = [{"id": OBRA}, {"tabla": 123}, {"version": 4}, {"tipo": "grupo"}]
        r = self.enviar("POST", f"/tareas/{TAREA}/avances", {"version": 4, "fecha": "2026-01-01", "avance_pct": 30})
        self.assertEqual(r.status_code, 422)
        self.con.commit.assert_not_called()


if __name__ == '__main__':
    unittest.main()
