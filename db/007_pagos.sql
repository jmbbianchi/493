/* ============================================================
   obra493 - migracion 007
   Pagos.

   POR QUE AHORA Y NO DESPUES
   --------------------------
   Si el registro de pagos llega tres meses tarde, nadie carga tres meses
   de pagos hacia atras. La app queda llena de presupuestos sin un solo
   pago y la tercera columna nunca se llena.

   POR QUE presupuesto_id Y cuota_id SON NULLABLES
   -----------------------------------------------
   Siempre aparece un pago suelto que no estaba en ningun plan: el flete,
   el adicional que se acordo por telefono, la seña que se dio antes de
   pedir el presupuesto formal. Obligarlo a colgar de una cuota haria que
   no se cargue, y un pago no cargado es peor que un pago mal imputado.

   rubro_id, en cambio, es obligatorio. Decision 8 del plan: un pago se
   imputa a rubro Y a presupuesto, no a uno u otro. Sin rubro el pago no
   entra en ninguna de las tres columnas y es plata que se fue sin dejar
   rastro en la unica vista que importa.

   UN PAGO, UN PRESUPUESTO
   -----------------------
   Decision 11: un pago no se parte entre dos presupuestos. Si una
   transferencia cubrio dos cosas, se cargan dos pagos. Partirlo exigiria
   una pantalla de reparto y ahi se van los quince segundos parado en la
   obra, que es el criterio de aceptacion de esta etapa.

   Idempotente.
   ============================================================ */

SET NOCOUNT ON;
SET XACT_ABORT ON;

IF OBJECT_ID('dbo.pago','U') IS NULL
CREATE TABLE dbo.pago (
  id              uniqueidentifier NOT NULL DEFAULT newid() PRIMARY KEY,
  obra_id         uniqueidentifier NOT NULL REFERENCES dbo.obra(id) ON DELETE CASCADE,
  rubro_id        int NOT NULL REFERENCES dbo.rubro(id),
  -- Sin ON DELETE CASCADE a proposito: obra ya cascadea a presupuesto y a
  -- pago, y un segundo camino de cascada lo rechaza SQL Server. Igual no
  -- hace falta, porque los presupuestos se anulan y no se borran.
  presupuesto_id  uniqueidentifier NULL REFERENCES dbo.presupuesto(id),
  cuota_id        uniqueidentifier NULL REFERENCES dbo.cuota(id),
  fecha           date NOT NULL,
  monto           decimal(18,2) NOT NULL,
  medio           varchar(24) NOT NULL DEFAULT 'transferencia',
  comprobante_url nvarchar(500) NULL,   -- lo llena E7, con SAS de vida corta
  notas           nvarchar(500) NULL,
  anulado         bit NOT NULL DEFAULT 0,
  anulado_motivo  nvarchar(300) NULL,
  creado_en       datetime2 NOT NULL DEFAULT sysutcdatetime(),
  CONSTRAINT ck_pago_monto CHECK (monto > 0),
  CONSTRAINT ck_pago_medio CHECK (medio IN ('transferencia','efectivo','cheque','otro'))
);
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name='ix_pago_obra')
  CREATE INDEX ix_pago_obra ON dbo.pago(obra_id, rubro_id, fecha);
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name='ix_pago_presupuesto')
  CREATE INDEX ix_pago_presupuesto ON dbo.pago(presupuesto_id);
GO

/* === LO PAGADO POR RUBRO ===================================
   La tercera columna. Un pago anulado no suma pero queda: anular es
   corregir un error de carga, no hacer desaparecer plata.             */
CREATE OR ALTER VIEW dbo.v_pagado_rubro AS
SELECT obra_id,
       rubro_id,
       SUM(monto)  AS pagado,
       COUNT(*)    AS pagos,
       MAX(fecha)  AS ultimo_pago
FROM dbo.pago
WHERE anulado = 0
GROUP BY obra_id, rubro_id;
GO

/* === LO PAGADO POR PRESUPUESTO =============================
   Para el saldo: cuanto falta pagar de este acuerdo.                  */
CREATE OR ALTER VIEW dbo.v_pagado_presupuesto AS
SELECT presupuesto_id,
       SUM(monto)  AS pagado,
       COUNT(*)    AS pagos,
       MAX(fecha)  AS ultimo_pago
FROM dbo.pago
WHERE anulado = 0 AND presupuesto_id IS NOT NULL
GROUP BY presupuesto_id;
GO

/* -- Controles -------------------------------------------------------
SELECT t.name AS tabla, p.rows AS filas
FROM sys.tables t JOIN sys.partitions p
  ON p.object_id = t.object_id AND p.index_id IN (0,1)
WHERE t.name = 'pago';

-- Cuanto se lleva pagado por rubro:
-- SELECT * FROM dbo.v_pagado_rubro WHERE obra_id = '<id>';
   ------------------------------------------------------------------- */
