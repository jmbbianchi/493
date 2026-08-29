"""
Firmas SAS para Blob Storage, con la biblioteca estandar.

POR QUE A MANO Y NO CON azure-storage-blob
------------------------------------------
Regla de la casa: la imagen es magra y requirements.txt tiene seis lineas.
El paquete oficial arrastra azure-core, isodate, typing-extensions,
cryptography y unas cuantas mas, y de todo eso aca se usaria una funcion.
Firmar un Service SAS son treinta lineas de hmac y base64.

QUE ES UN SAS Y POR QUE NO HAY OTRA FORMA
-----------------------------------------
El container tiene allow-blob-public-access en false, asi que un blob no
se puede leer ni escribir sin credencial. La clave de la cuenta no puede
salir del backend -- quien la tenga puede borrar todo -- asi que lo que se
le da al navegador es una firma acotada: este blob, esta operacion, estos
minutos. Vencida, no sirve para nada.

El archivo viaja del telefono a Blob Storage DIRECTO, sin pasar por el
Container App. Una foto de 4 MB atravesando un contenedor de 1 GiB que
tiene que poder dormirse es trabajo y memoria que no hacen falta.
"""
import base64
import hashlib
import hmac
import os
import urllib.parse
import uuid
from datetime import datetime, timedelta, timezone

CUENTA = os.environ.get("STORAGE_ACCOUNT", "")
CLAVE = os.environ.get("STORAGE_KEY", "")
CONTAINER = os.environ.get("STORAGE_CONTAINER", "documentos")

# Version del contrato de SAS. El orden de los campos de la cadena a
# firmar depende de esta version: cambiarla sin reordenar los campos da
# firmas invalidas con un error que no dice por que.
VERSION = "2020-12-06"

# Vida corta a proposito. Alcanza para subir una foto por datos moviles y
# no para que la URL sirva de nada si queda en el historial del navegador.
MINUTOS_ESCRITURA = 15
MINUTOS_LECTURA = 30


def hay_almacen() -> bool:
    return bool(CUENTA and CLAVE)


def _firmar(permisos: str, blob: str, minutos: int, content_type: str | None = None) -> str:
    """Devuelve el query string del SAS, sin el '?'."""
    ahora = datetime.now(timezone.utc)
    # Cinco minutos para atras: los relojes del telefono y de Azure no
    # estan sincronizados y un SAS que arranca "ahora" a veces todavia no
    # es valido cuando llega.
    inicio = (ahora - timedelta(minutes=5)).strftime("%Y-%m-%dT%H:%M:%SZ")
    fin = (ahora + timedelta(minutes=minutos)).strftime("%Y-%m-%dT%H:%M:%SZ")
    recurso = f"/blob/{CUENTA}/{CONTAINER}/{blob}"

    # El orden es el del contrato de la version declarada arriba. Cada
    # campo que no se usa va igual, vacio: son posiciones, no opciones.
    partes = [
        permisos,          # sp
        inicio,            # st
        fin,               # se
        recurso,           # canonicalized resource
        "",                # si  - identificador de politica almacenada
        "",                # sip - rango de IP
        "https",           # spr
        VERSION,           # sv
        "b",               # sr  - el recurso es un blob
        "",                # snapshot
        "",                # ses - encryption scope
        "",                # rscc - Cache-Control
        "",                # rscd - Content-Disposition
        "",                # rsce - Content-Encoding
        "",                # rscl - Content-Language
        content_type or "",  # rsct - Content-Type
    ]
    cadena = "\n".join(partes)
    firma = base64.b64encode(
        hmac.new(base64.b64decode(CLAVE), cadena.encode("utf-8"), hashlib.sha256).digest()
    ).decode()

    q = {
        "sv": VERSION, "sr": "b", "sp": permisos,
        "st": inicio, "se": fin, "spr": "https", "sig": firma,
    }
    if content_type:
        q["rsct"] = content_type
    return urllib.parse.urlencode(q)


def url_escritura(blob: str, content_type: str | None = None) -> str:
    """URL para que el navegador haga PUT del archivo, y nada mas."""
    return (f"https://{CUENTA}.blob.core.windows.net/{CONTAINER}/{blob}"
            f"?{_firmar('cw', blob, MINUTOS_ESCRITURA, content_type)}")


def url_lectura(blob: str) -> str:
    return (f"https://{CUENTA}.blob.core.windows.net/{CONTAINER}/{blob}"
            f"?{_firmar('r', blob, MINUTOS_LECTURA)}")


def ruta_nueva(obra_id: str, nombre: str) -> str:
    """Ruta del blob, armada aca y nunca con lo que manda el cliente.

    Un nombre de archivo que viene del navegador puede traer '../' y
    escribir donde no debe. Lo unico que se conserva es la extension, y
    solo si es corta y alfanumerica.
    """
    ext = ""
    if "." in nombre:
        cruda = nombre.rsplit(".", 1)[1].lower()
        if cruda.isalnum() and len(cruda) <= 5:
            ext = "." + cruda
    return f"{obra_id}/{uuid.uuid4().hex}{ext}"
