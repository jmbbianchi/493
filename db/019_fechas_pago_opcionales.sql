SET XACT_ABORT ON;
BEGIN TRANSACTION;
ALTER TABLE dbo.plan_tramo ALTER COLUMN fecha_prevista date NULL;
ALTER TABLE dbo.cuota ALTER COLUMN fecha_prevista date NULL;
COMMIT;
