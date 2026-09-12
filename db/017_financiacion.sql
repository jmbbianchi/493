/* Condiciones del préstamo de cada obra. Una obra puede tener un préstamo
   activo; las proyecciones se recalculan con la fecha y los índices vigentes. */
IF OBJECT_ID('dbo.financiacion','U') IS NULL
BEGIN
  CREATE TABLE dbo.financiacion (
    obra_id uniqueidentifier NOT NULL PRIMARY KEY REFERENCES dbo.obra(id),
    capital decimal(18,2) NOT NULL,
    tasa_anual decimal(9,4) NOT NULL DEFAULT 0,
    meses int NOT NULL,
    inicio date NOT NULL,
    ajuste_mensual decimal(9,4) NOT NULL DEFAULT 0,
    adelanto_meses int NOT NULL DEFAULT 0,
    actualizado_en datetime2 NOT NULL DEFAULT SYSUTCDATETIME(),
    CONSTRAINT ck_fin_capital CHECK (capital > 0),
    CONSTRAINT ck_fin_meses CHECK (meses BETWEEN 1 AND 480),
    CONSTRAINT ck_fin_tasa CHECK (tasa_anual >= 0),
    CONSTRAINT ck_fin_ajuste CHECK (ajuste_mensual BETWEEN 0 AND 100),
    CONSTRAINT ck_fin_adelanto CHECK (adelanto_meses BETWEEN 0 AND 480)
  );
END;
