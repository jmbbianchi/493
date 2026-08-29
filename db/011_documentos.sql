/* ============================================================
   obra493 - migracion 011
   Documentos e imagenes: comprobantes, presupuestos en papel, remitos.

   POR QUE HACE FALTA
   ------------------
   Un pago sin comprobante es la palabra de alguien contra la de otro tres
   meses despues. La foto del recibo sacada parado en la obra, en el mismo
   momento en que se carga el pago, es lo que convierte el registro en
   prueba.

   DONDE VIVEN LOS BYTES
   ---------------------
   En Blob Storage, no en la base. Azure SQL serverless cobra por
   almacenamiento caro y ademas cada MB adentro de una fila es un MB que
   viaja en cada consulta. Aca queda solo el puntero.

   El container `documentos` tiene allow-blob-public-access en false y asi
   se queda: nada de URLs publicas. Se sube con un SAS de escritura de
   vida corta y se lee con uno de lectura, los dos firmados por el backend.

   POR QUE subido ES UN BIT Y NO SE ASUME
   --------------------------------------
   La fila se crea ANTES de que el archivo exista, porque hay que firmar el
   SAS contra una ruta concreta. Si el telefono se queda sin señal a mitad
   de la subida, la fila queda pero el blob no. El bit dice cual de las dos
   cosas paso, y la pantalla muestra solo lo que llego entero.

   Idempotente.
   ============================================================ */

SET NOCOUNT ON;
SET XACT_ABORT ON;
GO

IF OBJECT_ID('dbo.documento','U') IS NULL
CREATE TABLE dbo.documento (
  id             uniqueidentifier NOT NULL DEFAULT newid() PRIMARY KEY,
  obra_id        uniqueidentifier NOT NULL REFERENCES dbo.obra(id) ON DELETE CASCADE,
  -- De que cuelga. Todos nullables: una foto del avance de obra no cuelga
  -- de nada mas que de la obra, y tiene que poder entrar igual.
  rubro_id       int NULL REFERENCES dbo.rubro(id),
  presupuesto_id uniqueidentifier NULL REFERENCES dbo.presupuesto(id),
  pago_id        uniqueidentifier NULL REFERENCES dbo.pago(id),
  tipo           varchar(16) NOT NULL,
  nombre         nvarchar(260) NOT NULL,
  -- Ruta dentro del container. Se arma en el backend y nunca la manda el
  -- cliente: un nombre de archivo que viene del navegador con ../ adentro
  -- escribiria donde no debe.
  blob_path      nvarchar(400) NOT NULL,
  mime           varchar(120) NULL,
  bytes          bigint NULL,
  subido         bit NOT NULL CONSTRAINT DF_documento_subido DEFAULT 0,
  creado_en      datetime2 NOT NULL DEFAULT sysutcdatetime(),
  CONSTRAINT ck_documento_tipo CHECK
    (tipo IN ('foto','presupuesto','factura','remito','plano','otro'))
);
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name='ix_documento_obra')
  CREATE INDEX ix_documento_obra ON dbo.documento(obra_id, creado_en);
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name='ix_documento_pago')
  CREATE INDEX ix_documento_pago ON dbo.documento(pago_id) WHERE pago_id IS NOT NULL;
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name='ix_documento_presupuesto')
  CREATE INDEX ix_documento_presupuesto ON dbo.documento(presupuesto_id)
    WHERE presupuesto_id IS NOT NULL;
GO

/* Cuantos adjuntos tiene cada pago, para no pedirlos uno por uno. */
CREATE OR ALTER VIEW dbo.v_documentos_pago AS
SELECT pago_id, COUNT(*) AS documentos
FROM dbo.documento
WHERE pago_id IS NOT NULL AND subido = 1
GROUP BY pago_id;
GO

/* -- Controles -------------------------------------------------------
SELECT tipo, subido, COUNT(*) FROM dbo.documento GROUP BY tipo, subido;

-- Filas huerfanas: se creo la fila y el archivo nunca llego.
SELECT COUNT(*) AS sin_subir FROM dbo.documento WHERE subido = 0;
   ------------------------------------------------------------------- */
