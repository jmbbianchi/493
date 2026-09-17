"""Fechas de tesorería independientes del acuerdo y de los pagos realizados."""
from datetime import date
from uuid import UUID
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from .. import db
from ..acceso import exige_acceso

router = APIRouter(prefix='/api/obras/{obra_id}/calendario', dependencies=[Depends(exige_acceso)])

class Programacion(BaseModel):
    fecha: date | None
    version: int = Field(ge=0)

@router.get('')
def listar(obra_id: str):
    return db.query('''SELECT CONVERT(varchar(36), c.cuota_id) AS cuota_id, c.fecha, c.version
        FROM dbo.cuota_calendario c JOIN dbo.cuota q ON q.id=c.cuota_id
        JOIN dbo.presupuesto p ON p.id=q.presupuesto_id WHERE p.obra_id=%s''', (obra_id,))

@router.put('/{cuota_id}')
def programar(obra_id: str, cuota_id: UUID, datos: Programacion):
    with db.cursor() as cur:
        # El mismo bloqueo de obra que usa el editor de acuerdos.
        cur.execute('SELECT id FROM dbo.obra WITH (XLOCK,HOLDLOCK) WHERE id=%s', (obra_id,))
        if not cur.fetchone():
            raise HTTPException(404, 'No existe la obra.')
        cur.execute('''SELECT q.id FROM dbo.cuota q JOIN dbo.presupuesto p ON p.id=q.presupuesto_id
            WHERE q.id=%s AND p.obra_id=%s AND q.estado<>'anulada'
            AND p.estado='confirmado' ''', (str(cuota_id), obra_id))
        if not cur.fetchone():
            raise HTTPException(404, 'La cuota no pertenece a un presupuesto confirmado de esta obra.')
        cur.execute('SELECT version FROM dbo.cuota_calendario WHERE cuota_id=%s', (str(cuota_id),))
        anterior = cur.fetchone()
        version = anterior['version'] if anterior else 0
        if version != datos.version:
            raise HTTPException(409, 'La programación cambió. Recargá el calendario antes de guardar.')
        if anterior:
            cur.execute('UPDATE dbo.cuota_calendario SET fecha=%s,version=version+1 WHERE cuota_id=%s', (datos.fecha, str(cuota_id)))
        else:
            cur.execute('INSERT dbo.cuota_calendario (cuota_id,fecha,version) VALUES (%s,%s,1)', (str(cuota_id), datos.fecha))
    return {'cuota_id': str(cuota_id), 'fecha': datos.fecha, 'version': version+1}
