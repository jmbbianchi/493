SET XACT_ABORT ON;
BEGIN TRANSACTION;
IF COL_LENGTH('dbo.presupuesto','cierre_fecha') IS NULL
BEGIN
 ALTER TABLE dbo.presupuesto ADD cierre_fecha date NULL, cierre_motivo nvarchar(1000) NULL,
 cierre_cancelado decimal(18,2) NULL, cierre_pagado decimal(18,2) NULL,
 cierre_proyectado decimal(18,2) NULL, cierre_reemplazo_id uniqueidentifier NULL,
 cierre_registrado_en datetime2 NULL;
 ALTER TABLE dbo.presupuesto ADD CONSTRAINT fk_presupuesto_reemplazo FOREIGN KEY(cierre_reemplazo_id) REFERENCES dbo.presupuesto(id);
END;
COMMIT;
