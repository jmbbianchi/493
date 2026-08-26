/* ============================================================
   obra493 - migracion 004
   Precios por obra, y la calculadora editable.

   Decision del 25-ago-2026, corrigiendo el modelo anterior:
   la biblioteca NO es un catalogo cerrado, es un punto de partida.
   En cada obra se editan rendimientos, marcas, presentaciones y
   precios todo el tiempo, se agregan productos y se sacan otros.
   Eso es el uso normal, no la excepcion.

   Como queda:
     - material.obra_id / tarea_tipo.obra_id NULL  -> biblioteca
       con valor -> propio de esa obra
     - obra_material / obra_tarea: guardan SOLO el campo que se
       toco. Lo no tocado sigue a la biblioteca, asi una mejora
       de la biblioteca llega a las obras en curso. Lo tocado es
       del usuario y no se mueve nunca.
     - oculto: saca un item de la obra sin borrarlo de la biblioteca.
     - precio: SIEMPRE de la obra, nunca de la biblioteca. No se
       actualiza: cada cambio es una fila nueva con su fecha. El
       historial sale gratis y permite revalorizar a cualquier fecha.
   ============================================================ */

SET NOCOUNT ON;
SET XACT_ABORT ON;

/* --- marca y pertenencia a obra --- */
IF COL_LENGTH('dbo.material','marca') IS NULL
  ALTER TABLE dbo.material ADD marca nvarchar(80) NULL;
GO
IF COL_LENGTH('dbo.material','obra_id') IS NULL
  ALTER TABLE dbo.material ADD obra_id uniqueidentifier NULL REFERENCES dbo.obra(id);
GO
IF COL_LENGTH('dbo.tarea_tipo','obra_id') IS NULL
  ALTER TABLE dbo.tarea_tipo ADD obra_id uniqueidentifier NULL REFERENCES dbo.obra(id);
GO

/* El codigo deja de ser unico global: unico en la biblioteca, y
   unico dentro de cada obra. Dos obras pueden tener su CEM-25. */
DECLARE @c sysname, @sql nvarchar(400);

SELECT @c = kc.name FROM sys.key_constraints kc
JOIN sys.tables t ON t.object_id = kc.parent_object_id
WHERE t.name = 'material' AND kc.type = 'UQ';
IF @c IS NOT NULL BEGIN
  SET @sql = 'ALTER TABLE dbo.material DROP CONSTRAINT ' + QUOTENAME(@c);
  EXEC sp_executesql @sql;
END

SET @c = NULL;
SELECT @c = kc.name FROM sys.key_constraints kc
JOIN sys.tables t ON t.object_id = kc.parent_object_id
WHERE t.name = 'tarea_tipo' AND kc.type = 'UQ';
IF @c IS NOT NULL BEGIN
  SET @sql = 'ALTER TABLE dbo.tarea_tipo DROP CONSTRAINT ' + QUOTENAME(@c);
  EXEC sp_executesql @sql;
END
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name='ux_material_codigo_lib')
  CREATE UNIQUE INDEX ux_material_codigo_lib ON dbo.material(codigo) WHERE obra_id IS NULL;
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name='ux_material_codigo_obra')
  CREATE UNIQUE INDEX ux_material_codigo_obra ON dbo.material(obra_id, codigo) WHERE obra_id IS NOT NULL;
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name='ux_tarea_codigo_lib')
  CREATE UNIQUE INDEX ux_tarea_codigo_lib ON dbo.tarea_tipo(codigo) WHERE obra_id IS NULL;
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name='ux_tarea_codigo_obra')
  CREATE UNIQUE INDEX ux_tarea_codigo_obra ON dbo.tarea_tipo(obra_id, codigo) WHERE obra_id IS NOT NULL;
GO

/* --- overrides: solo el campo que se toco --- */
IF OBJECT_ID('dbo.obra_material','U') IS NULL
CREATE TABLE dbo.obra_material (
  obra_id         uniqueidentifier NOT NULL REFERENCES dbo.obra(id) ON DELETE CASCADE,
  material_id     int NOT NULL REFERENCES dbo.material(id),
  nombre          nvarchar(160) NULL,
  marca           nvarchar(80)  NULL,
  presentacion    nvarchar(60)  NULL,
  unidades_x_pres decimal(12,4) NULL,
  desperdicio_pct decimal(5,2)  NULL,
  oculto          bit NOT NULL DEFAULT 0,
  PRIMARY KEY (obra_id, material_id)
);
GO

IF OBJECT_ID('dbo.obra_tarea','U') IS NULL
CREATE TABLE dbo.obra_tarea (
  obra_id       uniqueidentifier NOT NULL REFERENCES dbo.obra(id) ON DELETE CASCADE,
  tarea_tipo_id int NOT NULL REFERENCES dbo.tarea_tipo(id),
  nombre        nvarchar(200) NULL,
  oculto        bit NOT NULL DEFAULT 0,
  PRIMARY KEY (obra_id, tarea_tipo_id)
);
GO

/* --- PRECIOS: nunca se pisan, se agregan --- */
IF OBJECT_ID('dbo.precio','U') IS NULL
CREATE TABLE dbo.precio (
  id            uniqueidentifier NOT NULL DEFAULT newid() PRIMARY KEY,
  obra_id       uniqueidentifier NOT NULL REFERENCES dbo.obra(id) ON DELETE CASCADE,
  material_id   int NOT NULL REFERENCES dbo.material(id),
  proveedor_id  int NULL REFERENCES dbo.proveedor(id),
  moneda        char(3) NOT NULL DEFAULT 'ARS',
  importe       decimal(18,4) NOT NULL,          -- por presentacion, como vino
  iva_incluido  bit NOT NULL DEFAULT 1,
  alicuota_iva  decimal(5,2) NOT NULL DEFAULT 21.00,
  importe_final AS (CASE WHEN iva_incluido = 1
                         THEN importe
                         ELSE importe * (1 + alicuota_iva / 100.0) END) PERSISTED,
  vigente_desde date NOT NULL,
  fuente        nvarchar(160) NULL,
  creado_en     datetime2 NOT NULL DEFAULT sysutcdatetime(),
  CONSTRAINT ck_precio_importe CHECK (importe > 0)
);
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name='ix_precio_lookup')
  CREATE INDEX ix_precio_lookup ON dbo.precio(obra_id, material_id, vigente_desde DESC);
GO

/* El precio que manda hoy: el ultimo cargado por material y obra. */
CREATE OR ALTER VIEW dbo.v_precio_vigente AS
WITH ranked AS (
  SELECT p.*,
         ROW_NUMBER() OVER (PARTITION BY p.obra_id, p.material_id
                            ORDER BY p.vigente_desde DESC, p.creado_en DESC) AS rn
  FROM dbo.precio p
)
SELECT id, obra_id, material_id, proveedor_id, moneda,
       importe, iva_incluido, alicuota_iva, importe_final,
       vigente_desde, fuente
FROM ranked WHERE rn = 1;
GO

/* --- VERIFICACION --- */
SELECT 'obra_material' AS tabla, COUNT(*) AS filas FROM dbo.obra_material
UNION ALL SELECT 'obra_tarea', COUNT(*) FROM dbo.obra_tarea
UNION ALL SELECT 'precio',     COUNT(*) FROM dbo.precio;

SELECT name AS indice_creado FROM sys.indexes
WHERE name IN ('ux_material_codigo_lib','ux_material_codigo_obra',
               'ux_tarea_codigo_lib','ux_tarea_codigo_obra','ix_precio_lookup');
