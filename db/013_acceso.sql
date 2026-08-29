/* ============================================================
   obra493 - migracion 013
   Acceso: quien es cada uno, y quien lo dejo entrar.

   DOS CAPAS, Y POR QUE ESTAN SEPARADAS
   ------------------------------------
   Entra contesta "quien sos": valida la contraseña, el Google, el segundo
   factor. Esta base contesta "podes entrar": si alguien esta habilitado y
   a que obras llega.

   Son preguntas distintas y por eso viven en lugares distintos. Alguien
   puede autenticarse perfecto contra Entra y NO entrar, porque se dio de
   baja, porque nunca fue habilitado, o -- el dia que la app se cobre --
   porque no pago. Si la autenticacion decidiera tambien el acceso, dar de
   baja a un cliente significaria borrarlo del directorio de identidad, que
   es exactamente lo que no hay que hacer: su historial de obras tiene que
   quedar.

   POR QUE EL EMAIL Y NO EL OID
   ----------------------------
   entra_oid lo asigna Entra la primera vez que la persona entra, asi que
   antes de que entre no se sabe. El email si se sabe: es lo que le vas a
   pedir para habilitarla. Entonces la fila se crea con el email, y el oid
   se engancha solo en el primer login. Sin esto, habilitar a alguien
   exigiria que primero entre -- y para entrar tiene que estar habilitado.

   Idempotente.
   ============================================================ */

SET NOCOUNT ON;
SET XACT_ABORT ON;
GO

/* === 1. EL USUARIO GANA ESTADO Y ROL ======================= */

/* entra_oid pasa a ser nullable: la fila existe desde que la habilitas,
   y el oid recien aparece cuando la persona entra por primera vez. */
IF EXISTS (SELECT 1 FROM sys.columns
           WHERE object_id = OBJECT_ID('dbo.usuario')
             AND name = 'entra_oid' AND is_nullable = 0)
BEGIN
    -- El UNIQUE original no deja varios NULL, asi que se reemplaza por un
    -- indice unico filtrado que ignora las filas sin oid todavia.
    DECLARE @ix sysname = (
        SELECT TOP 1 i.name FROM sys.indexes i
        JOIN sys.index_columns ic ON ic.object_id = i.object_id AND ic.index_id = i.index_id
        JOIN sys.columns c ON c.object_id = i.object_id AND c.column_id = ic.column_id
        WHERE i.object_id = OBJECT_ID('dbo.usuario') AND c.name = 'entra_oid'
          AND i.is_unique = 1);
    IF @ix IS NOT NULL
        EXEC('ALTER TABLE dbo.usuario DROP CONSTRAINT ' + @ix);
    ALTER TABLE dbo.usuario ALTER COLUMN entra_oid nvarchar(64) NULL;
END
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name='ux_usuario_oid')
  CREATE UNIQUE INDEX ux_usuario_oid ON dbo.usuario(entra_oid) WHERE entra_oid IS NOT NULL;
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name='ux_usuario_email')
  CREATE UNIQUE INDEX ux_usuario_email ON dbo.usuario(email);
GO

/* invitado: habilitado pero todavia no entro nunca.
   activo:   entra y trabaja.
   suspendido: se autentica bien contra Entra y la app le dice que no.
               Es el estado que el dia de mañana usa el cobro. */
IF COL_LENGTH('dbo.usuario', 'estado') IS NULL
    ALTER TABLE dbo.usuario ADD estado varchar(12) NOT NULL
        CONSTRAINT DF_usuario_estado DEFAULT 'invitado';
GO

IF NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = 'ck_usuario_estado')
    ALTER TABLE dbo.usuario ADD CONSTRAINT ck_usuario_estado
        CHECK (estado IN ('invitado','activo','suspendido'));
GO

/* duenio administra el acceso de todos; cliente solo ve sus obras. */
IF COL_LENGTH('dbo.usuario', 'rol_global') IS NULL
    ALTER TABLE dbo.usuario ADD rol_global varchar(12) NOT NULL
        CONSTRAINT DF_usuario_rol DEFAULT 'cliente';
GO

IF NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = 'ck_usuario_rol_global')
    ALTER TABLE dbo.usuario ADD CONSTRAINT ck_usuario_rol_global
        CHECK (rol_global IN ('duenio','cliente'));
GO

IF COL_LENGTH('dbo.usuario', 'ultimo_acceso') IS NULL
    ALTER TABLE dbo.usuario ADD ultimo_acceso datetime2 NULL;
GO

IF COL_LENGTH('dbo.usuario', 'notas') IS NULL
    ALTER TABLE dbo.usuario ADD notas nvarchar(500) NULL;
GO

/* === 2. EL USUARIO LOCAL SE CONVIERTE EN EL DUEÑO ==========
   Hasta hoy todas las obras colgaban de un usuario ficticio con
   entra_oid = 'local-sin-login'. Ese usuario pasa a ser el dueño y
   conserva sus obras; cuando entres por Entra, tu oid se engancha ahi y
   no hay que migrar nada.                                              */
UPDATE dbo.usuario
   SET estado = 'activo', rol_global = 'duenio'
 WHERE entra_oid = 'local-sin-login';
GO

/* Que el dueño este en obra_usuario de todas sus obras: el filtro de
   acceso mira esa tabla, y sin fila no veria ni las propias. */
INSERT INTO dbo.obra_usuario (obra_id, usuario_id, rol)
SELECT o.id, o.owner_id, 'editor'
FROM dbo.obra o
WHERE NOT EXISTS (SELECT 1 FROM dbo.obra_usuario ou
                   WHERE ou.obra_id = o.id AND ou.usuario_id = o.owner_id);
GO

/* === 3. QUIEN VE QUE OBRA ==================================
   obra_usuario ya existia desde la 002 y nunca se habia usado. Esta
   vista es el filtro que van a mirar todos los endpoints.            */
CREATE OR ALTER VIEW dbo.v_acceso_obra AS
SELECT ou.obra_id,
       ou.usuario_id,
       ou.rol,
       u.email,
       u.estado,
       u.rol_global,
       -- El dueño entra a todo con rol de editor aunque no tenga fila.
       CASE WHEN u.rol_global = 'duenio' THEN 'editor' ELSE ou.rol END AS rol_efectivo
FROM dbo.obra_usuario ou
JOIN dbo.usuario u ON u.id = ou.usuario_id
WHERE u.estado = 'activo';
GO

/* -- Controles -------------------------------------------------------
SELECT email, nombre, estado, rol_global, entra_oid, ultimo_acceso FROM dbo.usuario;
SELECT * FROM dbo.v_acceso_obra;
   ------------------------------------------------------------------- */
