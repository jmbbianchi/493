"""
Administracion del acceso. Es la segunda capa, y la maneja el dueño.

Alguien se habilita ANTES de que entre por primera vez, y por eso se
habilita por email: el identificador que da Entra no existe hasta que la
persona entra, y para entrar tiene que estar habilitada. El email es lo
unico que se sabe de antemano.

No se manda ningun mail: mandarlo necesitaria otro servicio, y avisarle a
alguien que ya tiene acceso es un mensaje de WhatsApp. Lo que la app
garantiza es que cuando entre, entre.
"""
import uuid

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from .. import db
from ..acceso import exige_duenio

router = APIRouter(prefix="/api/usuarios", tags=["usuarios"],
                   dependencies=[Depends(exige_duenio)])


# Forma de email y nada mas. EmailStr de pydantic arrastra el paquete
# email-validator, y la regla de la casa es que requirements.txt tenga
# seis lineas. Ademas la validacion que importa no es sintactica: es que
# la persona pueda entrar de verdad con ese email, y eso lo dice Entra.
EMAIL = r"^[^@\s]+@[^@\s]+\.[^@\s]+$"


class UsuarioNuevo(BaseModel):
    email: str = Field(pattern=EMAIL, max_length=320)
    nombre: str = Field(min_length=1, max_length=160)
    rol_global: str = Field(default="cliente", pattern="^(duenio|cliente)$")
    notas: str | None = None


class Cambio(BaseModel):
    estado: str | None = Field(default=None, pattern="^(invitado|activo|suspendido)$")
    rol_global: str | None = Field(default=None, pattern="^(duenio|cliente)$")
    nombre: str | None = None
    notas: str | None = None


class AccesoObra(BaseModel):
    obra_id: str
    rol: str = Field(pattern="^(editor|lectura)$")


@router.get("")
def listar():
    return db.query(
        """SELECT u.id, u.email, u.nombre, u.estado, u.rol_global, u.notas,
                  u.creado_en, u.ultimo_acceso,
                  CASE WHEN u.entra_oid IS NULL OR u.entra_oid = 'local-sin-login'
                       THEN 0 ELSE 1 END AS entro_alguna_vez,
                  (SELECT COUNT(*) FROM dbo.obra_usuario ou WHERE ou.usuario_id = u.id) AS obras
           FROM dbo.usuario u ORDER BY u.creado_en""")


@router.post("", status_code=201)
def invitar(u: UsuarioNuevo):
    """Habilita a alguien por email, antes de que entre por primera vez."""
    ya = db.query("SELECT id FROM dbo.usuario WHERE email = %s", (u.email,))
    if ya:
        raise HTTPException(409, "Ya hay un usuario con ese email.")
    nuevo = str(uuid.uuid4())
    db.execute(
        """INSERT INTO dbo.usuario (id, entra_oid, email, nombre, estado, rol_global, notas)
           VALUES (%s, NULL, %s, %s, 'invitado', %s, %s)""",
        (nuevo, u.email, u.nombre, u.rol_global, u.notas))
    return {"id": nuevo, "estado": "invitado"}


@router.patch("/{usuario_id}")
def editar(usuario_id: str, c: Cambio, yo: dict = Depends(exige_duenio)):
    if usuario_id == yo["id"] and c.estado and c.estado != "activo":
        # Sin esto se puede uno mismo dejarse afuera y no queda nadie que
        # pueda volver a habilitar a nadie.
        raise HTTPException(409, "No podes darte de baja a vos mismo.")
    if usuario_id == yo["id"] and c.rol_global == "cliente":
        otros = db.query(
            """SELECT COUNT(*) AS n FROM dbo.usuario
               WHERE rol_global = 'duenio' AND estado = 'activo' AND id <> %s""",
            (usuario_id,))[0]["n"]
        if not otros:
            raise HTTPException(409, "Sos el unico dueño: dejarias la app sin quien administre.")

    campos = c.model_dump(exclude_unset=True)
    if not campos:
        return {"cambios": 0}
    sets = ", ".join(f"{k} = %s" for k in campos)
    n = db.execute(f"UPDATE dbo.usuario SET {sets} WHERE id = %s",
                   tuple(campos.values()) + (usuario_id,))
    if not n:
        raise HTTPException(404, "No existe ese usuario.")
    return {"cambios": n}


@router.get("/{usuario_id}/obras")
def obras_del_usuario(usuario_id: str):
    return db.query(
        """SELECT o.id, o.nombre, ou.rol
           FROM dbo.obra_usuario ou
           JOIN dbo.obra o ON o.id = ou.obra_id
           WHERE ou.usuario_id = %s ORDER BY o.nombre""", (usuario_id,))


@router.put("/{usuario_id}/obras")
def dar_acceso(usuario_id: str, accesos: list[AccesoObra]):
    """Reemplaza a que obras llega esta persona y con que rol."""
    existe = db.query("SELECT 1 AS x FROM dbo.usuario WHERE id = %s", (usuario_id,))
    if not existe:
        raise HTTPException(404, "No existe ese usuario.")
    with db.cursor() as cur:
        cur.execute("DELETE FROM dbo.obra_usuario WHERE usuario_id = %s", (usuario_id,))
        for a in accesos:
            cur.execute(
                """INSERT INTO dbo.obra_usuario (obra_id, usuario_id, rol)
                   VALUES (%s,%s,%s)""", (a.obra_id, usuario_id, a.rol))
    return {"obras": len(accesos)}
