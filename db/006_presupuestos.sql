/* ============================================================
   obra493 - migracion 006
   Presupuestos recibidos y sus planes de pago.

   POR QUE EXISTE ESTA TABLA
   -------------------------
   Un presupuesto de obra en Argentina no es un monto: es un acuerdo con
   un plan de pago que se mueve con la inflacion. El cementista dice
   $85.000.000 con 20 % de anticipo y 14 cuotas semanales ajustadas por
   IPC, y lo que termina saliendo es otro numero que no esta escrito en
   ningun papel, ni el del proveedor ni el de la obra.

   Guardar solo el monto seria guardar la mentira. Por eso el monto vive
   en presupuesto y la forma de pagarlo en plan_tramo, y recien cuando el
   presupuesto se confirma se materializan las cuota, que son las que
   llevan el coeficiente.

   TRES ESTADOS Y NINGUN DELETE
   ----------------------------
   Los presupuestos y las cuotas se ANULAN, no se borran. Un presupuesto
   que se cayo es informacion: dice a quien le pediste precio y cuanto te
   habia pedido. Borrarlo pierde el historial de con quien negociaste.

   Idempotente.
   ============================================================ */

SET NOCOUNT ON;
SET XACT_ABORT ON;

/* === EL PRESUPUESTO ======================================== */
IF OBJECT_ID('dbo.presupuesto','U') IS NULL
CREATE TABLE dbo.presupuesto (
  id             uniqueidentifier NOT NULL DEFAULT newid() PRIMARY KEY,
  obra_id        uniqueidentifier NOT NULL REFERENCES dbo.obra(id) ON DELETE CASCADE,
  rubro_id       int NOT NULL REFERENCES dbo.rubro(id),
  proveedor_id   int NULL REFERENCES dbo.proveedor(id),
  tipo           varchar(16) NOT NULL,          -- materiales | mano_obra
  nombre         nvarchar(200) NOT NULL,        -- "Cementista - estructura"
  monto_base     decimal(18,2) NOT NULL,
  -- Decision 10 del plan: peso o dolar oficial del BCRA, nada mas. El
  -- blue y el MEP quedan afuera hasta que haya una fuente.
  moneda         char(3) NOT NULL DEFAULT 'ARS',
  -- El mes contra el que se indexa todo. No es la fecha en que lo
  -- cargaste: es la fecha del precio que te pasaron.
  fecha_base     date NOT NULL,
  estado         varchar(16) NOT NULL DEFAULT 'borrador',
  confirmado_en  datetime2 NULL,
  anulado_en     datetime2 NULL,
  anulado_motivo nvarchar(300) NULL,
  notas          nvarchar(1000) NULL,
  creado_en      datetime2 NOT NULL DEFAULT sysutcdatetime(),
  CONSTRAINT ck_presupuesto_tipo   CHECK (tipo IN ('materiales','mano_obra')),
  CONSTRAINT ck_presupuesto_moneda CHECK (moneda IN ('ARS','USD')),
  CONSTRAINT ck_presupuesto_estado CHECK (estado IN ('borrador','confirmado','anulado')),
  CONSTRAINT ck_presupuesto_monto  CHECK (monto_base > 0)
);
GO

/* === EL PLAN DE PAGO =======================================
   Un tramo es una linea del acuerdo: "20 % de anticipo" o "14 cuotas
   semanales". Se guarda como se hablo -- en porcentaje o en monto --
   porque asi es como el proveedor lo escribio y asi hay que poder
   discutirselo despues.                                              */
IF OBJECT_ID('dbo.plan_tramo','U') IS NULL
CREATE TABLE dbo.plan_tramo (
  id             uniqueidentifier NOT NULL DEFAULT newid() PRIMARY KEY,
  presupuesto_id uniqueidentifier NOT NULL REFERENCES dbo.presupuesto(id) ON DELETE CASCADE,
  orden          int NOT NULL,
  tipo           varchar(12) NOT NULL,          -- anticipo | cuota
  descripcion    nvarchar(160) NULL,
  porcentaje     decimal(9,6) NULL,             -- 20.000000 = 20 %
  monto_base     decimal(18,2) NULL,            -- alternativa al porcentaje
  fecha_prevista date NOT NULL,
  -- El anticipo casi nunca indexa: es lo que congela el precio. Las
  -- cuotas casi siempre si. Por eso es por tramo y no por presupuesto.
  indexa         bit NOT NULL DEFAULT 1,
  indice_codigo  varchar(32) NOT NULL DEFAULT 'IPC_NIVEL'
      REFERENCES dbo.indice(codigo),
  CONSTRAINT ck_tramo_tipo CHECK (tipo IN ('anticipo','cuota')),
  -- Uno de los dos, no los dos ni ninguno: si estuvieran los dos habria
  -- que decidir cual gana, y esa decision se toma mal a las tres de la
  -- tarde con el corralon esperando.
  CONSTRAINT ck_tramo_monto CHECK (
      (porcentaje IS NOT NULL AND monto_base IS NULL) OR
      (porcentaje IS NULL AND monto_base IS NOT NULL)),
  CONSTRAINT uq_tramo_orden UNIQUE (presupuesto_id, orden)
);
GO

/* === LA CUOTA ==============================================
   Se materializa al confirmar el presupuesto. Antes de eso no existe:
   un borrador no genera obligaciones.

   monto_nominal        lo que dice el papel
   coeficiente_aplicado NULL mientras el indice del mes no se publico
   monto_real           nominal x coeficiente, NULL si no hay coeficiente

   NUNCA poner coeficiente 1 para tapar un NULL. Un 1 se lee como "no
   hubo inflacion" y se cobra la diferencia en silencio. El NULL es el
   que avisa que la cuota es provisoria.                              */
IF OBJECT_ID('dbo.cuota','U') IS NULL
CREATE TABLE dbo.cuota (
  id                   uniqueidentifier NOT NULL DEFAULT newid() PRIMARY KEY,
  presupuesto_id       uniqueidentifier NOT NULL REFERENCES dbo.presupuesto(id) ON DELETE CASCADE,
  plan_tramo_id        uniqueidentifier NULL REFERENCES dbo.plan_tramo(id),
  orden                int NOT NULL,
  tipo                 varchar(12) NOT NULL,     -- anticipo | cuota
  descripcion          nvarchar(160) NULL,
  fecha_prevista       date NOT NULL,
  monto_nominal        decimal(18,2) NOT NULL,
  indexa               bit NOT NULL DEFAULT 1,
  indice_codigo        varchar(32) NOT NULL DEFAULT 'IPC_NIVEL',
  coeficiente_aplicado decimal(18,8) NULL,
  monto_real           decimal(18,2) NULL,
  estado               varchar(12) NOT NULL DEFAULT 'pendiente',
  anulado_motivo       nvarchar(300) NULL,
  creado_en            datetime2 NOT NULL DEFAULT sysutcdatetime(),
  CONSTRAINT ck_cuota_tipo   CHECK (tipo IN ('anticipo','cuota')),
  CONSTRAINT ck_cuota_estado CHECK (estado IN ('pendiente','provisoria','definitiva','anulada')),
  CONSTRAINT uq_cuota_orden  UNIQUE (presupuesto_id, orden)
);
GO

/* === INDICES DE BUSQUEDA =================================== */
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name='ix_presupuesto_obra')
  CREATE INDEX ix_presupuesto_obra ON dbo.presupuesto(obra_id, rubro_id);
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name='ix_tramo_presupuesto')
  CREATE INDEX ix_tramo_presupuesto ON dbo.plan_tramo(presupuesto_id, orden);
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name='ix_cuota_presupuesto')
  CREATE INDEX ix_cuota_presupuesto ON dbo.cuota(presupuesto_id, orden);
GO

/* === LO PRESUPUESTADO POR RUBRO ============================
   La segunda de las tres columnas que la app existe para mostrar.
   Solo cuenta lo confirmado: un borrador todavia no es un acuerdo.

   Da el nominal y el real conocido. El PROYECTADO no vive aca a
   proposito: proyectar exige extrapolar inflacion futura, y eso es una
   decision de producto que se toma en el backend y se explica en la
   respuesta, no un numero que una vista deberia devolver como si fuera
   un hecho.                                                          */
CREATE OR ALTER VIEW dbo.v_presupuestado_rubro AS
SELECT p.obra_id,
       p.rubro_id,
       COUNT(DISTINCT p.id) AS presupuestos,
       SUM(CASE WHEN c.estado <> 'anulada' THEN c.monto_nominal END) AS nominal,
       SUM(CASE WHEN c.estado <> 'anulada' THEN c.monto_real    END) AS real_conocido,
       SUM(CASE WHEN c.estado <> 'anulada' AND c.monto_real IS NULL
                THEN 1 ELSE 0 END) AS cuotas_sin_coeficiente
FROM dbo.presupuesto p
LEFT JOIN dbo.cuota c ON c.presupuesto_id = p.id
WHERE p.estado = 'confirmado'
GROUP BY p.obra_id, p.rubro_id;
GO

/* -- Controles -------------------------------------------------------
-- Que quedo creado:
SELECT t.name AS tabla, p.rows AS filas
FROM sys.tables t JOIN sys.partitions p
  ON p.object_id = t.object_id AND p.index_id IN (0,1)
WHERE t.name IN ('presupuesto','plan_tramo','cuota') ORDER BY t.name;

-- El caso del cementista, una vez cargado:
-- SELECT orden, tipo, fecha_prevista, monto_nominal,
--        coeficiente_aplicado, monto_real, estado
-- FROM dbo.cuota WHERE presupuesto_id = '<id>' ORDER BY orden;
   ------------------------------------------------------------------- */
