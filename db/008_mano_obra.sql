/* ============================================================
   obra493 - migracion 008
   Mano de obra y materiales que no tienen rendimiento.

   LO QUE FALTABA Y ES LA MITAD DE LA OBRA
   ---------------------------------------
   Hasta aca el teorico solo sabia sumar materiales con coeficiente por
   m2. Dos agujeros grandes:

   1. La MANO DE OBRA no existia en ninguna tabla, y es aproximadamente la
      mitad del costo de una obra. Un teorico sin mano de obra comparado
      contra un presupuesto que si la incluye da una diferencia gigante
      que no significa nada.

   2. Los materiales que NO se calculan por rendimiento -- caños,
      artefactos, aberturas, griferia -- no entraban. No hay "cañeria por
      m2 de bano": hay siete caños. El motor los ignoraba en silencio, que
      es la peor forma de estar mal: el numero cerraba y estaba incompleto.

   COMO SE COMPUTA CADA UNO
   ------------------------
   Decision 6 del plan: la mano de obra se computa igual que los
   materiales. Lo que cambia es que la da por cumplida el avance y no un
   remito, y eso es E5. Aca solo se computa.

   El material por cantidad se carga directo, con su cantidad, en
   computo_material. No pasa por coeficiente porque no hay coeficiente que
   inventarle.

   Decision 7: el costo de mano de obra en la tarea es OPCIONAL. La plata
   vive en el rubro. Forzar que cada peso cuelgue de una tarea es trabajo
   que nadie va a hacer, y una tarea sin costo cargado tiene que poder
   existir sin romper el total.

   Idempotente.
   ============================================================ */

SET NOCOUNT ON;
SET XACT_ABORT ON;

/* === 1. EL MATERIAL SABE COMO SE COMPUTA =================== */
IF COL_LENGTH('dbo.material', 'tipo') IS NULL
    ALTER TABLE dbo.material ADD tipo varchar(12) NOT NULL
        CONSTRAINT DF_material_tipo DEFAULT 'rendimiento';
GO

IF NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = 'ck_material_tipo')
    ALTER TABLE dbo.material ADD CONSTRAINT ck_material_tipo
        CHECK (tipo IN ('rendimiento','cantidad'));
GO

/* === 2. LA TAREA SABE CUANTO SALE HACERLA ==================
   Costo por unidad de medicion de la tarea: si la tarea se mide en m2,
   esto es el costo del m2 de mano de obra. NULL es un valor legitimo y
   quiere decir "todavia no lo se", no "es gratis".                    */
IF COL_LENGTH('dbo.tarea_tipo', 'costo_mo') IS NULL
    ALTER TABLE dbo.tarea_tipo ADD costo_mo decimal(18,2) NULL;
GO

/* Igual que todo lo demas, cada obra puede pisarlo sin tocar la
   biblioteca. El albanil de una obra no cobra lo mismo que el de otra. */
IF COL_LENGTH('dbo.obra_tarea', 'costo_mo') IS NULL
    ALTER TABLE dbo.obra_tarea ADD costo_mo decimal(18,2) NULL;
GO

/* === 3. COMPUTO DE MATERIAL DIRECTO ========================
   La fila de computo que no es una tarea sino un material y su cantidad.
   Siete caños, tres inodoros, una ventana de 1,20 x 1,10.

   Es una tabla aparte y no una columna nullable en computo porque una
   fila de computo con tarea_tipo_id NULL obligaria a que TODO el motor
   -- y la pantalla, y el cierre, y el snapshot de coeficientes -- pregunte
   de que tipo es cada fila antes de tocarla.                           */
IF OBJECT_ID('dbo.computo_material','U') IS NULL
CREATE TABLE dbo.computo_material (
  id          uniqueidentifier NOT NULL DEFAULT newid() PRIMARY KEY,
  obra_id     uniqueidentifier NOT NULL REFERENCES dbo.obra(id) ON DELETE CASCADE,
  material_id int NOT NULL REFERENCES dbo.material(id),
  ubicacion   nvarchar(160) NULL,
  cantidad    decimal(14,4) NOT NULL,
  notas       nvarchar(500) NULL,
  creado_en   datetime2 NOT NULL DEFAULT sysutcdatetime(),
  CONSTRAINT ck_computo_material_cantidad CHECK (cantidad > 0)
);
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name='ix_computo_material_obra')
  CREATE INDEX ix_computo_material_obra ON dbo.computo_material(obra_id, material_id);
GO

/* === 4. TAREAS QUE NO PRODUCEN NINGUN MATERIAL =============
   Una tarea cargada en el computo cuyo tipo no tiene ni un coeficiente
   asociado no aporta un solo material a la lista de compra. Puede estar
   bien (una tarea que es pura mano de obra) o puede ser un agujero de
   biblioteca. La vista la deja a la vista en vez de que se pierda.     */
CREATE OR ALTER VIEW dbo.v_tarea_sin_coeficiente AS
SELECT DISTINCT
       c.obra_id,
       t.id AS tarea_tipo_id,
       COALESCE(ot.nombre, t.nombre) AS tarea,
       r.nombre AS rubro,
       CASE WHEN COALESCE(ot.costo_mo, t.costo_mo) IS NULL THEN 0 ELSE 1 END AS tiene_mano_obra
FROM dbo.computo c
JOIN dbo.tarea_tipo t ON t.id = c.tarea_tipo_id
JOIN dbo.rubro r ON r.id = t.rubro_id
LEFT JOIN dbo.obra_tarea ot ON ot.obra_id = c.obra_id AND ot.tarea_tipo_id = t.id
WHERE NOT EXISTS (SELECT 1 FROM dbo.coeficiente k WHERE k.tarea_tipo_id = t.id)
  AND NOT EXISTS (SELECT 1 FROM dbo.obra_coeficiente ok
                   WHERE ok.obra_id = c.obra_id AND ok.tarea_tipo_id = t.id);
GO

/* -- Controles -------------------------------------------------------
SELECT tipo, COUNT(*) AS materiales FROM dbo.material GROUP BY tipo;
SELECT COUNT(*) AS tareas_con_costo_mo FROM dbo.tarea_tipo WHERE costo_mo IS NOT NULL;
SELECT * FROM dbo.v_tarea_sin_coeficiente;
   ------------------------------------------------------------------- */
