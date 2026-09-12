/* Proyecto independiente del computo. Ejecutar despues de 013.
   Copia unica y transaccional: el computo original y su historia se conservan.
   No volver a sincronizar ambos cronogramas despues de esta migracion. */
SET NOCOUNT ON;
SET XACT_ABORT ON;
BEGIN TRY
BEGIN TRANSACTION;

IF OBJECT_ID('dbo.proyecto_revision', 'U') IS NULL
CREATE TABLE dbo.proyecto_revision (
  obra_id uniqueidentifier NOT NULL PRIMARY KEY REFERENCES dbo.obra(id),
  version int NOT NULL DEFAULT 0,
  importado bit NOT NULL DEFAULT 0
);

IF OBJECT_ID('dbo.proyecto_rubro', 'U') IS NULL
CREATE TABLE dbo.proyecto_rubro (
  id uniqueidentifier NOT NULL DEFAULT newid() PRIMARY KEY,
  obra_id uniqueidentifier NOT NULL REFERENCES dbo.obra(id),
  nombre nvarchar(100) NOT NULL,
  orden int NOT NULL DEFAULT 0,
  rubro_origen_id int NULL REFERENCES dbo.rubro(id),
  CONSTRAINT uq_proyecto_rubro_obra UNIQUE (obra_id, id),
  CONSTRAINT uq_proyecto_rubro_nombre UNIQUE (obra_id, nombre)
);

IF OBJECT_ID('dbo.proyecto_tarea', 'U') IS NULL
CREATE TABLE dbo.proyecto_tarea (
  id uniqueidentifier NOT NULL DEFAULT newid() PRIMARY KEY,
  obra_id uniqueidentifier NOT NULL REFERENCES dbo.obra(id),
  rubro_id uniqueidentifier NOT NULL,
  padre_id uniqueidentifier NULL,
  nombre nvarchar(200) NOT NULL,
  tipo varchar(10) NOT NULL DEFAULT 'tarea',
  responsable nvarchar(160) NULL,
  fecha_inicio date NULL,
  fecha_fin date NULL,
  orden int NOT NULL DEFAULT 0,
  notas nvarchar(2000) NULL,
  computo_origen_id uniqueidentifier NULL,
  creado_en datetime2 NOT NULL DEFAULT sysutcdatetime(),
  CONSTRAINT uq_proyecto_tarea_obra UNIQUE (obra_id, id),
  CONSTRAINT fk_pt_rubro FOREIGN KEY (obra_id, rubro_id) REFERENCES dbo.proyecto_rubro(obra_id, id),
  CONSTRAINT fk_pt_padre FOREIGN KEY (obra_id, padre_id) REFERENCES dbo.proyecto_tarea(obra_id, id),
  CONSTRAINT ck_pt_tipo CHECK (tipo IN ('tarea','grupo','hito')),
  CONSTRAINT ck_pt_fechas CHECK ((fecha_inicio IS NULL AND fecha_fin IS NULL) OR
    (fecha_inicio IS NOT NULL AND fecha_fin IS NOT NULL AND fecha_fin >= fecha_inicio)),
  CONSTRAINT ck_pt_grupo CHECK (tipo <> 'grupo' OR fecha_inicio IS NULL),
  CONSTRAINT ck_pt_hito CHECK (tipo <> 'hito' OR fecha_inicio = fecha_fin),
  CONSTRAINT ck_pt_padre CHECK (padre_id <> id)
);

IF OBJECT_ID('dbo.proyecto_dependencia', 'U') IS NULL
CREATE TABLE dbo.proyecto_dependencia (
  obra_id uniqueidentifier NOT NULL,
  tarea_id uniqueidentifier NOT NULL,
  depende_de_id uniqueidentifier NOT NULL,
  dias_desfase int NOT NULL DEFAULT 0,
  PRIMARY KEY (obra_id, tarea_id, depende_de_id),
  FOREIGN KEY (obra_id, tarea_id) REFERENCES dbo.proyecto_tarea(obra_id, id),
  FOREIGN KEY (obra_id, depende_de_id) REFERENCES dbo.proyecto_tarea(obra_id, id),
  CHECK (tarea_id <> depende_de_id)
);

IF OBJECT_ID('dbo.proyecto_avance', 'U') IS NULL
CREATE TABLE dbo.proyecto_avance (
  id uniqueidentifier NOT NULL DEFAULT newid() PRIMARY KEY,
  obra_id uniqueidentifier NOT NULL,
  tarea_id uniqueidentifier NOT NULL,
  fecha date NOT NULL,
  avance_pct decimal(5,2) NOT NULL CHECK (avance_pct BETWEEN 0 AND 100),
  nota nvarchar(1000) NULL,
  creado_en datetime2 NOT NULL DEFAULT sysutcdatetime(),
  FOREIGN KEY (obra_id, tarea_id) REFERENCES dbo.proyecto_tarea(obra_id, id),
  CONSTRAINT uq_proyecto_avance_fecha UNIQUE (obra_id, tarea_id, fecha)
);

INSERT dbo.proyecto_revision (obra_id)
SELECT id FROM dbo.obra o WHERE NOT EXISTS
  (SELECT 1 FROM dbo.proyecto_revision p WHERE p.obra_id = o.id);

/* Fechas incompletas, invertidas o vinculos entre obras necesitan revision
   humana: fallar toda la copia es preferible a normalizar datos a escondidas. */
IF EXISTS (SELECT 1 FROM dbo.computo c JOIN dbo.proyecto_revision p ON p.obra_id=c.obra_id
  WHERE p.importado=0 AND ((c.fecha_inicio IS NULL AND c.fecha_fin IS NOT NULL)
    OR (c.fecha_inicio IS NOT NULL AND c.fecha_fin IS NULL) OR c.fecha_fin<c.fecha_inicio))
  THROW 50001, 'Hay fechas incompletas o invertidas en computo. Revisar antes de importar.', 1;

IF EXISTS (SELECT 1 FROM dbo.tarea_dependencia d
  JOIN dbo.computo a ON a.id=d.computo_id JOIN dbo.computo b ON b.id=d.depende_de_id
  JOIN dbo.proyecto_revision p ON p.obra_id=a.obra_id
  WHERE p.importado=0 AND a.obra_id<>b.obra_id)
  THROW 50002, 'Hay dependencias entre obras distintas. Revisar antes de importar.', 1;

/* Orden topologico sin recursion: si quedan nodos, hay un ciclo legado. */
SELECT c.id INTO #pendientes_proyecto FROM dbo.computo c
JOIN dbo.proyecto_revision p ON p.obra_id=c.obra_id AND p.importado=0;
WHILE EXISTS (SELECT 1 FROM #pendientes_proyecto)
BEGIN
  DELETE n FROM #pendientes_proyecto n WHERE NOT EXISTS (
    SELECT 1 FROM dbo.tarea_dependencia d
    JOIN #pendientes_proyecto anterior ON anterior.id=d.depende_de_id
    WHERE d.computo_id=n.id);
  IF @@ROWCOUNT=0
    THROW 50003, 'Hay ciclos de dependencias en el cronograma original. Revisar antes de importar.', 1;
END;
DROP TABLE #pendientes_proyecto;

INSERT dbo.proyecto_rubro (obra_id,nombre,orden,rubro_origen_id)
SELECT DISTINCT c.obra_id,r.nombre,r.orden,r.id
FROM dbo.computo c JOIN dbo.tarea_tipo t ON t.id=c.tarea_tipo_id
JOIN dbo.rubro r ON r.id=t.rubro_id
JOIN dbo.proyecto_revision p ON p.obra_id=c.obra_id AND p.importado=0
WHERE NOT EXISTS (SELECT 1 FROM dbo.proyecto_rubro pr WHERE pr.obra_id=c.obra_id AND pr.rubro_origen_id=r.id);

INSERT dbo.proyecto_tarea (id,obra_id,rubro_id,nombre,fecha_inicio,fecha_fin,orden,notas,computo_origen_id)
SELECT c.id,c.obra_id,r.id,c.tarea,c.fecha_inicio,c.fecha_fin,
  ROW_NUMBER() OVER (PARTITION BY c.obra_id,c.rubro_id ORDER BY c.tarea,c.id),
  CONCAT('Importado del computo.',CASE WHEN c.subrubro IS NOT NULL THEN CONCAT(' Subrubro: ',c.subrubro) ELSE '' END,
    CASE WHEN c.ubicacion IS NOT NULL THEN CONCAT(' Ubicacion: ',c.ubicacion) ELSE '' END),c.id
FROM dbo.v_cronograma c
JOIN dbo.proyecto_revision p ON p.obra_id=c.obra_id AND p.importado=0
JOIN dbo.proyecto_rubro r ON r.obra_id=c.obra_id AND r.rubro_origen_id=c.rubro_id
WHERE NOT EXISTS (SELECT 1 FROM dbo.proyecto_tarea t WHERE t.id=c.id);

/* El motor anterior permitia iniciar el dia del fin. Restar uno preserva
   ese desfase al pasar a fechas inclusivas fin-inicio. */
INSERT dbo.proyecto_dependencia (obra_id,tarea_id,depende_de_id,dias_desfase)
SELECT t.obra_id,d.computo_id,d.depende_de_id,d.dias_desfase-1
FROM dbo.tarea_dependencia d JOIN dbo.proyecto_tarea t ON t.id=d.computo_id
JOIN dbo.proyecto_revision p ON p.obra_id=t.obra_id AND p.importado=0
WHERE NOT EXISTS (SELECT 1 FROM dbo.proyecto_dependencia x WHERE x.tarea_id=d.computo_id AND x.depende_de_id=d.depende_de_id);

INSERT dbo.proyecto_avance (id,obra_id,tarea_id,fecha,avance_pct,nota,creado_en)
SELECT a.id,t.obra_id,t.id,a.fecha,a.avance_pct,a.nota,a.creado_en
FROM dbo.avance_tarea a JOIN dbo.proyecto_tarea t ON t.id=a.computo_id
JOIN dbo.proyecto_revision p ON p.obra_id=t.obra_id AND p.importado=0
WHERE NOT EXISTS (SELECT 1 FROM dbo.proyecto_avance x WHERE x.id=a.id);

UPDATE dbo.proyecto_revision SET importado=1 WHERE importado=0;
COMMIT TRANSACTION;
END TRY
BEGIN CATCH
  IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
  THROW;
END CATCH;
GO

/* Verificacion antes/despues: comparar conteos y fechas, avances y vinculos.
SELECT obra_id,COUNT(*) tareas FROM dbo.proyecto_tarea GROUP BY obra_id;
SELECT c.id FROM dbo.computo c LEFT JOIN dbo.proyecto_tarea t ON t.computo_origen_id=c.id WHERE t.id IS NULL;
SELECT a.id FROM dbo.avance_tarea a LEFT JOIN dbo.proyecto_avance p ON p.id=a.id WHERE p.id IS NULL;
SELECT * FROM dbo.proyecto_revision;
   La segunda ejecucion debe dejar los mismos conteos y no pisar ediciones.
   Recuperacion: desplegar la version anterior. Las tablas originales siguen
   intactas; exportar primero cualquier dato nuevo, que no se copia al legado. */
