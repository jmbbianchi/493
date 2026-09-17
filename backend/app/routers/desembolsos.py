"""Edición atómica de acuerdos y fechas previstas; pagos conservados."""
import hashlib
import json
from datetime import date
from decimal import Decimal
from uuid import UUID, uuid4
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, ConfigDict, Field
from typing import Literal
from .. import db
from ..acceso import exige_acceso

router = APIRouter(prefix="/api/obras/{obra_id}/presupuestos/{presupuesto_id}", dependencies=[Depends(exige_acceso)])

class Fila(BaseModel):
    id: UUID | None = None
    tipo: Literal["anticipo", "cuota"] = "cuota"
    descripcion: str = Field(min_length=1, max_length=200)
    fecha_prevista: date | None = None
    monto_nominal: Decimal = Field(gt=0, max_digits=18, decimal_places=2)
    indexa: bool = False

class Acuerdo(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)
    huella: str
    nombre: str = Field(min_length=1, max_length=200)
    monto_base: Decimal = Field(gt=0, max_digits=18, decimal_places=2)
    elegido: bool
    rubro_id: int | None = Field(default=None, gt=0)
    subrubro_id: int | None = Field(default=None, gt=0)
    base_ipc: Literal["cotizacion", "primera_cuota"] = "primera_cuota"
    tarea_id: UUID | None = None
    nueva_tarea: str | None = Field(default=None, max_length=200)
    inicio_tarea: date | None = None
    fin_tarea: date | None = None
    cuotas: list[Fila] = Field(min_length=1, max_length=240)

def leer(cur, obra_id, presupuesto_id):
    cur.execute("SELECT id FROM dbo.obra WITH (XLOCK,HOLDLOCK) WHERE id=%s", (obra_id,))
    if not cur.fetchone():
        raise HTTPException(404, "No existe la obra.")
    cur.execute("SELECT * FROM dbo.presupuesto WHERE obra_id=%s AND id=%s", (obra_id,presupuesto_id))
    p = cur.fetchone()
    if not p:
        raise HTTPException(404, "No existe el presupuesto.")
    cur.execute("SELECT id,tipo,descripcion,fecha_prevista,monto_nominal,indexa,estado,orden FROM dbo.cuota WHERE presupuesto_id=%s ORDER BY orden", (presupuesto_id,))
    cuotas = cur.fetchall()
    cur.execute("SELECT id,cuota_id,fecha,monto,moneda,anulado FROM dbo.pago WHERE presupuesto_id=%s ORDER BY id", (presupuesto_id,))
    pagos = cur.fetchall()
    cur.execute("SELECT base_ipc,tarea_id FROM dbo.presupuesto_programacion WHERE presupuesto_id=%s", (presupuesto_id,))
    config = cur.fetchone() or {"base_ipc":"cotizacion", "tarea_id":None}
    huella = hashlib.sha256(json.dumps([p,cuotas,pagos,config],default=str,sort_keys=True).encode()).hexdigest()
    return p,cuotas,pagos,config,huella

@router.get("/acuerdo")
def obtener(obra_id: str, presupuesto_id: str):
    with db.cursor() as cur:
        p, cuotas, pagos, config, huella = leer(cur,obra_id,presupuesto_id)
    pagadas = {str(g['cuota_id']) for g in pagos if not g['anulado'] and g['cuota_id']}
    return dict(nombre=p["nombre"],monto_base=p["monto_base"],elegido=bool(p["elegido"]),
                rubro_id=p['rubro_id'],subrubro_id=p['subrubro_id'],moneda=p['moneda'],
                estado=p["estado"],origen=p["origen"],huella=huella,cuotas=[dict(c,con_pagos=str(c['id']) in pagadas) for c in cuotas if c["estado"]!="anulada"], **config)

def validar(datos, anteriores, pagos):
    if sum(c.monto_nominal for c in datos.cuotas) != datos.monto_base:
        raise HTTPException(422,"Los desembolsos deben sumar exactamente el monto pactado.")
    ids = [str(c.id) for c in datos.cuotas if c.id]
    if len(ids)!=len(set(ids)):
        raise HTTPException(422,"Hay cuotas repetidas.")
    existentes = {str(c["id"]):c for c in anteriores}
    if any(i not in existentes or existentes[i]["estado"]=="anulada" for i in ids):
        raise HTTPException(422,"Una cuota no pertenece al plan vigente.")
    pagadas = {str(p["cuota_id"]) for p in pagos if not p["anulado"] and p["cuota_id"]}
    nuevas = {str(c.id):c for c in datos.cuotas if c.id}
    for cid in pagadas:
        vieja, nueva = existentes[cid], nuevas.get(cid)
        if nueva is None or any(str(getattr(nueva,k)) != str(vieja[k]) for k in ["fecha_prevista","tipo"]) or nueva.monto_nominal != Decimal(str(vieja["monto_nominal"])) or nueva.indexa != bool(vieja["indexa"]):
            raise HTTPException(409,"Conservá las condiciones de las cuotas con pagos imputados.")
    if datos.nueva_tarea and (datos.tarea_id or not datos.inicio_tarea or not datos.fin_tarea or datos.fin_tarea<datos.inicio_tarea):
        raise HTTPException(422,"La nueva tarea requiere inicio y fin válidos; no selecciones otra a la vez.")

@router.put("/acuerdo")
def guardar(obra_id: str, presupuesto_id: str, datos: Acuerdo):
    with db.cursor() as cur:
        p, anteriores, pagos, config, huella = leer(cur,obra_id,presupuesto_id)
        from ..cierres import exigir_abierto
        exigir_abierto(p)
        if huella!=datos.huella:
            raise HTTPException(409,"Cambió el presupuesto o recibió un pago. Recargá antes de editar.")
        if p["estado"]=="anulado":
            raise HTTPException(409,"El presupuesto está anulado.")
        validar(datos,anteriores,pagos)
        # Los artículos conservan la cotización original; monto_base registra
        # el total finalmente negociado, respaldado por el plan de desembolsos.
        rubro_id = datos.rubro_id if datos.rubro_id is not None else p['rubro_id']
        subrubro_id = datos.subrubro_id if datos.subrubro_id is not None else p['subrubro_id']
        cur.execute('SELECT id FROM dbo.rubro WHERE id=%s', (rubro_id,))
        if not cur.fetchone():
            raise HTTPException(422, 'No existe el rubro seleccionado.')
        cur.execute('SELECT id FROM dbo.subrubro WHERE id=%s', (subrubro_id,))
        if not cur.fetchone():
            raise HTTPException(422, 'No existe el tipo seleccionado.')
        tarea_id = str(datos.tarea_id) if datos.tarea_id else None
        if tarea_id:
            cur.execute("SELECT id FROM dbo.proyecto_tarea WHERE id=%s AND obra_id=%s AND tipo='tarea'", (tarea_id,obra_id))
            if not cur.fetchone():
                raise HTTPException(422,"La tarea debe pertenecer a esta obra.")
        if datos.nueva_tarea:
            cur.execute("SELECT id FROM dbo.proyecto_rubro WHERE obra_id=%s AND rubro_origen_id=%s",(obra_id,rubro_id))
            rubro = cur.fetchone()
            if rubro:
                rid = str(rubro["id"])
            else:
                cur.execute("SELECT nombre FROM dbo.rubro WHERE id=%s",(rubro_id,))
                nombre = cur.fetchone()["nombre"]
                cur.execute("SELECT id FROM dbo.proyecto_rubro WHERE obra_id=%s AND nombre=%s",(obra_id,nombre))
                rubro = cur.fetchone()
                rid = str(rubro["id"]) if rubro else str(uuid4())
                if not rubro:
                    cur.execute("INSERT dbo.proyecto_rubro (id,obra_id,nombre,rubro_origen_id) VALUES (%s,%s,%s,%s)",(rid,obra_id,nombre,rubro_id))
            tarea_id = str(uuid4())
            cur.execute("INSERT dbo.proyecto_tarea (id,obra_id,rubro_id,nombre,tipo,fecha_inicio,fecha_fin) VALUES (%s,%s,%s,%s,'tarea',%s,%s)",(tarea_id,obra_id,rid,datos.nueva_tarea,datos.inicio_tarea,datos.fin_tarea))
        if tarea_id:
            cur.execute("SELECT tarea_id FROM dbo.proyecto_presupuesto_tarea WHERE obra_id=%s AND presupuesto_id=%s AND tarea_id=%s",(obra_id,presupuesto_id,tarea_id))
            if not cur.fetchone():
                cur.execute("INSERT dbo.proyecto_presupuesto_tarea VALUES (%s,%s,%s)",(obra_id,presupuesto_id,tarea_id))
        cur.execute("UPDATE dbo.presupuesto SET nombre=%s,monto_base=%s,elegido=%s,rubro_id=%s,subrubro_id=%s,estado='confirmado' WHERE id=%s",(datos.nombre,datos.monto_base,True,rubro_id,subrubro_id,presupuesto_id))
        if (rubro_id,subrubro_id)!=(p['rubro_id'],p['subrubro_id']):
            cur.execute('UPDATE dbo.pago SET rubro_id=%s,subrubro_id=%s WHERE obra_id=%s AND presupuesto_id=%s', (rubro_id,subrubro_id,obra_id,presupuesto_id))
        max_orden = max([c["orden"] for c in anteriores] or [0])
        mantener = {str(c.id) for c in datos.cuotas if c.id}
        for c in anteriores:
            if str(c["id"]) not in mantener:
                cur.execute("UPDATE dbo.cuota SET estado='anulada' WHERE id=%s",(str(c["id"]),))
        for c in datos.cuotas:
            if c.id:
                cur.execute("UPDATE dbo.cuota SET descripcion=%s,tipo=%s,fecha_prevista=%s,monto_nominal=%s,indexa=%s WHERE id=%s",(c.descripcion,c.tipo,c.fecha_prevista,c.monto_nominal,c.indexa,str(c.id)))
            else:
                max_orden+=1
                cur.execute("INSERT dbo.cuota (presupuesto_id,orden,tipo,descripcion,fecha_prevista,monto_nominal,indexa,indice_codigo) VALUES (%s,%s,%s,%s,%s,%s,%s,'IPC_NIVEL')",(presupuesto_id,max_orden,c.tipo,c.descripcion,c.fecha_prevista,c.monto_nominal,c.indexa))
        cur.execute("UPDATE dbo.presupuesto_programacion SET base_ipc=%s,tarea_id=%s WHERE presupuesto_id=%s",(datos.base_ipc,tarea_id,presupuesto_id))
        if not cur.rowcount:
            cur.execute("INSERT dbo.presupuesto_programacion (presupuesto_id,base_ipc,tarea_id) VALUES (%s,%s,%s)",(presupuesto_id,datos.base_ipc,tarea_id))
        from .proyecto import _incrementar
        _incrementar(cur,obra_id,0)
    return {"guardado":True}
