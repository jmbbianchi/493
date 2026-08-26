/* ============================================================
   obra493 - migracion 003
   La biblioteca: rubros, materiales, tipos de tarea y coeficientes.

   Sale del analisis de 493.xlsx (hoja Corralon_Mat, 798 formulas en
   55 columnas). Las 18 filas de la planilla se reducen a 15 tipos de
   tarea: algunas estaban duplicadas porque la misma tarea aparecia en
   dos ubicaciones. En el modelo el tipo se define una vez y se
   instancia N veces con distintos m2.

   La formula que corre debajo de todo esto:
     cantidad = TECHO( SUM_tareas( consumo x cantidad x (1+desperdicio) )
                       / unidades_x_pres )
   El redondeo va al final, sobre el total consolidado. Nunca por tarea.

   Tres insumos se salen del patron y por eso tienen unidades_x_pres = 1:
     - los ladrillos, cuyo coeficiente ya viene en unidades comerciales
     - el porcelanato, que se compra por m2
   Y la malla lleva su 15 % de solape como desperdicio propio, no como
   parte del coeficiente: 1 / 14,4 m2 de panio, mas el solape.

   NO se cargan precios: la tabla precio llega con la migracion 004,
   junto con el resto de la capa de plata.

   Idempotente: MERGE por codigo. Correrla dos veces actualiza, no duplica.
   ============================================================ */

SET NOCOUNT ON;
SET XACT_ABORT ON;

/* ═══ RUBROS ═════════════════════════════════════════════════ */
MERGE dbo.rubro AS t
USING (VALUES
  ('Movimiento de suelos',        10),
  ('Estructura de hormigon',      20),
  ('Mamposteria',                 30),
  ('Contrapisos y carpetas',      40),
  ('Revoques',                    50),
  ('Cubierta',                    60),
  ('Instalacion sanitaria',       70),
  ('Instalacion electrica',       80),
  ('Calefaccion',                 90),
  ('Carpinterias',               100),
  ('Cielorrasos',                110),
  ('Revestimientos y pisos',     120),
  ('Terminaciones',              130)
) AS s(nombre, orden)
ON t.nombre = s.nombre
WHEN MATCHED THEN UPDATE SET orden = s.orden
WHEN NOT MATCHED THEN INSERT (nombre, orden) VALUES (s.nombre, s.orden);

/* ═══ MATERIALES ═════════════════════════════════════════════
   El rubro es solo para agrupar en pantalla. El cemento se usa en
   media obra; esta en Mamposteria porque es donde mas pesa.
   unidades_x_pres es el divisor: cuanto trae la presentacion en la
   unidad en que se consume.
   ════════════════════════════════════════════════════════════ */
MERGE dbo.material AS t
USING (VALUES
  ('CEM-25',    'Cemento de albanileria',        'Mamposteria',            'kg', 'Bolsa 25 kg',      25.0000),
  ('CAL-25',    'Cal hidratada',                 'Mamposteria',            'kg', 'Bolsa 25 kg',      25.0000),
  ('ARE-M3',    'Arena gruesa',                  'Mamposteria',            'm3', 'Bolson 1 m3',       1.0000),
  ('PIE-1030',  'Piedra partida 10-30',          'Mamposteria',            'm3', 'Bolson 1 m3',       1.0000),
  ('LAD-H18',   'Ladrillo hueco 18x18x33',       'Mamposteria',            'u',  'Unidad',            1.0000),
  ('LAD-H12',   'Ladrillo hueco 12x18x33',       'Mamposteria',            'u',  'Unidad',            1.0000),
  ('LAD-H8',    'Ladrillo hueco 8x18x33',        'Mamposteria',            'u',  'Unidad',            1.0000),
  ('LAD-COM',   'Ladrillo comun visto',          'Mamposteria',            'u',  'Unidad',            1.0000),
  ('HID-CER',   'Hidrofugo Ceresita',            'Contrapisos y carpetas', 'L',  'Lata 20 L',        20.0000),
  ('MALLA-5',   'Malla del 5',                   'Contrapisos y carpetas', 'm2', 'Panio 6 x 2,4 m',  14.4000),
  ('NYL-200',   'Nylon 200 micrones',            'Contrapisos y carpetas', 'm2', 'Rollo 2 x 50 m',  100.0000),
  ('EPS-PERL',  'EPS en perlas',                 'Contrapisos y carpetas', 'm3', 'Bolsa 180 L',       0.1800),
  ('MEMB-560',  'Membrana liquida Sikalastic 560','Cubierta',              'L',  'Lata 20 L',        20.0000),
  ('PEG-PORC',  'Pegamento Weber Porcelanato Flex','Revestimientos y pisos','kg','Bolsa 25 kg',      25.0000),
  ('PAST-2',    'Pastina Weber',                 'Revestimientos y pisos', 'kg', 'Bolsa 2 kg',        2.0000),
  ('PORC-PISO', 'Porcelanato de piso',           'Revestimientos y pisos', 'm2', 'm2',                1.0000)
) AS s(codigo, nombre, rubro, unidad_consumo, presentacion, unidades_x_pres)
ON t.codigo = s.codigo
WHEN MATCHED THEN UPDATE SET
  nombre = s.nombre,
  rubro_id = (SELECT id FROM dbo.rubro WHERE nombre = s.rubro),
  unidad_consumo = s.unidad_consumo,
  presentacion = s.presentacion,
  unidades_x_pres = s.unidades_x_pres
WHEN NOT MATCHED THEN INSERT (codigo, nombre, rubro_id, unidad_consumo, presentacion, unidades_x_pres)
  VALUES (s.codigo, s.nombre, (SELECT id FROM dbo.rubro WHERE nombre = s.rubro),
          s.unidad_consumo, s.presentacion, s.unidades_x_pres);

/* ═══ TIPOS DE TAREA ═════════════════════════════════════════ */
MERGE dbo.tarea_tipo AS t
USING (VALUES
  ('CONT-TOSCA-12-CER',  'Contrapiso s/tosca 12 cm + carpeta 2 cm (ceramico)', 'Contrapisos y carpetas', 'm2'),
  ('CONT-TOSCA-12-MAD',  'Contrapiso s/tosca 12 cm + carpeta 2 cm (madera)',   'Contrapisos y carpetas', 'm2'),
  ('CONT-TOSCA-8-DECK',  'Contrapiso s/tosca 8 cm + carpeta 2 cm (deck)',      'Contrapisos y carpetas', 'm2'),
  ('CONT-LOSA-10',       'Contrapiso s/losa 10 cm + carpeta 2 cm',             'Contrapisos y carpetas', 'm2'),
  ('CONT-ALIV-MEMB',     'Contrapiso alivianado c/pendiente + membrana',       'Cubierta',               'm2'),
  ('COMP-GRANZA',        'Compactacion granza + solado piedra partida',        'Movimiento de suelos',   'm2'),
  ('ESC-CARP-3',         'Escalera pedadas y alzadas + carpeta 3 cm',          'Contrapisos y carpetas', 'm2'),
  ('MUR-H18',            'Muro ladrillo hueco 18x18x33',                       'Mamposteria',            'm2'),
  ('MUR-H12',            'Muro ladrillo hueco 12x18x33',                       'Mamposteria',            'm2'),
  ('MUR-H8',             'Muro ladrillo hueco 8x18x33',                        'Mamposteria',            'm2'),
  ('MUR-COM-VISTO',      'Muro ladrillo comun visto',                          'Mamposteria',            'm2'),
  ('REV-GRUESO',         'Revoque grueso por cara, 15 mm',                     'Revoques',               'm2'),
  ('REV-FINO',           'Revoque fino por cara, 5 mm',                        'Revoques',               'm2'),
  ('REVEST-CER',         'Revestimiento ceramico (cocina y banios)',           'Revestimientos y pisos', 'm2'),
  ('REVEST-LAD-VISTO',   'Revestimiento ladrillo visto sin junta',             'Revestimientos y pisos', 'm2')
) AS s(codigo, nombre, rubro, unidad_medicion)
ON t.codigo = s.codigo
WHEN MATCHED THEN UPDATE SET
  nombre = s.nombre,
  rubro_id = (SELECT id FROM dbo.rubro WHERE nombre = s.rubro),
  unidad_medicion = s.unidad_medicion
WHEN NOT MATCHED THEN INSERT (codigo, nombre, rubro_id, unidad_medicion)
  VALUES (s.codigo, s.nombre, (SELECT id FROM dbo.rubro WHERE nombre = s.rubro), s.unidad_medicion);

/* ═══ COEFICIENTES DE CONSUMO ════════════════════════════════
   Cuanto de cada material lleva una unidad de la tarea.
   desperdicio_pct NULL hereda del material, y ese de la obra.
   La malla es la unica con desperdicio propio: 15 % de solape.

   OJO con la malla: el consumo va en m2 de malla por m2 de tarea (= 1),
   NO en panios. El divisor a panios ya lo hace unidades_x_pres = 14,4.
   Ponerle 0,069444 aca divide dos veces y da 2 panios en vez de 20.

   OJO con pegamento y pastina: en el Excel aparecian en las 18 filas
   porque estaban precargados en la columna, pero solo se activaban
   con "Lleva Ceramico? = Si". Aca se cargan SOLO en las dos tareas
   que realmente llevan ceramico. Si sumas una tarea nueva con
   ceramico, hay que agregarle el par a mano.
   ════════════════════════════════════════════════════════════ */
;WITH src(tarea, material, consumo, desp) AS (
  SELECT * FROM (VALUES
    -- Contrapiso s/tosca 12 cm, terminacion ceramica
    ('CONT-TOSCA-12-CER', 'CEM-25',    36.200000, NULL),
    ('CONT-TOSCA-12-CER', 'ARE-M3',     0.075000, NULL),
    ('CONT-TOSCA-12-CER', 'PIE-1030',   0.111000, NULL),
    ('CONT-TOSCA-12-CER', 'HID-CER',    0.200000, NULL),
    ('CONT-TOSCA-12-CER', 'NYL-200',    1.100000, NULL),
    ('CONT-TOSCA-12-CER', 'MALLA-5',    1.000000, 15.00),
    ('CONT-TOSCA-12-CER', 'PEG-PORC',   5.000000, NULL),
    ('CONT-TOSCA-12-CER', 'PAST-2',     0.160000, NULL),
    -- Contrapiso s/tosca 12 cm, terminacion madera
    ('CONT-TOSCA-12-MAD', 'CEM-25',    36.200000, NULL),
    ('CONT-TOSCA-12-MAD', 'ARE-M3',     0.075000, NULL),
    ('CONT-TOSCA-12-MAD', 'PIE-1030',   0.111000, NULL),
    ('CONT-TOSCA-12-MAD', 'HID-CER',    0.200000, NULL),
    ('CONT-TOSCA-12-MAD', 'NYL-200',    1.100000, NULL),
    ('CONT-TOSCA-12-MAD', 'MALLA-5',    1.000000, 15.00),
    -- Contrapiso s/tosca 8 cm, deck
    ('CONT-TOSCA-8-DECK', 'CEM-25',    27.300000, NULL),
    ('CONT-TOSCA-8-DECK', 'ARE-M3',     0.057000, NULL),
    ('CONT-TOSCA-8-DECK', 'PIE-1030',   0.074000, NULL),
    ('CONT-TOSCA-8-DECK', 'HID-CER',    0.200000, NULL),
    ('CONT-TOSCA-8-DECK', 'NYL-200',    1.100000, NULL),
    ('CONT-TOSCA-8-DECK', 'MALLA-5',    1.000000, 15.00),
    -- Contrapiso sobre losa
    ('CONT-LOSA-10',      'CEM-25',    36.200000, NULL),
    ('CONT-LOSA-10',      'ARE-M3',     0.075000, NULL),
    ('CONT-LOSA-10',      'PIE-1030',   0.111000, NULL),
    ('CONT-LOSA-10',      'HID-CER',    0.200000, NULL),
    ('CONT-LOSA-10',      'MALLA-5',    1.000000, 15.00),
    -- Contrapiso alivianado con pendiente + membrana
    ('CONT-ALIV-MEMB',    'CEM-25',    20.000000, NULL),
    ('CONT-ALIV-MEMB',    'ARE-M3',     0.040000, NULL),
    ('CONT-ALIV-MEMB',    'HID-CER',    0.200000, NULL),
    ('CONT-ALIV-MEMB',    'EPS-PERL',   0.040000, NULL),
    ('CONT-ALIV-MEMB',    'MEMB-560',   1.100000, NULL),
    -- Compactacion granza + solado piedra partida
    ('COMP-GRANZA',       'ARE-M3',     0.050000, NULL),
    ('COMP-GRANZA',       'PIE-1030',   0.050000, NULL),
    -- Escalera
    ('ESC-CARP-3',        'CEM-25',    14.400000, NULL),
    ('ESC-CARP-3',        'ARE-M3',     0.030000, NULL),
    ('ESC-CARP-3',        'HID-CER',    0.300000, NULL),
    -- Muros
    ('MUR-H18',           'CEM-25',     7.000000, NULL),
    ('MUR-H18',           'ARE-M3',     0.019000, NULL),
    ('MUR-H18',           'CAL-25',     1.500000, NULL),
    ('MUR-H18',           'LAD-H18',   16.000000, NULL),
    ('MUR-H12',           'CEM-25',     5.900000, NULL),
    ('MUR-H12',           'ARE-M3',     0.016000, NULL),
    ('MUR-H12',           'CAL-25',     1.200000, NULL),
    ('MUR-H12',           'LAD-H12',   16.000000, NULL),
    ('MUR-H8',            'CEM-25',     5.200000, NULL),
    ('MUR-H8',            'ARE-M3',     0.015000, NULL),
    ('MUR-H8',            'CAL-25',     1.100000, NULL),
    ('MUR-H8',            'LAD-H8',    16.000000, NULL),
    ('MUR-COM-VISTO',     'CEM-25',     7.700000, NULL),
    ('MUR-COM-VISTO',     'ARE-M3',     0.021000, NULL),
    ('MUR-COM-VISTO',     'CAL-25',     1.600000, NULL),
    ('MUR-COM-VISTO',     'LAD-COM',   65.000000, NULL),
    -- Revoques
    ('REV-GRUESO',        'CEM-25',     5.200000, NULL),
    ('REV-GRUESO',        'ARE-M3',     0.015000, NULL),
    ('REV-GRUESO',        'CAL-25',     1.100000, NULL),
    ('REV-FINO',          'ARE-M3',     0.003000, NULL),
    ('REV-FINO',          'CAL-25',     2.000000, NULL),
    -- Revestimientos
    ('REVEST-CER',        'PEG-PORC',   5.000000, NULL),
    ('REVEST-CER',        'PAST-2',     0.160000, NULL),
    ('REVEST-CER',        'PORC-PISO',  1.000000, NULL),
    ('REVEST-LAD-VISTO',  'LAD-COM',   33.000000, NULL)
  ) v(tarea, material, consumo, desp)
)
MERGE dbo.coeficiente AS t
USING (
  SELECT tt.id AS tarea_tipo_id, m.id AS material_id, src.consumo, src.desp
  FROM src
  JOIN dbo.tarea_tipo tt ON tt.codigo = src.tarea
  JOIN dbo.material   m  ON m.codigo  = src.material
) AS s
ON t.tarea_tipo_id = s.tarea_tipo_id AND t.material_id = s.material_id
WHEN MATCHED THEN UPDATE SET consumo = s.consumo, desperdicio_pct = s.desp
WHEN NOT MATCHED THEN INSERT (tarea_tipo_id, material_id, consumo, desperdicio_pct)
  VALUES (s.tarea_tipo_id, s.material_id, s.consumo, s.desp);

/* ═══ VERIFICACION ═══════════════════════════════════════════
   Esperado: 13 rubros, 16 materiales, 15 tareas, 60 coeficientes.
   ════════════════════════════════════════════════════════════ */
SELECT 'rubro' AS tabla, COUNT(*) AS filas FROM dbo.rubro
UNION ALL SELECT 'material',     COUNT(*) FROM dbo.material
UNION ALL SELECT 'tarea_tipo',   COUNT(*) FROM dbo.tarea_tipo
UNION ALL SELECT 'coeficiente',  COUNT(*) FROM dbo.coeficiente;

/* Prueba del motor: 300 m2 de muro H18, sin desperdicio de obra.
   Tiene que dar 4.800 ladrillos, 2.100 kg de cemento (84 bolsas),
   5,7 m3 de arena y 450 kg de cal (18 bolsas). */
SELECT m.nombre,
       CAST(300 * c.consumo AS decimal(14,2))                         AS consumo_total,
       m.unidad_consumo,
       m.presentacion,
       CEILING(300 * c.consumo * (1 + ISNULL(c.desperdicio_pct,0)/100.0)
               / m.unidades_x_pres)                                   AS a_comprar
FROM dbo.coeficiente c
JOIN dbo.tarea_tipo tt ON tt.id = c.tarea_tipo_id
JOIN dbo.material   m  ON m.id  = c.material_id
WHERE tt.codigo = 'MUR-H18'
ORDER BY m.nombre;
