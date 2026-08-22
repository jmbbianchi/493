"""
Sincronizacion diaria de indices oficiales.

Corre como Container Apps Job (cron 0 9 * * * UTC = 06:00 Buenos Aires).
Despierta, trae, guarda, muere. No queda ningun proceso vivo.

Fuentes verificadas el 21-ago-2026:
  BCRA  https://api.bcra.gob.ar/estadisticas/v4.0/monetarias/{id}
        4 dolar minorista · 5 mayorista · 31 UVA · 32 UVI · 40 ICL
        27 inflacion mensual · 28 interanual
  INDEC ICC via apis.datos.gob.ar (lento: reintentos y respaldo manual)
"""
import datetime as dt
import sys

import httpx

from ..db import execute

BCRA = "https://api.bcra.gob.ar/estadisticas/v4.0/monetarias"
VARIABLES = {
    4: "USD_MINORISTA",
    5: "USD_MAYORISTA",
    31: "UVA",
    32: "UVI",
    40: "ICL",
    27: "IPC_MENSUAL",
    28: "IPC_INTERANUAL",
}

UPSERT = """
MERGE indice_valor AS t
USING (SELECT %s AS codigo, %s AS fecha, %s AS valor) AS s
   ON t.codigo = s.codigo AND t.fecha = s.fecha
WHEN NOT MATCHED THEN
   INSERT (codigo, fecha, valor) VALUES (s.codigo, s.fecha, s.valor);
"""


def main() -> int:
    desde = (dt.date.today() - dt.timedelta(days=30)).isoformat()
    hasta = dt.date.today().isoformat()
    total = 0

    with httpx.Client(timeout=30, verify=True) as http:
        for var_id, codigo in VARIABLES.items():
            try:
                r = http.get(f"{BCRA}/{var_id}",
                             params={"desde": desde, "hasta": hasta})
                r.raise_for_status()
                detalle = r.json()["results"][0]["detalle"]
            except Exception as e:
                print(f"[WARN] {codigo}: {e}", file=sys.stderr)
                continue

            for fila in detalle:
                execute(UPSERT, (codigo, fila["fecha"], fila["valor"]))
                total += 1
            print(f"[OK] {codigo}: {len(detalle)} valores")

    print(f"[FIN] {total} filas procesadas")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
