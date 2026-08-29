/* ============================================================
   obra493 - migracion 012
   Plazos, avance y dependencias.

   LA PREGUNTA QUE DESTRABA
   ------------------------
   De las tres que justifican la app, esta era la unica sin contestar:
   "¿estas pagando mas rapido de lo que la obra avanza?". No se podia
   contestar porque no habia UNA SOLA fecha de obra en toda la base. Los
   pagos tenian fecha; no habia contra que compararlos.

   EL AVANCE ES UNA SERIE, NO UN NUMERO
   ------------------------------------
   avance_tarea guarda historia con fecha, no un porcentaje que se pisa.
   Si se pisara, la curva de avance no existiria: habria un punto, el de
   hoy, y nada con que dibujar la linea que se cruza con la de pagos. Es
   la misma razon por la que los pagos no son un saldo.

   Un avance por tarea y por dia: recargar el mismo dia corrige, no
   duplica. Nadie mide el avance dos veces en la misma jornada.

   EL AVANCE SE CARGA POR TAREA Y SUBE AL RUBRO
   --------------------------------------------
   Decision 13. En la tarea es donde alguien puede pararse y decir "esto
   va por la mitad". El del rubro no se tipea: sale de sus tareas,
   ponderadas por lo que cada una cuesta. Ponderar por cantidad de tareas
   diria que terminar la escalera pesa lo mismo que levantar todos los
   muros.

   LAS DEPENDENCIAS CUELGAN DEL COMPUTO, NO DE LA BIBLIOTECA
   ----------------------------------------------------------
   "El revoque de la planta alta va despues de la mamposteria de la
   planta alta" es una relacion entre dos filas concretas de ESTA obra,
   no entre dos tipos de tarea. En la biblioteca no tendria sentido: la
   misma tarea aparece cuatro veces en lugares distintos.

   Idempotente.
   ============================================================ */

SET NOCOUNT ON;
SET XACT_ABORT ON;
GO

/* === 1. LA TAREA COMPUTADA GANA FECHAS ===================== */
IF COL_LENGTH('dbo.computo', 'fecha_inicio') IS NULL
    ALTER TABLE dbo.computo ADD fecha_inicio date NULL;
GO

IF COL_LENGTH('dbo.computo', 'fecha_fin') IS NULL
    ALTER TABLE dbo.computo ADD fecha_fin date NULL;
GO

/* Para agrupar el cronograma como pidio el usuario: rubro y sub-rubro.
   Nullable porque una tarea vieja no lo tiene y tiene que seguir siendo
   valida; la pantalla la muestra igual, sin sub-rubro. */
IF COL_LENGTH('dbo.computo', 'subrubro_id') IS NULL
    ALTER TABLE dbo.computo ADD subrubro_id int NULL REFERENCES dbo.subrubro(id);
GO

/* === 2. EL AVANCE, COMO SERIE ============================== */
IF OBJECT_ID('dbo.avance_tarea','U') IS NULL
CREATE TABLE dbo.avance_tarea (
  id         uniqueidentifier NOT NULL DEFAULT newid() PRIMARY KEY,
  computo_id uniqueidentifier NOT NULL REFERENCES dbo.computo(id) ON DELETE CASCADE,
  fecha      date NOT NULL,
  avance_pct decimal(5,2) NOT NULL,
  nota       nvarchar(300) NULL,
  creado_en  datetime2 NOT NULL DEFAULT sysutcdatetime(),
  CONSTRAINT ck_avance_pct CHECK (avance_pct >= 0 AND avance_pct <= 100),
  -- Uno por tarea y por dia: volver a cargar el mismo dia corrige en vez
  -- de duplicar. Nadie mide el avance dos veces en la misma jornada.
  CONSTRAINT uq_avance_dia UNIQUE (computo_id, fecha)
);
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name='ix_avance_fecha')
  CREATE INDEX ix_avance_fecha ON dbo.avance_tarea(fecha);
GO

/* === 3. DEPENDENCIAS ======================================= */
IF OBJECT_ID('dbo.tarea_dependencia','U') IS NULL
CREATE TABLE dbo.tarea_dependencia (
  computo_id    uniqueidentifier NOT NULL REFERENCES dbo.computo(id) ON DELETE CASCADE,
  -- Sin CASCADE de este lado: dos caminos de borrado en cascada hacia la
  -- misma tabla los rechaza SQL Server. Lo limpia el backend al borrar.
  depende_de_id uniqueidentifier NOT NULL REFERENCES dbo.computo(id),
  -- Dias entre que termina la anterior y arranca esta. Puede ser negativo:
  -- el revoque puede empezar antes de que la mamposteria termine del todo.
  dias_desfase  int NOT NULL CONSTRAINT DF_dep_desfase DEFAULT 0,
  PRIMARY KEY (computo_id, depende_de_id),
  CONSTRAINT ck_dep_no_a_si_misma CHECK (computo_id <> depende_de_id)
);
GO

/* === 4. EL ULTIMO AVANCE DE CADA TAREA =====================
   La serie completa sirve para la curva; para "como viene hoy" alcanza
   con el ultimo, y esto evita repetir el mismo TOP 1 en cinco consultas. */
CREATE OR ALTER VIEW dbo.v_avance_tarea_actual AS
SELECT a.computo_id, a.fecha, a.avance_pct
FROM dbo.avance_tarea a
WHERE a.fecha = (SELECT MAX(b.fecha) FROM dbo.avance_tarea b
                 WHERE b.computo_id = a.computo_id);
GO

/* === 5. EL CRONOGRAMA, ARMADO ==============================
   Una fila por tarea computada con todo lo que la pantalla necesita
   menos el peso, que se calcula aparte porque necesita los precios.   */
CREATE OR ALTER VIEW dbo.v_cronograma AS
SELECT c.id,
       c.obra_id,
       t.rubro_id,
       r.nombre  AS rubro,
       r.orden   AS rubro_orden,
       c.subrubro_id,
       s.nombre  AS subrubro,
       COALESCE(ot.nombre, t.nombre) AS tarea,
       t.unidad_medicion,
       c.ubicacion,
       c.cantidad,
       c.fecha_inicio,
       c.fecha_fin,
       ISNULL(av.avance_pct, 0) AS avance_pct,
       av.fecha                 AS avance_fecha,
       CASE WHEN av.avance_pct IS NULL THEN 0 ELSE 1 END AS tiene_avance
FROM dbo.computo c
JOIN dbo.tarea_tipo t ON t.id = c.tarea_tipo_id
JOIN dbo.rubro r      ON r.id = t.rubro_id
LEFT JOIN dbo.subrubro s   ON s.id = c.subrubro_id
LEFT JOIN dbo.obra_tarea ot ON ot.obra_id = c.obra_id AND ot.tarea_tipo_id = t.id
LEFT JOIN dbo.v_avance_tarea_actual av ON av.computo_id = c.id;
GO

/* -- Controles -------------------------------------------------------
SELECT COUNT(*) AS con_fechas FROM dbo.computo WHERE fecha_inicio IS NOT NULL;
SELECT * FROM dbo.v_cronograma ORDER BY rubro_orden, fecha_inicio;
SELECT * FROM dbo.v_avance_tarea_actual;
   ------------------------------------------------------------------- */
