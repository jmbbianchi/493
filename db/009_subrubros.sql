/* ============================================================
   obra493 - migracion 009
   Sub-rubro, presupuesto elegido, presupuesto por items y moneda del pago.

   EL SUB-RUBRO
   ------------
   Un rubro no se cotiza entero: se cotiza la mano de obra por un lado y
   los materiales por otro, y muchas veces con proveedores distintos. Sin
   esa segunda dimension no se puede contestar "cuanto llevo pagado de
   mano de obra en toda la obra", que es la pregunta que se hace cualquiera
   que este construyendo.

   La lista es FIJA y la misma para los trece rubros (decision del usuario,
   28-ago-2026). Eso es lo que permite sumar transversalmente: toda la mano
   de obra de la obra, todos los materiales. Si fueran propios de cada
   rubro se cotizaria mas fiel pero no se podrian comparar entre si.

   presupuesto.tipo era esto mismo, pero encerrado adentro del presupuesto
   y sin poder usarse desde el pago ni desde el cronograma. Se reemplaza.

   EL PRESUPUESTO ELEGIDO
   ----------------------
   Para un mismo rubro y sub-rubro se piden VARIAS cotizaciones y se usa
   una. Hasta ahora los estados eran borrador / confirmado / anulado, que
   es otro eje: dicen si el acuerdo existe, no si es el que vas a usar.
   Sin esto, tener tres presupuestos del mismo trabajo hacia que la columna
   Presupuestado sumara los tres y mostrara el triple de la obra.

   Solo puede haber UN elegido por obra, rubro y sub-rubro, y lo garantiza
   un indice unico filtrado, no el codigo: si lo cuidara solo la aplicacion,
   dos pestañas abiertas alcanzarian para romperlo.

   EL PRESUPUESTO POR ITEMS
   ------------------------
   Conviven las dos formas. El albañil dice "$85.000.000" y es un monto
   solo; el corralon manda cuarenta renglones. Las dos llevan el mismo plan
   de pago y la misma indexacion, porque el plan de pago no depende de como
   se escribio el precio.

   Idempotente.
   ============================================================ */

SET NOCOUNT ON;
SET XACT_ABORT ON;

/* === 1. EL SUB-RUBRO ======================================= */
IF OBJECT_ID('dbo.subrubro','U') IS NULL
CREATE TABLE dbo.subrubro (
  id     int IDENTITY PRIMARY KEY,
  codigo varchar(24)  NOT NULL UNIQUE,
  nombre nvarchar(60) NOT NULL,
  orden  int NOT NULL
);
GO

IF NOT EXISTS (SELECT 1 FROM dbo.subrubro)
INSERT INTO dbo.subrubro (codigo, nombre, orden) VALUES
  ('MATERIALES', N'Materiales',   10),
  ('MANO_OBRA',  N'Mano de obra', 20),
  ('EQUIPOS',    N'Equipos',      30),
  ('OTROS',      N'Otros',        40);
GO

/* === 2. EL PRESUPUESTO GANA SUB-RUBRO ======================
   Se rellena desde tipo, que era esto mismo con dos valores. */
IF COL_LENGTH('dbo.presupuesto', 'subrubro_id') IS NULL
    ALTER TABLE dbo.presupuesto ADD subrubro_id int NULL REFERENCES dbo.subrubro(id);
GO

/* Va por sp_executesql y no suelto: en la segunda corrida la columna
   tipo ya no existe, y un UPDATE que la nombra no compila aunque el IF
   de arriba sea falso -- SQL Server liga las columnas al compilar el lote
   entero, no al ejecutar la rama. Sin esto la migracion corre una sola
   vez, y las migraciones de esta casa tienen que poder correr siempre. */
IF COL_LENGTH('dbo.presupuesto', 'tipo') IS NOT NULL
    EXEC sp_executesql N'
        UPDATE p SET subrubro_id = s.id
        FROM dbo.presupuesto p
        JOIN dbo.subrubro s ON s.codigo = CASE p.tipo
                WHEN ''mano_obra'' THEN ''MANO_OBRA''
                ELSE ''MATERIALES'' END
        WHERE p.subrubro_id IS NULL;';
GO

/* Recien ahora se puede exigir. Un presupuesto sin sub-rubro no entra en
   ninguna de las vistas comparativas, asi que seria invisible. */
IF EXISTS (SELECT 1 FROM sys.columns
           WHERE object_id = OBJECT_ID('dbo.presupuesto')
             AND name = 'subrubro_id' AND is_nullable = 1)
   AND NOT EXISTS (SELECT 1 FROM dbo.presupuesto WHERE subrubro_id IS NULL)
    ALTER TABLE dbo.presupuesto ALTER COLUMN subrubro_id int NOT NULL;
GO

/* tipo se va: dos fuentes de verdad para lo mismo se desincronizan solas. */
IF EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = 'ck_presupuesto_tipo')
    ALTER TABLE dbo.presupuesto DROP CONSTRAINT ck_presupuesto_tipo;
GO

IF COL_LENGTH('dbo.presupuesto', 'tipo') IS NOT NULL
    ALTER TABLE dbo.presupuesto DROP COLUMN tipo;
GO

/* === 3. CUAL SE USA ======================================== */
IF COL_LENGTH('dbo.presupuesto', 'elegido') IS NULL
    ALTER TABLE dbo.presupuesto ADD elegido bit NOT NULL
        CONSTRAINT DF_presupuesto_elegido DEFAULT 0;
GO

/* Como se escribio el precio: un monto solo, o una lista de renglones. */
IF COL_LENGTH('dbo.presupuesto', 'origen') IS NULL
    ALTER TABLE dbo.presupuesto ADD origen varchar(12) NOT NULL
        CONSTRAINT DF_presupuesto_origen DEFAULT 'monto';
GO

IF NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = 'ck_presupuesto_origen')
    ALTER TABLE dbo.presupuesto ADD CONSTRAINT ck_presupuesto_origen
        CHECK (origen IN ('monto','items'));
GO

/* Uno solo elegido por obra, rubro y sub-rubro. Lo garantiza la base y no
   el codigo: si lo cuidara la aplicacion, dos pestañas abiertas alcanzan. */
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name='ux_presupuesto_elegido')
  CREATE UNIQUE INDEX ux_presupuesto_elegido
      ON dbo.presupuesto(obra_id, rubro_id, subrubro_id)
      WHERE elegido = 1 AND estado = 'confirmado';
GO

/* === 4. LOS RENGLONES DEL PRESUPUESTO ======================
   subtotal es columna calculada y persistida: que la cuente la base evita
   que dos lugares del codigo la cuenten distinto. */
IF OBJECT_ID('dbo.presupuesto_item','U') IS NULL
CREATE TABLE dbo.presupuesto_item (
  id              uniqueidentifier NOT NULL DEFAULT newid() PRIMARY KEY,
  presupuesto_id  uniqueidentifier NOT NULL REFERENCES dbo.presupuesto(id) ON DELETE CASCADE,
  orden           int NOT NULL,
  descripcion     nvarchar(300) NOT NULL,
  cantidad        decimal(14,4) NOT NULL CONSTRAINT DF_item_cantidad DEFAULT 1,
  unidad          varchar(12) NULL,
  precio_unitario decimal(18,4) NOT NULL,
  -- Si el renglon se puede mapear a la biblioteca, queda enganchado y el
  -- precio sirve para comparar contra el teorico. Si no, es texto libre y
  -- tambien vale: el corralon escribe lo que quiere.
  material_id     int NULL REFERENCES dbo.material(id),
  subtotal AS CAST(cantidad * precio_unitario AS decimal(18,2)) PERSISTED,
  CONSTRAINT ck_item_cantidad CHECK (cantidad > 0),
  CONSTRAINT uq_item_orden UNIQUE (presupuesto_id, orden)
);
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name='ix_item_presupuesto')
  CREATE INDEX ix_item_presupuesto ON dbo.presupuesto_item(presupuesto_id, orden);
GO

/* === 5. EL PAGO GANA SUB-RUBRO Y MONEDA ====================
   El sub-rubro es nullable como el presupuesto: el pago suelto que no se
   sabe bien a que corresponde tiene que poder entrar igual, porque un pago
   no cargado es peor que un pago sin imputar.                            */
IF COL_LENGTH('dbo.pago', 'subrubro_id') IS NULL
    ALTER TABLE dbo.pago ADD subrubro_id int NULL REFERENCES dbo.subrubro(id);
GO

IF COL_LENGTH('dbo.pago', 'moneda') IS NULL
    ALTER TABLE dbo.pago ADD moneda char(3) NOT NULL
        CONSTRAINT DF_pago_moneda DEFAULT 'ARS';
GO

IF NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = 'ck_pago_moneda')
    ALTER TABLE dbo.pago ADD CONSTRAINT ck_pago_moneda CHECK (moneda IN ('ARS','USD'));
GO

/* Un pago heredado sin sub-rubro toma el del presupuesto al que se imputo. */
UPDATE g SET subrubro_id = p.subrubro_id
FROM dbo.pago g
JOIN dbo.presupuesto p ON p.id = g.presupuesto_id
WHERE g.subrubro_id IS NULL;
GO

/* === 6. LA VISTA COMPARATIVA ===============================
   Un renglon por rubro y sub-rubro con lo que se cotizo, cuantas
   cotizaciones hay y cual quedo elegida.                              */
CREATE OR ALTER VIEW dbo.v_presupuestos_rubro_subrubro AS
SELECT p.obra_id,
       p.rubro_id,
       r.nombre  AS rubro,
       r.orden   AS rubro_orden,
       p.subrubro_id,
       s.nombre  AS subrubro,
       s.orden   AS subrubro_orden,
       COUNT(*)                                              AS cotizaciones,
       MIN(p.monto_base)                                     AS mas_barato,
       MAX(p.monto_base)                                     AS mas_caro,
       SUM(CASE WHEN p.elegido = 1 THEN p.monto_base END)    AS elegido_nominal
FROM dbo.presupuesto p
JOIN dbo.rubro r    ON r.id = p.rubro_id
JOIN dbo.subrubro s ON s.id = p.subrubro_id
WHERE p.estado = 'confirmado'
GROUP BY p.obra_id, p.rubro_id, r.nombre, r.orden,
         p.subrubro_id, s.nombre, s.orden;
GO

/* -- Controles -------------------------------------------------------
SELECT * FROM dbo.subrubro ORDER BY orden;
SELECT id, nombre, rubro_id, subrubro_id, origen, elegido, estado FROM dbo.presupuesto;
SELECT COL_LENGTH('dbo.presupuesto','tipo') AS tipo_deberia_ser_null;
SELECT * FROM dbo.v_presupuestos_rubro_subrubro;
   ------------------------------------------------------------------- */

/* === 7. UN PRESUPUESTO POR ITEMS ARRANCA EN CERO ===========
   El monto sale de la suma de los renglones, asi que al crearlo todavia
   no hay ninguno y vale 0. El CHECK original exigia > 0 porque entonces
   el monto se tipeaba a mano y un cero era siempre un error de carga.  */
IF EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = 'ck_presupuesto_monto')
    ALTER TABLE dbo.presupuesto DROP CONSTRAINT ck_presupuesto_monto;
GO

IF NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = 'ck_presupuesto_monto_no_negativo')
    ALTER TABLE dbo.presupuesto ADD CONSTRAINT ck_presupuesto_monto_no_negativo
        CHECK (monto_base >= 0);
GO

/* === 8. LOS CONFIRMADOS DE ANTES QUEDAN ELEGIDOS ===========
   Un presupuesto confirmado antes de esta migracion no tiene con quien
   competir: era la unica forma de cargar uno. Sin esto quedarian todos en
   elegido = 0 y la columna Presupuestado apareceria vacia de golpe, que se
   leeria como que los presupuestos se perdieron.

   Solo se marca cuando es el unico confirmado de su rubro y sub-rubro: si
   hubiera varios, elegir por el usuario seria adivinar cual queria. */
UPDATE p SET elegido = 1
FROM dbo.presupuesto p
WHERE p.estado = 'confirmado'
  AND p.elegido = 0
  AND NOT EXISTS (SELECT 1 FROM dbo.presupuesto o
                   WHERE o.obra_id = p.obra_id
                     AND o.rubro_id = p.rubro_id
                     AND o.subrubro_id = p.subrubro_id
                     AND o.id <> p.id
                     AND o.estado = 'confirmado');
GO
