/* Vinculos y escenarios financieros. Ejecutar manualmente despues de 014.
   No cambia presupuestos, cuotas ni pagos existentes. */
SET NOCOUNT ON;
SET XACT_ABORT ON;
BEGIN TRY
BEGIN TRANSACTION;

IF NOT EXISTS (SELECT 1 FROM sys.key_constraints WHERE name='uq_presupuesto_obra_id')
  ALTER TABLE dbo.presupuesto ADD CONSTRAINT uq_presupuesto_obra_id UNIQUE (obra_id,id);

IF OBJECT_ID('dbo.proyecto_presupuesto_tarea','U') IS NULL
CREATE TABLE dbo.proyecto_presupuesto_tarea (
  obra_id uniqueidentifier NOT NULL,
  presupuesto_id uniqueidentifier NOT NULL,
  tarea_id uniqueidentifier NOT NULL,
  PRIMARY KEY (obra_id,presupuesto_id,tarea_id),
  FOREIGN KEY (obra_id,presupuesto_id) REFERENCES dbo.presupuesto(obra_id,id),
  FOREIGN KEY (obra_id,tarea_id) REFERENCES dbo.proyecto_tarea(obra_id,id)
);

IF OBJECT_ID('dbo.proyecto_plan_pago','U') IS NULL
CREATE TABLE dbo.proyecto_plan_pago (
  obra_id uniqueidentifier NOT NULL,
  presupuesto_id uniqueidentifier NOT NULL,
  modo varchar(12) NOT NULL,
  anticipo_pct decimal(5,2) NOT NULL,
  dias_anticipo int NOT NULL,
  primer_pago_dias int NOT NULL,
  anticipo_indexa bit NOT NULL,
  cuotas_indexan bit NOT NULL,
  inicio_aplicado date NULL,
  fin_aplicado date NULL,
  huella_aplicada char(64) NULL,
  PRIMARY KEY (obra_id,presupuesto_id),
  FOREIGN KEY (obra_id,presupuesto_id) REFERENCES dbo.presupuesto(obra_id,id),
  CHECK (modo IN ('pactado','semanal','anticipado')),
  CHECK (anticipo_pct BETWEEN 0 AND 100),
  CHECK (dias_anticipo BETWEEN 0 AND 365),
  CHECK (primer_pago_dias BETWEEN 0 AND 6)
);
COMMIT TRANSACTION;
END TRY
BEGIN CATCH
  IF @@TRANCOUNT>0 ROLLBACK TRANSACTION;
  THROW;
END CATCH;
GO
/* Control: nuevas tablas vacias hasta guardar vinculos desde la app.
SELECT COUNT(*) FROM dbo.proyecto_presupuesto_tarea;
SELECT COUNT(*) FROM dbo.proyecto_plan_pago;
-- Comparar conteos de presupuesto, cuota y pago antes/despues: sin cambios.
-- Repetir la migracion: no debe borrar vinculos ni escenarios.
*/
