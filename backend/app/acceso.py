"""
Quien entra, a que obra, y con que permiso.

LAS DOS CAPAS
-------------
Autenticacion (quien sos) y autorizacion (podes entrar) son preguntas
distintas y viven separadas a proposito.

  - La identidad la va a dar Entra: valida la contraseña, el Google, el
    segundo factor. Este archivo NO valida contraseñas.
  - El acceso lo da esta base: alguien puede autenticarse perfecto y no
    entrar, porque nunca fue habilitado, porque se dio de baja, o -- el dia
    que la app se cobre -- porque no pago.

Dar de baja a un cliente tiene que ser un UPDATE de una fila, no borrarlo
del directorio de identidad: su historial de obras tiene que quedar.

MIENTRAS ENTRA NO ESTE
----------------------
Si no hay tenant configurado, la puerta sigue siendo la clave compartida y
quien entra es el dueño. Es el mismo candado de siempre, pero ya pasando
por el mismo camino que va a usar Entra: el dia que se enchufe, lo unico
que cambia es de donde sale la identidad, no quien decide el acceso.
"""
import os

from fastapi import Depends, HTTPException, Request

from . import db
from .seguridad import requiere_clave

# Mientras esto este vacio, la app corre en modo clave compartida.
ENTRA_TENANT = os.environ.get("ENTRA_TENANT_ID", "")

_OID_LOCAL = "local-sin-login"


def usuario_actual(request: Request, _clave=Depends(requiere_clave)) -> dict:
    """El usuario que esta haciendo la request.

    Hoy sale de la clave compartida y es siempre el dueño. Cuando entre
    Entra, sale del token: se busca por entra_oid y, si es la primera vez,
    por email -- que es el dato con el que el dueño lo habilito antes de
    que existiera el oid.
    """
    filas = db.query(
        """SELECT id, email, nombre, estado, rol_global
           FROM dbo.usuario WHERE entra_oid = %s""", (_OID_LOCAL,))
    if not filas:
        raise HTTPException(503, "No hay ningun usuario configurado en la base.")

    u = filas[0]
    if u["estado"] != "activo":
        # 403 y no 401: quien sos se sabe, lo que no tenes es permiso. Un
        # 401 haria que el navegador vuelva a pedir credenciales, que no
        # arreglan nada.
        raise HTTPException(403, "Tu cuenta no esta habilitada. Pedile acceso al dueño de la obra.")
    return {**u, "id": str(u["id"])}


def exige_acceso(request: Request, obra_id: str, usuario: dict = Depends(usuario_actual)) -> dict:
    """Que este usuario pueda tocar ESTA obra, y con este verbo.

    El metodo decide el permiso que hace falta: un GET necesita acceso, y
    cualquier otra cosa necesita ser editor. Mirarlo aca y no endpoint por
    endpoint es lo que hace que no se olvide en ninguno -- y olvidarse en
    uno solo alcanza para que alguien con rol lectura escriba.
    """
    filas = db.query(
        """SELECT rol_efectivo FROM dbo.v_acceso_obra
           WHERE obra_id = %s AND usuario_id = %s""",
        (obra_id, usuario["id"]))

    if not filas:
        # 404 y no 403: si contestara "no tenes permiso" estaria contando
        # que esa obra existe, que es informacion de otro.
        raise HTTPException(404, "No existe esa obra, o no tenes acceso.")

    rol = filas[0]["rol_efectivo"]
    if request.method != "GET" and rol != "editor":
        raise HTTPException(403, "Tenes acceso de lectura: no podes modificar esta obra.")
    return {**usuario, "rol": rol}


def exige_duenio(usuario: dict = Depends(usuario_actual)) -> dict:
    """Solo el dueño administra quien entra."""
    if usuario["rol_global"] != "duenio":
        raise HTTPException(403, "Solo el dueño puede administrar el acceso.")
    return usuario
