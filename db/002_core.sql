/* ============================================================
   obra493 - migracion 002
   Identidad, obra, compartir, biblioteca y computo.

   Decisiones que respalda este esquema (auditoria del 25-ago-2026):
     - No hay tenant. La raiz es el usuario y la obra; se comparte
       obra por obra con rol editor o lectura.
     - La biblioteca (rubros, materiales, tareas, coeficientes,
       proveedores) es global y la mantiene el duenio del producto.
     - Cada obra puede pisar un coeficiente sin tocar la biblioteca.
     - Cerrar un computo congela los coeficientes usados.
     - Borrado normal en computo y materiales. En la migracion 003,
       pagos y certificaciones se ANULAN con motivo, no se borran.

   Idempotente: se puede correr varias veces sin romper nada.
   ============================================================ */

SET NOCOUNT ON;
SET XACT_ABORT ON;

/* ═══ IDENTIDAD ══════════════════════════════════════════════ */
IF OBJECT_ID('dbo.usuario','U') IS NULL
CREATE TABLE dbo.usuario (
  id         uniqueidentifier NOT NULL DEFAULT newid() PRIMARY KEY,
  entra_oid  nvarchar(64)  NOT NULL UNIQUE,   -- viene del token, nunca se tipea
  email      nvarchar(320) NOT NULL,
  nombre     nvarchar(160) NOT NULL,
  creado_en  datetime2 NOT NULL DEFAULT sysutcdatetime()
);

/* ═══ OBRA ═══════════════════════════════════════════════════ */
IF OBJECT_ID('dbo.obra','U') IS NULL
CREATE TABLE dbo.obra (
  id                uniqueidentifier NOT NULL DEFAULT newid() PRIMARY KEY,
  owner_id          uniqueidentifier NOT NULL REFERENCES dbo.usuario(id),
  nombre            nvarchar(160) NOT NULL,
  direccion         nvarchar(300) NULL,
  nomenclatura      nvarchar(120) NULL,        -- Circ / Secc / Manz / Lote
  partida_inmob     nvarchar(60)  NULL,
  sup_terreno       decimal(12,2) NULL,
  sup_cubierta      decimal(12,2) NULL,
  sup_semicubierta  decimal(12,2) NULL,
  sup_descubierta   decimal(12,2) NULL,
  criterio_m2       varchar(24)   NOT NULL DEFAULT 'cubierta',
  moneda_base       char(3)       NOT NULL DEFAULT 'ARS',
  desperdicio_pct   decimal(5,2)  NOT NULL DEFAULT 5.00,
  fecha_inicio      date NULL,
  estado            varchar(16) NOT NULL DEFAULT 'en_curso',
  creado_en         datetime2 NOT NULL DEFAULT sysutcdatetime(),
  CONSTRAINT ck_obra_criterio CHECK
    (criterio_m2 IN ('cubierta','cubierta_mas_medio_semi','total')),
  CONSTRAINT ck_obra_estado CHECK
    (estado IN ('en_curso','cerrada','archivada'))
);

/* Compartir: aca vive todo el control de acceso del sistema. */
IF OBJECT_ID('dbo.obra_usuario','U') IS NULL
CREATE TABLE dbo.obra_usuario (
  obra_id      uniqueidentifier NOT NULL REFERENCES dbo.obra(id) ON DELETE CASCADE,
  usuario_id   uniqueidentifier NOT NULL REFERENCES dbo.usuario(id),
  rol          varchar(12) NOT NULL,           -- editor | lectura
  invitado_por uniqueidentifier NULL REFERENCES dbo.usuario(id),
  creado_en    datetime2 NOT NULL DEFAULT sysutcdatetime(),
  PRIMARY KEY (obra_id, usuario_id),
  CONSTRAINT ck_obra_usuario_rol CHECK (rol IN ('editor','lectura'))
);

/* ═══ BIBLIOTECA (global) ════════════════════════════════════ */
IF OBJECT_ID('dbo.rubro','U') IS NULL
CREATE TABLE dbo.rubro (
  id     int IDENTITY PRIMARY KEY,
  nombre nvarchar(80) NOT NULL UNIQUE,
  orden  int NOT NULL
);

IF OBJECT_ID('dbo.material','U') IS NULL
CREATE TABLE dbo.material (
  id               int IDENTITY PRIMARY KEY,
  codigo           varchar(32) NOT NULL UNIQUE,
  nombre           nvarchar(160) NOT NULL,
  rubro_id         int NOT NULL REFERENCES dbo.rubro(id),
  unidad_consumo   varchar(8) NOT NULL,        -- kg | m3 | m2 | ml | L | u
  presentacion     nvarchar(60) NULL,          -- "Bolsa 25 kg"
  unidades_x_pres  decimal(12,4) NOT NULL DEFAULT 1,
  desperdicio_pct  decimal(5,2) NULL,          -- NULL hereda de la obra
  activo           bit NOT NULL DEFAULT 1
);

IF OBJECT_ID('dbo.tarea_tipo','U') IS NULL
CREATE TABLE dbo.tarea_tipo (
  id              int IDENTITY PRIMARY KEY,
  codigo          varchar(32) NOT NULL UNIQUE,
  nombre          nvarchar(200) NOT NULL,      -- "Muro ladrillo hueco 18x18x33"
  rubro_id        int NOT NULL REFERENCES dbo.rubro(id),
  unidad_medicion varchar(8) NOT NULL,         -- m2 | m3 | ml | u
  activo          bit NOT NULL DEFAULT 1
);

/* El corazon del motor: cuanto de cada material consume una tarea. */
IF OBJECT_ID('dbo.coeficiente','U') IS NULL
CREATE TABLE dbo.coeficiente (
  tarea_tipo_id   int NOT NULL REFERENCES dbo.tarea_tipo(id),
  material_id     int NOT NULL REFERENCES dbo.material(id),
  consumo         decimal(14,6) NOT NULL,
  desperdicio_pct decimal(5,2) NULL,           -- NULL hereda del material
  PRIMARY KEY (tarea_tipo_id, material_id),
  CONSTRAINT ck_coef_consumo CHECK (consumo > 0)
);

/* Cada obra puede pisar un coeficiente sin tocar la biblioteca. */
IF OBJECT_ID('dbo.obra_coeficiente','U') IS NULL
CREATE TABLE dbo.obra_coeficiente (
  obra_id         uniqueidentifier NOT NULL REFERENCES dbo.obra(id) ON DELETE CASCADE,
  tarea_tipo_id   int NOT NULL REFERENCES dbo.tarea_tipo(id),
  material_id     int NOT NULL REFERENCES dbo.material(id),
  consumo         decimal(14,6) NOT NULL,
  desperdicio_pct decimal(5,2) NULL,
  PRIMARY KEY (obra_id, tarea_tipo_id, material_id),
  CONSTRAINT ck_obracoef_consumo CHECK (consumo > 0)
);

IF OBJECT_ID('dbo.proveedor','U') IS NULL
CREATE TABLE dbo.proveedor (
  id        int IDENTITY PRIMARY KEY,
  nombre    nvarchar(160) NOT NULL,
  cuit      varchar(13) NULL,
  direccion nvarchar(300) NULL,
  lat       decimal(9,6) NULL,                 -- mapa de corralones cercanos
  lng       decimal(9,6) NULL,
  telefono  nvarchar(40) NULL,
  email     nvarchar(320) NULL,
  activo    bit NOT NULL DEFAULT 1
);

/* ═══ COMPUTO ════════════════════════════════════════════════ */
IF OBJECT_ID('dbo.computo','U') IS NULL
CREATE TABLE dbo.computo (
  id            uniqueidentifier NOT NULL DEFAULT newid() PRIMARY KEY,
  obra_id       uniqueidentifier NOT NULL REFERENCES dbo.obra(id) ON DELETE CASCADE,
  tarea_tipo_id int NOT NULL REFERENCES dbo.tarea_tipo(id),
  ubicacion     nvarchar(160) NULL,            -- texto libre, con sugerencias en la UI
  cantidad      decimal(14,4) NOT NULL,
  cerrado       bit NOT NULL DEFAULT 0,
  cerrado_en    datetime2 NULL,
  notas         nvarchar(500) NULL,
  creado_en     datetime2 NOT NULL DEFAULT sysutcdatetime(),
  CONSTRAINT ck_computo_cantidad CHECK (cantidad > 0)
);

/* Snapshot al cerrar: lo que se uso queda escrito en piedra.
   La biblioteca puede cambiar despues; este computo ya no se mueve. */
IF OBJECT_ID('dbo.computo_coeficiente','U') IS NULL
CREATE TABLE dbo.computo_coeficiente (
  computo_id      uniqueidentifier NOT NULL REFERENCES dbo.computo(id) ON DELETE CASCADE,
  material_id     int NOT NULL REFERENCES dbo.material(id),
  consumo         decimal(14,6) NOT NULL,
  desperdicio_pct decimal(5,2) NOT NULL,
  PRIMARY KEY (computo_id, material_id)
);

/* ═══ INDICES DE BUSQUEDA ════════════════════════════════════ */
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name='ix_computo_obra')
  CREATE INDEX ix_computo_obra ON dbo.computo(obra_id);

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name='ix_obra_usuario_usuario')
  CREATE INDEX ix_obra_usuario_usuario ON dbo.obra_usuario(usuario_id);

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name='ix_obra_owner')
  CREATE INDEX ix_obra_owner ON dbo.obra(owner_id);

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name='ix_material_rubro')
  CREATE INDEX ix_material_rubro ON dbo.material(rubro_id);

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name='ix_tarea_rubro')
  CREATE INDEX ix_tarea_rubro ON dbo.tarea_tipo(rubro_id);

/* ═══ VERIFICACION ═══════════════════════════════════════════ */
SELECT t.name AS tabla, p.rows AS filas
FROM sys.tables t
JOIN sys.partitions p ON p.object_id = t.object_id AND p.index_id IN (0,1)
WHERE t.name IN ('usuario','obra','obra_usuario','rubro','material','tarea_tipo',
                 'coeficiente','obra_coeficiente','proveedor','computo',
                 'computo_coeficiente','indice','indice_valor')
ORDER BY t.name;
