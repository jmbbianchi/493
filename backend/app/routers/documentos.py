"""
Documentos: comprobantes de pago, presupuestos en papel, remitos, fotos.

EL RECORRIDO DE UNA FOTO
------------------------
  1. El telefono pide permiso:   POST /documentos/subida
     El backend crea la fila, arma la ruta del blob y devuelve un SAS de
     escritura que vale quince minutos y sirve para ese blob y nada mas.

  2. El telefono sube el archivo DIRECTO a Blob Storage con un PUT.
     No pasa por el Container App: una foto de 4 MB atravesando un
     contenedor que tiene que poder dormirse es trabajo que no hace falta.

  3. El telefono avisa:          POST /documentos/{id}/confirmar
     Recien ahi la fila queda marcada como subida y el documento aparece.

Los tres pasos existen porque el del medio puede fallar. Si el telefono se
queda sin señal a mitad de la subida queda una fila sin archivo, y esa fila
NO se muestra: el bit `subido` distingue lo que llego entero de lo que no.
"""
import uuid

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from .. import almacen, db
from ..acceso import exige_acceso

router = APIRouter(prefix="/api/obras/{obra_id}", tags=["documentos"],
                   dependencies=[Depends(exige_acceso)])

# Una foto de telefono moderna anda por los 3-5 MB. Veinte deja lugar para
# un PDF escaneado de varias hojas sin abrir la puerta a subir un video.
MAX_BYTES = 20 * 1024 * 1024


class Pedido(BaseModel):
    tipo: str = Field(pattern="^(foto|presupuesto|factura|remito|plano|otro)$")
    nombre: str = Field(min_length=1, max_length=260)
    mime: str | None = None
    bytes: int | None = Field(default=None, gt=0)
    rubro_id: int | None = None
    presupuesto_id: str | None = None
    pago_id: str | None = None


@router.post("/documentos/subida", status_code=201)
def pedir_subida(obra_id: str, p: Pedido):
    """Crea la fila y devuelve el permiso de escritura acotado."""
    if not almacen.hay_almacen():
        raise HTTPException(503, "El almacenamiento no esta configurado en el backend.")
    if p.bytes and p.bytes > MAX_BYTES:
        raise HTTPException(
            413, f"El archivo pesa mas de {MAX_BYTES // (1024 * 1024)} MB.")

    ruta = almacen.ruta_nueva(obra_id, p.nombre)
    nuevo = str(uuid.uuid4())
    db.execute(
        """INSERT INTO dbo.documento
             (id, obra_id, rubro_id, presupuesto_id, pago_id, tipo, nombre,
              blob_path, mime, bytes)
           VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)""",
        (nuevo, obra_id, p.rubro_id, p.presupuesto_id, p.pago_id, p.tipo,
         p.nombre, ruta, p.mime, p.bytes))
    return {"id": nuevo, "url": almacen.url_escritura(ruta, p.mime), "blob_path": ruta}


@router.post("/documentos/{documento_id}/confirmar")
def confirmar(obra_id: str, documento_id: str):
    n = db.execute(
        "UPDATE dbo.documento SET subido = 1 WHERE id = %s AND obra_id = %s",
        (documento_id, obra_id))
    if not n:
        raise HTTPException(404, "No existe ese documento en esta obra.")
    return {"subido": True}


@router.get("/documentos")
def listar(obra_id: str, pago_id: str | None = None,
           presupuesto_id: str | None = None, rubro_id: int | None = None):
    """Los documentos que llegaron enteros, con una URL de lectura corta.

    La URL se firma en cada listado y no se guarda: si se guardara, seria
    un link permanente a un container que justamente no es publico.
    """
    sql = """
        SELECT id, tipo, nombre, blob_path, mime, bytes, creado_en,
               rubro_id, presupuesto_id, pago_id
        FROM dbo.documento
        WHERE obra_id = %s AND subido = 1
    """
    params: tuple = (obra_id,)
    if pago_id is not None:
        sql += " AND pago_id = %s"
        params += (pago_id,)
    if presupuesto_id is not None:
        sql += " AND presupuesto_id = %s"
        params += (presupuesto_id,)
    if rubro_id is not None:
        sql += " AND rubro_id = %s"
        params += (rubro_id,)
    sql += " ORDER BY creado_en DESC"

    filas = db.query(sql, params)
    return [{**f, "id": str(f["id"]),
             "presupuesto_id": (str(f["presupuesto_id"]) if f["presupuesto_id"] else None),
             "pago_id": (str(f["pago_id"]) if f["pago_id"] else None),
             "url": almacen.url_lectura(f["blob_path"])}
            for f in filas]


@router.delete("/documentos/{documento_id}")
def borrar(obra_id: str, documento_id: str):
    """Saca el documento de la vista.

    El blob queda: borrarlo exige otra llamada firmada a Storage y, si esa
    falla despues de haber borrado la fila, el archivo queda huerfano y sin
    nadie que sepa que existe. Una regla de lifecycle en la cuenta es el
    lugar donde eso se limpia, no el camino de una request.
    """
    n = db.execute("DELETE FROM dbo.documento WHERE id = %s AND obra_id = %s",
                   (documento_id, obra_id))
    if not n:
        raise HTTPException(404, "No existe ese documento en esta obra.")
    return {"ok": True}
