import unittest
from datetime import date

from app.planificacion import resumir, validar_y_programar


def tarea(id, inicio=None, fin=None, deps=(), **otros):
    return dict(id=id, nombre=id, rubro_id="r", padre_id=None, tipo="tarea",
                fecha_inicio=date.fromisoformat(inicio) if inicio else None,
                fecha_fin=date.fromisoformat(fin) if fin else None,
                dependencias=[dict(depende_de_id=d, dias_desfase=n) for d, n in deps],
                **otros)


class PlanificacionTests(unittest.TestCase):
    def programar(self, tareas):
        return validar_y_programar(tareas, [{"id": "r"}])

    def test_tarea_sin_computo_presupuesto_o_fecha(self):
        self.assertEqual(self.programar([tarea("excavar")]), [])

    def test_fin_inicio_conserva_duracion(self):
        a = tarea("a", "2026-09-01", "2026-09-05")
        b = tarea("b", "2026-09-02", "2026-09-04", [("a", 0)])
        self.assertEqual(self.programar([b, a]), ["b"])
        self.assertEqual((b["fecha_inicio"], b["fecha_fin"]), (date(2026, 9, 6), date(2026, 9, 8)))

    def test_diamante_y_cadena_toman_la_predecesora_mas_tardia(self):
        a = tarea("a", "2026-09-01", "2026-09-10")
        b = tarea("b", "2026-09-01", "2026-09-02", [("a", 0)])
        c = tarea("c", "2026-09-01", "2026-09-05", [("a", 0)])
        d = tarea("d", "2026-09-01", "2026-09-03", [("b", 0), ("c", 0)])
        e = tarea("e", "2026-09-01", "2026-09-01", [("d", 0)])
        self.programar([e, d, b, a, c])
        self.assertEqual(d["fecha_inicio"], date(2026, 9, 16))
        self.assertEqual(e["fecha_inicio"], date(2026, 9, 19))

    def test_adelanto_no_mueve_fecha_manual(self):
        a = tarea("a", "2026-09-01", "2026-09-02")
        b = tarea("b", "2026-09-20", "2026-09-25", [("a", 0)])
        self.assertEqual(self.programar([a, b]), [])

    def test_desfase_negativo_y_predecesora_sin_fecha(self):
        a = tarea("a", "2026-09-01", "2026-09-10")
        b = tarea("b", "2026-09-01", "2026-09-02", [("a", -3), ("c", 0)])
        self.programar([a, b, tarea("c")])
        self.assertEqual(b["fecha_inicio"], date(2026, 9, 8))

    def test_ciclo_rechazado_antes_de_cambiar_fechas(self):
        a = tarea("a", "2026-09-01", "2026-09-02", [("b", 0)])
        b = tarea("b", "2026-09-01", "2026-09-02", [("a", 0)])
        with self.assertRaisesRegex(ValueError, "ciclo"):
            self.programar([a, b])
        self.assertEqual(a["fecha_inicio"], date(2026, 9, 1))

    def test_rechaza_vinculos_externos(self):
        for t in (tarea("a", deps=[("otra-obra", 0)]), {**tarea("a"), "padre_id": "otra-obra"}, {**tarea("a"), "rubro_id": "otro"}):
            with self.subTest(t=t), self.assertRaisesRegex(ValueError, "obra"):
                self.programar([t])

    def test_fechas_incompletas_o_invertidas(self):
        for ini, fin in [(None, "2026-09-01"), ("2026-09-01", None), ("2026-09-02", "2026-09-01")]:
            with self.subTest(ini=ini, fin=fin), self.assertRaisesRegex(ValueError, "fechas"):
                self.programar([tarea("a", ini, fin)])

    def test_jerarquia_ciclica_o_padre_de_otro_rubro(self):
        a = {**tarea("a"), "tipo": "grupo", "padre_id": "b"}
        b = {**tarea("b"), "tipo": "grupo", "padre_id": "a"}
        with self.assertRaisesRegex(ValueError, "ciclo"):
            self.programar([a, b])
        a.update(padre_id=None, rubro_id="r2")
        with self.assertRaisesRegex(ValueError, "mismo rubro"):
            validar_y_programar([a, b], [{"id": "r"}, {"id": "r2"}])

    def test_hoja_no_puede_contener_subtareas(self):
        with self.assertRaisesRegex(ValueError, "grupo"):
            self.programar([tarea("a"), {**tarea("b"), "padre_id": "a"}])

    def test_grupos_sin_fechas_ni_dependencias(self):
        for grupo in [{**tarea("a", "2026-09-01", "2026-09-01"), "tipo": "grupo"},
                      {**tarea("a", deps=[("b", 0)]), "tipo": "grupo"}]:
            with self.subTest(grupo=grupo), self.assertRaisesRegex(ValueError, "grupo"):
                self.programar([grupo, tarea("b")])

    def test_predecesoras_duplicadas_y_grupos_rechazados(self):
        for deps in [[("a", 0)], [("b", 0), ("b", 1)], [("g", 0)]]:
            with self.subTest(deps=deps), self.assertRaises(ValueError):
                self.programar([tarea("a", deps=deps), tarea("b"), {**tarea("g"), "tipo": "grupo"}])

    def test_hito_es_un_dia_y_su_duracion_es_cero(self):
        h = {**tarea("h", "2026-09-01", "2026-09-01"), "tipo": "hito"}
        self.programar([h])
        resumir([h], [{"id": "r"}])
        self.assertEqual(h["duracion"], 0)
        h["fecha_fin"] = date(2026, 9, 2)
        with self.assertRaisesRegex(ValueError, "hito"):
            self.programar([h])

    def test_resumen_no_cuenta_grupos_y_tolera_sin_avance(self):
        g = {**tarea("g"), "tipo": "grupo"}
        s = {**tarea("s"), "tipo": "grupo", "padre_id": "g"}
        a = {**tarea("a", "2026-09-01", "2026-09-03", avance_pct=100, tiene_avance=True), "padre_id": "s"}
        b = {**tarea("b", avance_pct=None, tiene_avance=False), "padre_id": "g"}
        rubros = [{"id": "r"}, {"id": "vacio"}]
        resumen = resumir([b, s, a, g], rubros)
        self.assertEqual(resumen["avance_pct"], 50)
        self.assertEqual(g["avance_pct"], 50)
        self.assertEqual(s["avance_pct"], 100)
        self.assertEqual(resumen["cantidad_tareas"], 2)
        self.assertEqual(resumen["sin_fecha"], 1)
        self.assertEqual(resumen["completadas"], 1)
        self.assertEqual(g["fecha_fin"], date(2026, 9, 3))
        self.assertIsNone(rubros[1]["avance_pct"])

    def test_cadena_larga_sin_recursion(self):
        tareas = [tarea(str(i), "2026-01-01", "2026-01-01", [(str(i - 1), 0)] if i else []) for i in range(1100)]
        self.assertEqual(len(self.programar(tareas[::-1])), 1099)


if __name__ == '__main__':
    unittest.main()
