SET XACT_ABORT ON;
BEGIN TRANSACTION;
IF OBJECT_ID('dbo.presupuesto_programacion','U') IS NULL
CREATE TABLE dbo.presupuesto_programacion (
 presupuesto_id uniqueidentifier PRIMARY KEY REFERENCES dbo.presupuesto(id),
 base_ipc varchar(16) NOT NULL DEFAULT 'cotizacion' CHECK (base_ipc IN ('cotizacion','primera_cuota')),
 tarea_id uniqueidentifier NULL REFERENCES dbo.proyecto_tarea(id)
);
COMMIT;
GO
CREATE OR ALTER VIEW dbo.v_cuota_programada AS
SELECT c.id,c.presupuesto_id,c.plan_tramo_id,c.orden,c.tipo,c.descripcion,
 CASE WHEN c.tipo='cuota' AND t.fecha_inicio IS NOT NULL AND NOT EXISTS
   (SELECT 1 FROM dbo.pago g WHERE g.cuota_id=c.id AND g.anulado=0)
 THEN DATEADD(day,DATEDIFF(day,fechas.inicio,t.fecha_inicio),c.fecha_prevista)
 ELSE c.fecha_prevista END AS fecha_prevista,
 c.monto_nominal,c.indexa,c.indice_codigo,c.estado,
 CASE WHEN cfg.base_ipc='primera_cuota' THEN COALESCE(t.fecha_inicio,fechas.inicio,p.fecha_base)
 ELSE p.fecha_base END AS fecha_base_ipc
FROM dbo.cuota c
JOIN dbo.presupuesto p ON p.id=c.presupuesto_id
LEFT JOIN dbo.presupuesto_programacion cfg ON cfg.presupuesto_id=p.id
LEFT JOIN dbo.proyecto_tarea t ON t.id=cfg.tarea_id AND t.obra_id=p.obra_id
OUTER APPLY (SELECT MIN(x.fecha_prevista) AS inicio FROM dbo.cuota x
 WHERE x.presupuesto_id=p.id AND x.tipo='cuota' AND x.estado<>'anulada') fechas;
