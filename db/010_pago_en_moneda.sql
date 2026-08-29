/* ============================================================
   obra493 - migracion 010
   Un pago en dolares no se resta de un presupuesto en pesos a 1:1.

   EL ERROR QUE ARREGLA
   --------------------
   Al agregar la moneda al pago (migracion 009) las vistas siguieron
   sumando `monto` a secas. Un pago de u$d 2.500 le bajaba $2.500 al saldo
   de un presupuesto en pesos. El numero cerraba y estaba mal por tres
   ordenes de magnitud, que es la peor forma de estar mal.

   COMO SE CONVIERTE
   -----------------
   Al tipo de cambio oficial MINORISTA del BCRA del dia del pago, o el
   ultimo publicado antes de esa fecha -- los fines de semana no hay.
   Minorista y no mayorista porque el que paga es una persona comprando
   dolares en el banco, no un importador.

   Si para esa fecha no hay cotizacion, monto_ars queda en NULL y el pago
   NO se suma. Igual que con el coeficiente de IPC: un dato que falta se
   dice, no se reemplaza por algo parecido. Por eso las vistas devuelven
   tambien cuantos pagos no se pudieron convertir.

   Idempotente.
   ============================================================ */

SET NOCOUNT ON;
SET XACT_ABORT ON;
GO

/* === EL PAGO, EXPRESADO EN PESOS ===========================
   CREATE VIEW tiene que ser la primera sentencia de su lote, de ahi el GO
   de arriba: sin el, la vista queda pegada a los SET y SQL Server la
   rechaza. */
CREATE OR ALTER VIEW dbo.v_pago_ars AS
SELECT g.id,
       g.obra_id,
       g.rubro_id,
       g.subrubro_id,
       g.presupuesto_id,
       g.fecha,
       g.monto,
       g.moneda,
       g.anulado,
       CASE WHEN g.moneda = 'ARS' THEN g.monto
            ELSE g.monto * (SELECT TOP 1 v.valor
                            FROM dbo.indice_valor v
                            WHERE v.codigo = 'USD_MINORISTA'
                              AND v.fecha <= g.fecha
                            ORDER BY v.fecha DESC)
       END AS monto_ars,
       CASE WHEN g.moneda = 'ARS' THEN NULL
            ELSE (SELECT TOP 1 v.valor
                  FROM dbo.indice_valor v
                  WHERE v.codigo = 'USD_MINORISTA'
                    AND v.fecha <= g.fecha
                  ORDER BY v.fecha DESC)
       END AS cotizacion_usada
FROM dbo.pago g;
GO

/* === LO PAGADO POR RUBRO ===================================
   sin_convertir cuenta los pagos en dolares para los que no hay
   cotizacion. Si es mayor a cero, el total esta de menos y hay que
   decirlo en la pantalla en vez de mostrarlo como si estuviera completo. */
CREATE OR ALTER VIEW dbo.v_pagado_rubro AS
SELECT obra_id,
       rubro_id,
       SUM(monto_ars) AS pagado,
       COUNT(*)       AS pagos,
       MAX(fecha)     AS ultimo_pago,
       SUM(CASE WHEN monto_ars IS NULL THEN 1 ELSE 0 END) AS sin_convertir
FROM dbo.v_pago_ars
WHERE anulado = 0
GROUP BY obra_id, rubro_id;
GO

CREATE OR ALTER VIEW dbo.v_pagado_presupuesto AS
SELECT presupuesto_id,
       SUM(monto_ars) AS pagado,
       COUNT(*)       AS pagos,
       MAX(fecha)     AS ultimo_pago,
       SUM(CASE WHEN monto_ars IS NULL THEN 1 ELSE 0 END) AS sin_convertir
FROM dbo.v_pago_ars
WHERE anulado = 0 AND presupuesto_id IS NOT NULL
GROUP BY presupuesto_id;
GO

/* === LO PAGADO POR RUBRO Y SUB-RUBRO =======================
   La dimension que pidio el spec: cuanto llevo pagado de mano de obra en
   toda la obra, sin importar el rubro.                                 */
CREATE OR ALTER VIEW dbo.v_pagado_subrubro AS
SELECT obra_id,
       subrubro_id,
       SUM(monto_ars) AS pagado,
       COUNT(*)       AS pagos,
       SUM(CASE WHEN monto_ars IS NULL THEN 1 ELSE 0 END) AS sin_convertir
FROM dbo.v_pago_ars
WHERE anulado = 0 AND subrubro_id IS NOT NULL
GROUP BY obra_id, subrubro_id;
GO

/* -- Controles -------------------------------------------------------
-- Que quedo convertido y a que cotizacion:
SELECT fecha, monto, moneda, cotizacion_usada, monto_ars
FROM dbo.v_pago_ars ORDER BY fecha DESC;

-- Pagos en dolares que no se pudieron convertir (deberia dar 0):
SELECT COUNT(*) FROM dbo.v_pago_ars WHERE monto_ars IS NULL AND anulado = 0;
   ------------------------------------------------------------------- */
