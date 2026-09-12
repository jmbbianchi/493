# Proyecto: primer bloque de la reescritura

Implementación local del 12-sep-2026. Alcance funcional:
[PRODUCTO.md](PRODUCTO.md). No desplegada ni verificada en producción.

## Comportamiento implementado

La entrada Proyecto conserva la ruta `/obra/:obraId/como-viene`, ahora con
tabla de tareas y Gantt sincronizados. Permite crear y editar rubros propios
de cada obra, tareas, grupos anidados e hitos sin cargar cómputo ni presupuesto.

Los formularios editan nombre, responsable, ubicación en la jerarquía, orden,
fechas, notas y múltiples predecesoras. Se abren desde el nombre o la barra.
La búsqueda incluye tarea, responsable y rubro. La agrupación por responsable
presenta las tareas e hitos sin duplicarlos dentro de sus grupos.

Los grupos contienen subtareas y calculan sus fechas y avance. El tipo se
elige al crear y no se transforma después: evita descartar historia o
dependencias al convertir una tarea con ejecución en un contenedor.

El avance se registra separado de la planificación: porcentaje acumulado,
fecha y observación, con historial consultable. Una medición del mismo día
corrige la anterior. Se rechazan fechas futuras y valores fuera de 0–100 %;
un hito admite 0 o 100 %. El avance de grupos y obra usa promedio simple de
hojas, sin contar grupos; las hojas sin mediciones aportan cero y se indica
el criterio. La ponderación definitiva queda pendiente de diseñar.

## Reglas de programación de esta versión

- Días corridos y fechas inclusivas; duración de tarea = fin − inicio + 1.
- Hitos con una sola fecha y duración cero.
- Dependencias fin–inicio: inicio mínimo = fin de predecesora + 1 + desfase.
- Desfases negativos admiten superposición.
- Una tarea puede tener varias predecesoras. Se toma el inicio mínimo más
  tardío y se propagan las demoras en orden topológico conservando duración.
- Adelantar una predecesora no adelanta sus sucesoras automáticamente.
- Las dependencias entre tareas sin fechas se conservan y se hacen efectivas
  al programarlas. El editor señala predecesoras sin fecha.
- Ciclos, fechas invertidas, jerarquías inválidas y referencias a otra obra
  se rechazan antes de persistir.
- Las dependencias se vinculan entre tareas e hitos; los grupos resumen sus
  hojas y no funcionan como predecesoras.

No incluye todavía arrastre de barras, calendario laboral, línea base, camino
crítico, otras clases de dependencia, borrado/archivo ni enlaces financieros.
La edición del Gantt se realiza mediante el panel lateral.

## API y almacenamiento

Nuevo router `backend/app/routers/proyecto.py`, bajo
`/api/obras/{obra_id}/proyecto`:

| Método y ruta relativa | Operación |
|---|---|
| GET raíz | Rubros, tareas, resumen, versión y permiso de edición |
| POST /rubros | Crear rubro |
| PUT /rubros/{id} | Editar nombre y orden |
| POST /tareas | Crear tarea, grupo o hito |
| PUT /tareas/{id} | Actualizar tarea y reemplazar sus dependencias en la misma transacción |
| GET /tareas/{id}/avances | Consultar historial |
| POST /tareas/{id}/avances | Registrar o corregir medición |

Las mutaciones reciben `version`, devuelta por GET. Cada escritura bloquea
la fila de la obra hasta terminar, verifica la revisión y la incrementa.
Un formulario obsoleto recibe 409. Tarea, dependencias y desplazamientos
comparten una conexión efímera y una transacción; cualquier fallo revierte
el conjunto. Se reutiliza `exige_acceso`: lectura puede consultar, editor
puede modificar. La autenticación compartida anterior sigue siendo una
limitación para comercializar la app.

Las tablas nuevas son `proyecto_revision`, `proyecto_rubro`, `proyecto_tarea`,
`proyecto_dependencia` y `proyecto_avance`. Sus claves foráneas compuestas
refuerzan que rubros, tareas, padres y dependencias pertenezcan a la misma obra.

## Migración y activación pendiente

`db/014_proyecto.sql` se ejecuta manualmente después de las migraciones
anteriores, con respaldo y una ventana sin edición del cronograma original.
Primero debe probarse sobre una copia en SQL Server. El entorno local de esta
sesión no tenía Docker/SQL Server disponible; no se ejecutó este script.

La migración copia los rubros utilizados, las tareas del cómputo, sus fechas,
dependencias y todo el historial de avance. Conserva los identificadores de
las tareas, un vínculo de origen y la ubicación/subrubro en notas. Las tablas
originales permanecen intactas. La importación queda marcada por obra: otra
ejecución no debe sobrescribir las ediciones realizadas en Proyecto.

El motor anterior permitía inicio en el mismo día del fin de la predecesora:
se resta un día al desfase importado para conservar esa relación. El script
aborta íntegramente si detecta fechas incompletas o invertidas, ciclos o
dependencias entre obras. Los casos detectados requieren revisión, no
corrección automática.

Verificar antes de activar:

1. Comparar cantidades de tareas y mediciones con el origen, fechas y
   predecesoras. Hay consultas de control al pie del script.
2. Ejecutar una segunda vez sobre la copia: conteos y ediciones deben
   permanecer iguales.
3. Probar creación y edición, la propagación de una cadena con varias
   predecesoras, lectura y conflicto entre dos sesiones usando SQL Server.
4. Aplicar la migración verificada y luego desplegar backend y frontend.

Sin la migración, la API nueva devuelve 503 con un mensaje controlado.
Recuperación: volver a la versión anterior de la aplicación; no borrar
las tablas nuevas. Exportar previamente los datos generados en Proyecto,
porque no se sincronizan hacia el cronograma anterior.

Los endpoints antiguos de cronograma permanecen por compatibilidad, pero
ya no alimentan la pantalla Proyecto. La calculadora conserva su cómputo.
## Segundo bloque: presupuestos y tareas

El backend ya incorpora `GET /proyecto/presupuestos` y
`PUT /proyecto/presupuestos/{id}/tareas`. El vínculo reemplazable guarda sólo
la relación: no modifica el presupuesto, sus cuotas ni pagos. Se aceptan
tareas e hitos de la misma obra; los grupos se rechazan porque ya resumen sus
hojas. La respuesta incluye el período de ejecución que surge de las tareas.

`backend/app/programacion_pagos.py` calcula un escenario independiente de los
pagos reales. Para un servicio como el cementista genera 20 % anticipado y el
saldo en pagos semanales, incorporando la última semana incompleta y cerrando
centavos en una sola operación. Para materiales permite pago anticipado total.
Si alguna tarea vinculada no tiene fechas, el calendario no se genera y lo
explica; no se inventa una fecha.

La migración `db/015_proyecto_presupuestos.sql` crea los vínculos y guarda la
huella de la última programación aplicada. La API todavía muestra los planes
de pago existentes del módulo de presupuestos; el panel visual para elegir
tareas y comparar compromisos con desembolsos queda para el siguiente paso.

## Estado de Azure verificado

El 12-sep-2026 se consultó el entorno en modo lectura. La suscripción está
habilitada; el backend está `Running` en puerto 8080 con mínimo de réplicas 0,
SQL está `Paused` con límite gratuito y `AutoPause`, el sitio es Free y las
últimas tres ejecuciones del job de índices terminaron `Succeeded`. GitHub
Actions conserva sus variables y secretos de despliegue. No se ejecutó ninguna
mutación en Azure ni ninguna migración sobre la base real.

## Verificación local

Con Python 3.12 y las versiones de `backend/requirements.txt`:

```powershell
cd backend
.venv/Scripts/python.exe -m unittest discover -s tests -v
```

29 pruebas de reglas, permisos y contratos HTTP pasaron. Las pruebas de API
usan un cursor simulado: comprueban el manejo de commit/rollback y revisión,
pero no sustituyen la verificación real de T-SQL o bloqueos concurrentes.

```powershell
cd frontend
npm run build
```

Build de producción verificado. Para la prueba de navegador, iniciar Vite
y ejecutar `node tests/proyecto.browser.cjs` con Playwright disponible.
`PLAYWRIGHT_MODULE` permite indicar su instalación y `BROWSER_EXECUTABLE`
un Chrome/Chromium instalado. `PREVIEW_URL` cambia el servidor local.

El test intercepta exclusivamente sus requests de API con datos ficticios,
sin usar credenciales ni base reales. Comprueba carga, jerarquía, búsqueda,
agrupación, múltiples dependencias, alta sin fechas, historial, conservación
del formulario en conflicto, solo lectura, cambio de obra, uso móvil y
recuperación de error. Guarda capturas en `frontend/test-results/`.

## Validación SQL pendiente

La sesión del 12-sep-2026 no pudo ejecutar SQL Server local: Docker Desktop no
está levantado. Se corrigió el escape del password en `docker-compose.dev.yml`;
Compose ahora conserva literalmente `Obra493$Local`. Tampoco se aplicaron
migraciones en Azure. Cuando Docker esté disponible, ejecutar:

```powershell
docker compose -f docker-compose.dev.yml up -d
docker compose -f docker-compose.dev.yml ps
```

Luego aplicar, en este orden, `db/001_init.sql` a `db/015_proyecto_presupuestos.sql`
sobre una base local limpia, verificando los controles al pie de 014 y 015.
La base local no contiene una copia de la obra real; para validar la importación
con esos datos hace falta un backup restaurable o ejecutar las migraciones en
el Query editor de Azure después de revisar el backup.

Para empezar de cero sin eliminar recursos Azure se preparó
`db/016_reset_datos.sql`. Borra datos operativos y relaciones de obras, pero
conserva la estructura, biblioteca global, índices BCRA e identidades. Debe
ejecutarse en `db-obra493` antes de `014` y `015`, dentro del Query editor,
después de verificar la base y el backup. Los controles del final tienen que
mostrar cero en las tablas operativas. Luego la primera obra se crea desde la
aplicación.
