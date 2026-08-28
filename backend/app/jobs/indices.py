"""
Sincronizacion de indices oficiales.

Corre como Container Apps Job (cron 0 9 * * * UTC = 06:00 Buenos Aires).
Despierta, trae, guarda, muere. No queda ningun proceso vivo.

QUE CAMBIO Y POR QUE
--------------------
La version anterior traia SIEMPRE los ultimos 30 dias. Consecuencia: la
historia arrancaba el dia que se prendio el job. Para ajustar una cuota de
noviembre contra un presupuesto de mayo hace falta el IPC de mayo, y no
estaba. Sin historia, el motor de indexacion no existe.

Ahora el job se cura solo:
  - Si la serie nunca se bajo entera, trae desde INDICES_PISO hasta hoy,
    paginando. Al terminar marca indice.backfill_ok = 1.
  - Si ya esta completa, trae solo los ultimos 30 dias.
  - Al final reconstruye IPC_NIVEL encadenando IPC_MENSUAL.

El primer arranque baja unos 20.000 valores. Los siguientes, unos 200.

OJO CON LAS CONEXIONES
----------------------
db.execute() abre y cierra una conexion por llamada. Cargar 20.000 valores
de a uno serian 20.000 conexiones y la base no lo aguanta. Por eso todo
pasa por db.execute_many(), que agrupa de a 1.000 en una sola conexion.

Fuentes verificadas el 28-ago-2026:
  BCRA  https://api.bcra.gob.ar/estadisticas/v4.0/monetarias/{id}
        4 dolar minorista - 5 mayorista - 31 UVA - 32 UVI - 40 ICL
        27 inflacion mensual - 28 interanual
        parametros: desde, hasta, limit (10-3000, default 1000), offset
        respuesta: {"metadata": {...}, "results": [{"detalle": [...]}]}
"""
import datetime as dt
import os
import sys
from decimal import Decimal

import httpx

from .. import db

BCRA = "https://api.bcra.gob.ar/estadisticas/v4.0/monetarias"
PAGINA = 3000                       # maximo que acepta el BCRA
PISO = os.environ.get("INDICES_PISO", "2016-01-01")
REFRESCO_DIAS = 30

VARIABLES = {
    4:  "USD_MINORISTA",
    5:  "USD_MAYORISTA",
    31: "UVA",
    32: "UVI",
    40: "ICL",
    27: "IPC_MENSUAL",
    28: "IPC_INTERANUAL",
}

UPSERT = """
MERGE dbo.indice_valor AS t
USING (SELECT %s AS codigo, %s AS fecha, %s AS valor) AS s
   ON t.codigo = s.codigo AND t.fecha = s.fecha
WHEN MATCHED AND t.valor <> s.valor THEN
   UPDATE SET valor = s.valor
WHEN NOT MATCHED THEN
   INSERT (codigo, fecha, valor) VALUES (s.codigo, s.fecha, s.valor);
"""


def _necesita_historia(codigo: str) -> bool:
    fila = db.query(
        "SELECT backfill_ok FROM dbo.indice WHERE codigo = %s", (codigo,))
    return not fila or not fila[0]["backfill_ok"]


def _bajar(http: httpx.Client, var_id: int, desde: str, hasta: str) -> list:
    """Trae el rango completo paginando. El BCRA corta en 3000 por pagina."""
    filas = []
    offset = 0
    while True:
        r = http.get(f"{BCRA}/{var_id}",
                     params={"desde": desde, "hasta": hasta,
                             "limit": PAGINA, "offset": offset})
        r.raise_for_status()
        cuerpo = r.json()
        detalle = cuerpo["results"][0]["detalle"] if cuerpo.get("results") else []
        filas.extend(detalle)
        if len(detalle) < PAGINA:
            break
        offset += PAGINA
        if offset > 200000:                       # freno de mano
            print("[WARN] demasiadas paginas, corto", file=sys.stderr)
            break
    return filas


def _encadenar_ipc() -> int:
    """Construye IPC_NIVEL a partir de las variaciones mensuales.

    El BCRA publica la variacion (2,1 %), no el nivel. Con variaciones
    sueltas no se puede ajustar entre dos meses cualquiera: hay que
    encadenarlas. El ancla vale 100 y es arbitraria, porque el nivel se
    usa siempre como cociente entre dos meses y el ancla se cancela.
    """
    variaciones = db.query(
        """SELECT fecha, valor FROM dbo.indice_valor
           WHERE codigo = 'IPC_MENSUAL' ORDER BY fecha""")
    if not variaciones:
        return 0

    nivel = Decimal("100")
    filas = []
    for v in variaciones:
        nivel = nivel * (Decimal(1) + Decimal(str(v["valor"])) / Decimal(100))
        filas.append(("IPC_NIVEL", v["fecha"], round(nivel, 6)))
    return db.execute_many(UPSERT, filas)


def main() -> int:
    hoy = dt.date.today()
    refresco = (hoy - dt.timedelta(days=REFRESCO_DIAS)).isoformat()
    total = 0

    with httpx.Client(timeout=60, verify=True) as http:
        for var_id, codigo in VARIABLES.items():
            historia = _necesita_historia(codigo)
            desde = PISO if historia else refresco
            etiqueta = "HISTORIA" if historia else "refresco"

            try:
                detalle = _bajar(http, var_id, desde, hoy.isoformat())
            except Exception as e:
                print(f"[WARN] {codigo} ({etiqueta}): {e}", file=sys.stderr)
                continue

            if not detalle:
                print(f"[--] {codigo}: sin datos entre {desde} y {hoy}")
                continue

            db.execute_many(
                UPSERT, [(codigo, f["fecha"], f["valor"]) for f in detalle])
            total += len(detalle)

            if historia:
                # Recien ahora la serie esta completa. Guardo tambien desde
                # cuando existe de verdad: el ICL arranca en 2020 aunque el
                # piso sea 2016, y sin esto el job intentaria el backfill
                # todos los dias para siempre.
                db.execute(
                    """UPDATE dbo.indice
                       SET backfill_ok = 1, desde_real = %s
                       WHERE codigo = %s""",
                    (min(f["fecha"] for f in detalle), codigo))

            print(f"[OK] {codigo} ({etiqueta}): {len(detalle)} valores "
                  f"desde {detalle[0]['fecha']} hasta {detalle[-1]['fecha']}")

    niveles = _encadenar_ipc()
    print(f"[OK] IPC_NIVEL: {niveles} meses encadenados")
    print(f"[FIN] {total + niveles} filas procesadas")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
