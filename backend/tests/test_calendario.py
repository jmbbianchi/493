import os
import unittest
from unittest.mock import patch
from uuid import UUID
from fastapi import HTTPException
os.environ.setdefault('SQL_CONNECTION_STRING','Server=localhost;User ID=test;Password=test;Database=test')
from app.routers.calendario import Programacion, programar

CID=UUID('00000000-0000-0000-0000-000000000001')
class CalendarioTests(unittest.TestCase):
    def test_nueva_fecha_solo_modifica_tesoreria(self):
        with patch('app.routers.calendario.db.cursor') as db:
            cur=db.return_value.__enter__.return_value
            cur.fetchone.side_effect=[{'id':'obra'},{'id':CID},None]
            result=programar('obra',CID,Programacion(fecha='2026-10-01',version=0))
            self.assertEqual(result['version'],1)
            self.assertIn('INSERT dbo.cuota_calendario',cur.execute.call_args.args[0])
            self.assertEqual(cur.execute.call_args.args[1][0],str(CID))
            self.assertFalse(any('UPDATE dbo.cuota SET' in c.args[0] or 'UPDATE dbo.pago' in c.args[0] for c in cur.execute.call_args_list))

    def test_conflicto_no_sobrescribe_fecha(self):
        with patch('app.routers.calendario.db.cursor') as db:
            cur=db.return_value.__enter__.return_value
            cur.fetchone.side_effect=[{'id':'obra'},{'id':CID},{'version':2}]
            with self.assertRaises(HTTPException) as e: programar('obra',CID,Programacion(fecha=None,version=1))
            self.assertEqual(e.exception.status_code,409)
            self.assertEqual(cur.execute.call_count,3)

    def test_no_permite_cuota_ajena(self):
        with patch('app.routers.calendario.db.cursor') as db:
            cur=db.return_value.__enter__.return_value
            cur.fetchone.side_effect=[{'id':'obra'},None]
            with self.assertRaises(HTTPException) as e: programar('obra',CID,Programacion(fecha=None,version=0))
            self.assertEqual(e.exception.status_code,404)
            self.assertEqual(cur.execute.call_count,2)
            self.assertEqual(cur.execute.call_args.args[1],(str(CID),'obra'))

    def test_fecha_vacia_persistida_como_null(self):
        with patch('app.routers.calendario.db.cursor') as db:
            cur=db.return_value.__enter__.return_value
            cur.fetchone.side_effect=[{'id':'obra'},{'id':CID},{'version':1}]
            result=programar('obra',CID,Programacion(fecha=None,version=1))
            self.assertEqual(result['version'],2)
            self.assertEqual(cur.execute.call_args.args[1],(None,str(CID)))
