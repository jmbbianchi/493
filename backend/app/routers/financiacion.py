from datetime import date
from decimal import Decimal
from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field
from ..acceso import exige_acceso
from ..financiacion import proyectar
from .. import db

router = APIRouter(prefix='/api/obras/{obra_id}/financiacion', tags=['financiacion'], dependencies=[Depends(exige_acceso)])
class Proyeccion(BaseModel):
    capital: float = Field(gt=0); tasa_anual: float = Field(ge=0); meses: int = Field(gt=0, le=480)
    inicio: date; ajuste_mensual: float = Field(default=0, ge=0, le=100); adelanto_meses: int = Field(default=0, ge=0, le=480)
@router.post('/proyeccion')
def calcular(obra_id: str, p: Proyeccion):
    return proyectar(str(p.capital), str(p.tasa_anual), p.meses, p.inicio, Decimal(str(p.ajuste_mensual)), p.adelanto_meses)

@router.get('')
def obtener(obra_id: str):
    filas = db.query('SELECT obra_id, capital, tasa_anual, meses, inicio, ajuste_mensual, adelanto_meses, actualizado_en FROM dbo.financiacion WHERE obra_id = %s', (obra_id,))
    return filas[0] if filas else None

@router.put('')
def guardar(obra_id: str, p: Proyeccion):
    existe = db.query('SELECT 1 AS x FROM dbo.financiacion WHERE obra_id = %s', (obra_id,))
    valores = (p.capital, p.tasa_anual, p.meses, p.inicio, p.ajuste_mensual, p.adelanto_meses, obra_id)
    if existe:
        db.execute('''UPDATE dbo.financiacion SET capital=%s, tasa_anual=%s, meses=%s, inicio=%s,
                      ajuste_mensual=%s, adelanto_meses=%s, actualizado_en=SYSUTCDATETIME()
                      WHERE obra_id=%s''', valores)
    else:
        db.execute('''INSERT INTO dbo.financiacion (capital,tasa_anual,meses,inicio,ajuste_mensual,adelanto_meses,obra_id)
                      VALUES (%s,%s,%s,%s,%s,%s,%s)''', valores)
    return {'guardado': True}
