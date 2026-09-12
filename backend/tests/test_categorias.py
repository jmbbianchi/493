import os
import unittest
from unittest.mock import patch

os.environ.setdefault('SQL_CONNECTION_STRING', 'Server=localhost;User ID=test;Password=test;Database=test')
from fastapi import HTTPException
from app.routers.calculadora import _crear_categoria


class CategoriasTests(unittest.TestCase):
    def test_nombre_vacio_no_escribe(self):
        with patch('app.routers.calculadora.db.cursor') as db:
            with self.assertRaises(HTTPException):
                _crear_categoria('rubro', '   ')
            db.assert_not_called()

    def test_reutiliza_nombre_existente(self):
        with patch('app.routers.calculadora.db.cursor') as db:
            cur = db.return_value.__enter__.return_value
            cur.fetchone.return_value = {'id': 7, 'nombre': 'Pileta'}
            self.assertEqual(_crear_categoria('rubro', ' Pileta ')['id'], 7)
            self.assertEqual(cur.execute.call_count, 1)
            self.assertEqual(cur.execute.call_args.args[1], ('Pileta',))

    def test_alta_devuelve_id_generado(self):
        for tabla in ['rubro', 'subrubro']:
            with self.subTest(tabla=tabla), patch('app.routers.calculadora.db.cursor') as db:
                cur = db.return_value.__enter__.return_value
                cur.fetchone.side_effect = [None, {'id': 8, 'nombre': 'Pileta'}]
                self.assertEqual(_crear_categoria(tabla, 'Pileta')['id'], 8)
                self.assertIn('OUTPUT INSERTED.id', cur.execute.call_args.args[0])
