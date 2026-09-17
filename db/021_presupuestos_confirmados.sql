-- Cada presupuesto confirmado es un compromiso independiente.
SET XACT_ABORT ON;
BEGIN TRANSACTION;
IF EXISTS (SELECT 1 FROM sys.indexes WHERE object_id=OBJECT_ID('dbo.presupuesto') AND name='ux_presupuesto_elegido')
    DROP INDEX ux_presupuesto_elegido ON dbo.presupuesto;
UPDATE dbo.presupuesto SET elegido=1 WHERE estado='confirmado' AND elegido=0;
COMMIT;
