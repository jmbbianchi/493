-- 001_init.sql — schema mínimo para que el job de índices tenga dónde escribir.
-- Correr en: Azure Portal -> sql-obra493 -> db-obra493 -> Query editor
-- Idempotente: se puede correr varias veces.

IF OBJECT_ID('dbo.indice_valor', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.indice_valor (
        codigo   VARCHAR(32)   NOT NULL,   -- UVA, USD_MINORISTA, ICL, ICC_MATERIALES...
        fecha    DATE          NOT NULL,
        valor    DECIMAL(20,6) NOT NULL,
        cargado  DATETIME2(0)  NOT NULL CONSTRAINT DF_indice_cargado DEFAULT SYSUTCDATETIME(),
        CONSTRAINT PK_indice_valor PRIMARY KEY (codigo, fecha)
    );
END
GO

IF OBJECT_ID('dbo.indice', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.indice (
        codigo       VARCHAR(32)  NOT NULL CONSTRAINT PK_indice PRIMARY KEY,
        nombre       NVARCHAR(120) NOT NULL,
        fuente       VARCHAR(20)   NOT NULL,   -- BCRA | INDEC | MANUAL
        id_externo   VARCHAR(20)   NULL,       -- idVariable del BCRA
        periodicidad VARCHAR(10)   NOT NULL    -- diaria | mensual
    );

    INSERT INTO dbo.indice (codigo, nombre, fuente, id_externo, periodicidad) VALUES
      ('USD_MINORISTA',  N'Tipo de cambio minorista',        'BCRA', '4',  'diaria'),
      ('USD_MAYORISTA',  N'Tipo de cambio mayorista',        'BCRA', '5',  'diaria'),
      ('UVA',            N'Unidad de Valor Adquisitivo',     'BCRA', '31', 'diaria'),
      ('UVI',            N'Unidad de Vivienda',              'BCRA', '32', 'diaria'),
      ('ICL',            N'Índice Contratos de Locación',    'BCRA', '40', 'diaria'),
      ('IPC_MENSUAL',    N'Inflación mensual',               'BCRA', '27', 'mensual'),
      ('IPC_INTERANUAL', N'Inflación interanual',            'BCRA', '28', 'mensual'),
      ('ICC_GENERAL',    N'ICC nivel general',               'INDEC', NULL, 'mensual'),
      ('ICC_MATERIALES', N'ICC capítulo materiales',         'INDEC', NULL, 'mensual'),
      ('ICC_MANO_OBRA',  N'ICC capítulo mano de obra',       'INDEC', NULL, 'mensual');
END
GO

-- Consulta de control: cuánto trajo el job y hasta qué fecha
-- SELECT codigo, COUNT(*) AS valores, MAX(fecha) AS ultimo
-- FROM dbo.indice_valor GROUP BY codigo ORDER BY codigo;
