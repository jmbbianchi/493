"""
Acceso a SQL — escrito para NO impedir el auto-pause.

REGLA CRITICA
-------------
Azure SQL serverless pausa solo cuando se cumplen DOS condiciones a la vez
durante la ventana de auto-pause (15 min):

    sesiones activas == 0   Y   CPU == 0

Un pool de conexiones persistente deja sesiones abiertas y la base NUNCA
pausa. Con el free limit de 100.000 vCore-segundos y min 0.5 vCore, una base
que no pausa se come la cuota entera en ~55 horas y despues queda bloqueada
hasta el mes siguiente.

Es exactamente el mismo error que el poller SSE de Quebracho Blanco, una capa
mas abajo: algo que "no molesta" mantiene el recurso despierto y factura.

Por eso: conexion nueva por operacion, cerrada siempre. Sin pool, sin
SQLAlchemy con QueuePool, sin keep-alive.
"""
import os
from contextlib import contextmanager

import pymssql

_CONN = os.environ["SQL_CONNECTION_STRING"]


def _parse(cs: str) -> dict:
    parts = dict(
        p.split("=", 1) for p in cs.split(";") if "=" in p
    )
    server = parts["Server"].replace("tcp:", "").split(",")[0]
    return {
        "server": server,
        "user": parts["User ID"],
        "password": parts["Password"],
        "database": parts["Database"],
        "login_timeout": 60,   # cold start tras auto-pause: hasta ~60 s
        "timeout": 30,
    }


_CFG = _parse(_CONN)


@contextmanager
def cursor():
    """Conexion efimera. Se abre, se usa, se cierra. Nunca queda colgada."""
    conn = pymssql.connect(**_CFG)
    try:
        cur = conn.cursor(as_dict=True)
        yield cur
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def query(sql: str, params: tuple = ()) -> list[dict]:
    with cursor() as cur:
        cur.execute(sql, params)
        return cur.fetchall()


def execute(sql: str, params: tuple = ()) -> int:
    with cursor() as cur:
        cur.execute(sql, params)
        return cur.rowcount
