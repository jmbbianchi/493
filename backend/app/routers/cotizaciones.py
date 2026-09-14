"""Series completas del período de consulta, sin truncar a 120 registros."""
from datetime import date
from fastapi import APIRouter, HTTPException
from .. import db

router = APIRouter(prefix='/api/indices')
SERIES = [
    ('USD_OFICIAL_VENTA','Dólar oficial · Venta','ARS','ArgentinaDatos / DolarAPI'),
    ('USD_OFICIAL_COMPRA','Dólar oficial · Compra','ARS','ArgentinaDatos / DolarAPI'),
    ('USD_MINORISTA','Dólar minorista · Promedio vendedor BCRA','ARS','BCRA'),
    ('UVA','UVA','ARS','BCRA'),
    ('IPC_MENSUAL','IPC · Cierre mensual','%','BCRA / INDEC'),
    ('IPC_INTERANUAL','IPC · Interanual','%','BCRA / INDEC'),
    ('IPC_NIVEL','IPC · Nivel encadenado','índice','Calculado desde IPC mensual'),
]

@router.get('/series')
def series(desde: date, hasta: date):
    if desde > hasta:
        raise HTTPException(422,'Desde debe ser anterior o igual a Hasta.')
    if (hasta-desde).days > 36525:
        raise HTTPException(422,'Elegí un período de hasta 100 años.')
    filas = db.query('''SELECT codigo,fecha,valor FROM dbo.indice_valor
        WHERE fecha>=%s AND fecha<=%s ORDER BY fecha''', (min(desde,date(hasta.year,1,1)),hasta))
    return {'series':[{'codigo':c,'nombre':n,'unidad':u,'fuente':f,
        'valores':[{'fecha':v['fecha'],'valor':v['valor']} for v in filas if v['codigo']==c and v['fecha']>=desde]}
        for c,n,u,f in SERIES],
        'ipc_anio':[{'fecha':v['fecha'],'valor':v['valor']} for v in filas
            if v['codigo']=='IPC_MENSUAL' and v['fecha'].year==hasta.year]}
