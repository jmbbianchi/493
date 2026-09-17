-- Amplía los tipos de comprobante sin reclasificar archivos existentes.
SET XACT_ABORT ON;
BEGIN TRANSACTION;
IF EXISTS (SELECT 1 FROM sys.check_constraints WHERE name='ck_documento_tipo' AND parent_object_id=OBJECT_ID('dbo.documento'))
  ALTER TABLE dbo.documento DROP CONSTRAINT ck_documento_tipo;
ALTER TABLE dbo.documento WITH CHECK ADD CONSTRAINT ck_documento_tipo CHECK
  (tipo IN ('foto','presupuesto','factura','recibo','transferencia','remito','plano','otro'));
COMMIT;
