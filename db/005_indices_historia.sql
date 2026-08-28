/* ================================================================
   005_indices_historia.sql

   El motor de indexacion se apoya en una sola cosa: tener la serie
   historica completa. Hasta ahora el job traia solo los ultimos 30
   dias en cada corrida, asi que la historia empezaba el dia que se
   prendio el job. Inservible para ajustar una cuota contra un mes
   base de hace un anio.

   Esta migracion agrega:
     1. La marca de backfill, para que el job sepa si ya trajo la
        historia de una serie o todavia le falta.
     2. IPC_NIVEL: un indice de nivel construido encadenando las
        variaciones mensuales del BCRA. El BCRA publica la variacion
        (2,1 %), no el nivel, y con variaciones sueltas no se puede
        ajustar entre dos meses cualquiera. El ancla es arbitraria
        (100) porque todo se usa como cociente y el ancla se cancela.
     3. fn_coef_ipc, que implementa la regla acordada:
        para ajustar un pago se usa el IPC del mes ANTERIOR al pago.
        Devuelve NULL si ese indice todavia no se publico, y ese NULL
        es informacion: significa "cuota provisoria, falta el dato".

   Idempotente.
   ================================================================ */

/* -- 1. marca de backfill ----------------------------------------- */
IF COL_LENGTH('dbo.indice', 'backfill_ok') IS NULL
    ALTER TABLE dbo.indice ADD backfill_ok BIT NOT NULL
        CONSTRAINT DF_indice_backfill DEFAULT 0;
GO

IF COL_LENGTH('dbo.indice', 'desde_real') IS NULL
    ALTER TABLE dbo.indice ADD desde_real DATE NULL;
GO

/* IPC_NIVEL es derivada: no se baja de ningun lado, se calcula. */
IF NOT EXISTS (SELECT 1 FROM dbo.indice WHERE codigo = 'IPC_NIVEL')
    INSERT INTO dbo.indice (codigo, nombre, fuente, id_externo, periodicidad, backfill_ok)
    VALUES ('IPC_NIVEL', N'IPC nivel general (encadenado)', 'MANUAL', NULL, 'mensual', 1);
GO

/* -- 2. cobertura, para mirar de un vistazo que hay cargado -------- */
CREATE OR ALTER VIEW dbo.v_indice_cobertura AS
SELECT i.codigo,
       i.nombre,
       i.periodicidad,
       i.backfill_ok,
       COUNT(v.fecha)  AS valores,
       MIN(v.fecha)    AS desde,
       MAX(v.fecha)    AS hasta,
       DATEDIFF(day, MAX(v.fecha), CAST(SYSUTCDATETIME() AS date)) AS dias_de_atraso
FROM dbo.indice i
LEFT JOIN dbo.indice_valor v ON v.codigo = i.codigo
GROUP BY i.codigo, i.nombre, i.periodicidad, i.backfill_ok;
GO

/* -- 3. lectura del nivel para un mes ------------------------------ */
CREATE OR ALTER FUNCTION dbo.fn_ipc_nivel (@mes DATE)
RETURNS DECIMAL(20,6)
AS
BEGIN
    /* El ultimo nivel publicado dentro del mes pedido. NULL si ese mes
       todavia no salio: el INDEC publica alrededor del 12 al 14 del mes
       siguiente. */
    RETURN (SELECT TOP 1 v.valor
            FROM dbo.indice_valor v
            WHERE v.codigo = 'IPC_NIVEL'
              AND v.fecha >= DATEFROMPARTS(YEAR(@mes), MONTH(@mes), 1)
              AND v.fecha <= EOMONTH(@mes)
            ORDER BY v.fecha DESC);
END
GO

/* -- 4. el coeficiente --------------------------------------------- */
CREATE OR ALTER FUNCTION dbo.fn_coef_ipc (@fecha_base DATE, @fecha_pago DATE)
RETURNS DECIMAL(18,8)
AS
BEGIN
    /* REGLA ACORDADA CON EL PROVEEDOR
       "Se usa el indice del cierre del mes anterior para ajustar el
        siguiente. Hay delay pero se ajusta sobre la marcha."

       Entonces un pago de noviembre se ajusta con el IPC de octubre,
       que se publica alrededor del 12 de noviembre. Si el pago cae
       antes de esa fecha, esta funcion devuelve NULL y la cuota queda
       PROVISORIA: se paga con el ultimo coeficiente disponible y se
       corrige cuando sale el dato. Ese es el "ajuste sobre la marcha".

       NUNCA devolver 1 en vez de NULL. Un 1 se lee como "no hubo
       inflacion" y se cobra la diferencia en silencio. */
    DECLARE @n0 DECIMAL(20,6) = dbo.fn_ipc_nivel(DATEADD(month, -1, @fecha_base));
    DECLARE @n1 DECIMAL(20,6) = dbo.fn_ipc_nivel(DATEADD(month, -1, @fecha_pago));

    IF @n0 IS NULL OR @n1 IS NULL OR @n0 = 0
        RETURN NULL;

    RETURN CAST(@n1 AS DECIMAL(28,10)) / @n0;
END
GO

/* -- Controles -------------------------------------------------------
SELECT * FROM dbo.v_indice_cobertura ORDER BY codigo;

-- Cuanto se movio un presupuesto de mayo pagado en septiembre:
SELECT dbo.fn_coef_ipc('2026-05-01', '2026-09-01') AS coeficiente;

-- Los ultimos 12 niveles encadenados:
SELECT TOP 12 fecha, valor FROM dbo.indice_valor
WHERE codigo = 'IPC_NIVEL' ORDER BY fecha DESC;
   ------------------------------------------------------------------- */
