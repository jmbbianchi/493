# Obra — de calculadora a gestor de obra

Plan de trabajo para Claude Code. Escrito el 28-ago-2026.

Este archivo es la fuente de verdad del proyecto. Si algo de acá contradice
lo que parece razonable, gana este archivo: casi todo lo que dice fue
aprendido rompiendo algo primero.

---

## 1. Qué es esto

Un gestor de proyectos de obra. Nació como la planilla `493.xlsx` con la que
Jose está construyendo su casa en el lote 493, y la intención es que después
se le pueda ofrecer a arquitectos: cada uno carga sus obras, ve solo las
suyas, y el motor es el mismo para todos.

**La idea central, y la única que hay que tener siempre presente:**

> Un rubro de obra no tiene un número. Tiene tres.
>
> - **Teórico** — lo que dice el cómputo (m² × rendimiento × precio).
> - **Presupuestado** — lo que te cotizó el corralón o el albañil. No es un
>   monto: es un acuerdo con un plan de pago que se mueve con la inflación.
> - **Pagado** — lo que efectivamente salió de la cuenta, con el coeficiente
>   del mes en que se pagó.
>
> La app existe para que los tres estén al lado y las diferencias se lean
> solas. Producir el primero y presentarlo como respuesta fue el error que
> ya cometimos una vez.

Dos preguntas justifican la app entera:

- ¿Te cotizaron caro? → teórico contra presupuestado.
- ¿Cuánto falta pagar? → presupuestado contra pagado.

Y una tercera, que es la que hace que el Gantt valga la pena: **¿estás
pagando más rápido de lo que la obra avanza?**

### El número que lo explica todo

Presupuesto del cementista: $85.000.000. Anticipo 20 % que no indexa, saldo
en 14 cuotas semanales con ajuste mensual. A 1,9 % mensual, el total real es
**$88.002.640**. Ese número no está escrito en ningún papel, ni el del
proveedor ni el de Jose. Con doce rubros arreglados así, la diferencia es la
obra entera desviándose sin que nadie la vea.

Hacer visible ese número es el producto.

---

## 2. Estado actual (verificado, no supuesto)

### Infraestructura, toda en Azure, resource group `rg-obra493`

| Recurso | Estado |
|---|---|
| Azure SQL serverless `db-obra493` | andando, free offer, auto-pause 60 min |
| Container App `obra493-backend` | andando, min-replicas 0, puerto 8080 |
| Container Apps Job `obra493-indices` | andando, cron 09:00 UTC |
| Static Web App | andando, `proud-cliff-0e19abc0f.7.azurestaticapps.net` |
| Storage account + container `documentos` | **creado y sin usar** |
| GitHub Actions OIDC | andando, dos federated credentials |

El backend ya tiene `STORAGE_ACCOUNT`, `STORAGE_KEY` y `STORAGE_CONTAINER`
en el environment. Para documentos e imágenes no hace falta infra nueva.

### Base de datos

Migraciones aplicadas: `001_init`, `002_core`, `003_biblioteca`,
`004_precios_y_edicion`, `005_indices_historia`, `006_presupuestos`,
`007_pagos`, `008_mano_obra`, `009_subrubros`, `010_pago_en_moneda`,
`011_documentos`, `012_cronograma`.

> **La 005 figuraba como aplicada y no lo estaba.** Se corrió recién el
> 28-ago-2026, y por eso el job de índices venía muriendo con `Invalid
> column name 'backfill_ok'`: por eso `IPC_NIVEL` estaba vacío. Antes de
> dar una migración por aplicada conviene mirar `sys.tables`, no el
> archivo del repo.

Tablas: `usuario`, `obra`, `obra_usuario`, `rubro`, `material`, `tarea_tipo`,
`coeficiente`, `obra_coeficiente`, `obra_material`, `obra_tarea`, `proveedor`,
`computo`, `computo_coeficiente`, `precio`, `indice`, `indice_valor`,
`presupuesto`, `plan_tramo`, `cuota`, `pago`, `computo_material`,
`subrubro`, `presupuesto_item`, `documento`, `avance_tarea`,
`tarea_dependencia`.

Funciones: `fn_ipc_nivel`, `fn_coef_ipc`. Vistas: `v_precio_vigente`,
`v_indice_cobertura`, `v_presupuestado_rubro`, `v_pagado_rubro`,
`v_pagado_presupuesto`, `v_tarea_sin_coeficiente`.

Series de índices completas desde 2016. `IPC_NIVEL` tiene 127 meses
encadenados hasta jul-2026.

### Backend (FastAPI)

`/api/obras` CRUD · `/api/obras/{id}/computo` CRUD + motor
`/lista-materiales` · `/materiales` · `/tareas` · `/rendimientos` ·
`/precios` · `/rubros` · `/api/indices/ultimo`.

### Frontend (React + Vite, con router)

Barra lateral con selector de obra y siete secciones: Pagar, Cómo viene,
Rubros, Cómputo, Lista de compra, Materiales y precios, Rendimientos. La
obra vive en la URL (`/obra/:obraId/:seccion`). Los presupuestos y sus
planes de pago viven adentro del rubro.

### Lo que NO existe

- Entregas: remito con detalle por material.
- Plazos, avance, dependencias. **No hay una sola fecha en la base.**
- Login. El acceso es una clave compartida (`APP_KEY`), no autenticación.
- Menú lateral, rutas, cualquier cosa que parezca un gestor.

---

## 3. Decisiones tomadas — no volver a discutirlas

1. **No hay multi-tenant.** Se comparte por proyecto: `obra_usuario` con rol
   `editor` o `lectura`. Nadie tiene un "espacio de trabajo".
2. **La biblioteca es un punto de partida, no un catálogo.** Todo material,
   tarea y rendimiento se puede editar, agregar u ocultar por obra, sin tocar
   la biblioteca global. Ese es el mecanismo `obra_material` / `obra_tarea` /
   `obra_coeficiente` con `oculto`.
3. **El precio no se edita: se agrega.** Cada cambio es una fila nueva en
   `precio`. `v_precio_vigente` resuelve cuál rige.
4. **El anticipo confirma el precio.** Pagar el anticipo es lo que congela el
   número del presupuesto. No "aceptar", no "aprobar": pagar.
5. **Coeficiente de ajuste** = `IPC(mes anterior al pago) / IPC(mes anterior
   a la base)`. Si ese índice todavía no se publicó, la función devuelve
   **NULL**, nunca 1. El NULL es la señal de cuota provisoria.
6. **La mano de obra se computa igual que los materiales.** Lo que cambia es
   qué la da por cumplida: la mano de obra se cumple trabajando (avance), los
   materiales se cumplen entregando (remito).
7. **El costo en la tarea es opcional.** La plata vive en el rubro. Forzar
   que cada peso cuelgue de una tarea es trabajo que nadie va a hacer.
8. **Un pago se imputa a rubro Y a presupuesto**, no a uno u otro.
9. **Plazos: fechas duras teóricas + dependencias que empujan.** Si una tarea
   se corre dos semanas, las que dependen de ella se corren también. No es un
   motor de camino crítico; eso es otro producto.
10. **La moneda del presupuesto es peso o dolar oficial del BCRA**, nada
    mas. Los dos ya se guardan diarios, asi que no entra ninguna fuente
    nueva al job de indices. El blue y el MEP quedan afuera: si algun dia
    se pacta contra el paralelo, es una fuente nueva y una decision nueva.
11. **Un pago se imputa a un solo presupuesto.** `pago` lleva
    `presupuesto_id` y `cuota_id` nullables y no hay tabla de imputaciones.
    Si una transferencia cubrio dos cosas, se cargan dos pagos. Partir un
    pago obligaria a una pantalla de reparto, y ahi se van los quince
    segundos parado en la obra, que es el criterio de aceptacion de E3.
12. **El proyectado extrapola con la última variación mensual publicada.**
    El coeficiente real de una cuota futura no existe: el índice todavía no
    salió. Dejarla en nominal diría que no hay inflación; dejarla afuera
    diría que la cuota no cuesta. Así que se capitaliza la última variación
    del INDEC y la respuesta dice cuál usó y de qué mes, para que el número
    se pueda discutir. El **real** sigue sumando sólo coeficientes
    publicados: proyectado y real son columnas distintas justamente porque
    uno es estimación y el otro es hecho.
13. **El avance se carga por tarea y sube al rubro.** Dentro de cada rubro
    hay tareas, y es en la tarea donde alguien puede decir "esto va por la
    mitad". El avance del rubro no se tipea: sale de sus tareas, ponderadas
    por lo que cada una cuesta. Ponderar por cantidad de tareas diría que
    terminar la escalera pesa lo mismo que levantar todos los muros.

14. **El costo de un material pertenece al rubro donde se cargó su
    presupuesto**, no al rubro que el material tiene en la biblioteca. La
    plata sigue al acuerdo con el proveedor, no a la clasificación del
    catálogo: el cemento se compra una vez y se usa en cuatro rubros, pero
    lo pagaste dentro de un presupuesto que era de un rubro solo. La
    agrupación por rubro de biblioteca se queda donde tiene sentido -- la
    lista de compra, porque el cemento se compra junto -- y no manda en la
    comparación de las tres columnas.

15. **Las entregas van por remito con detalle por material, y pueden ser
    parciales.** Un remito no cierra un presupuesto: descarga parte de lo
    comprado. Por eso la entrega se mide contra lo pedido renglon por
    renglon y no con un porcentaje del total.

16. **El redondeo va una sola vez**, al final, sobre el total consolidado de
    cada material. Nunca por tarea: redondear por tarea infla la compra y es
    uno de los errores que tenía la planilla original.

---

## 4. Reglas duras — romperlas rompe producción

### Base de datos

- **Nunca un pool de conexiones.** Azure SQL serverless pausa sólo cuando hay
  cero sesiones activas y cero CPU. Un pool la deja despierta para siempre y
  se come los 100.000 vCore-segundos gratis en unas 55 horas; después queda
  bloqueada hasta el 1° del mes siguiente. `db.py` abre y cierra una conexión
  por operación, a propósito. No "optimizar" eso.
- **Carga masiva: tabla temporal + un MERGE.** Un MERGE por fila con 20.000
  valores son 20.000 idas y vueltas, más de cinco minutos, y el job muere por
  `--replica-timeout 300`. Ya pasó.
- **Las migraciones se corren a mano** en el Query editor del portal. Nunca
  automáticas en el arranque del backend. Numeradas, idempotentes
  (`IF OBJECT_ID(...) IS NULL`, `CREATE OR ALTER`), y con los controles de
  verificación comentados al final del archivo.
- El primer query después de una pausa tarda unos 40 segundos y falla con
  "Database is not currently available". No es un error: hay que reintentar.

### Costos

- **No se dan de alta recursos nuevos en Azure.** Instrucción del usuario,
  29-ago-2026. Todo lo que se construya tiene que caber en los ocho
  recursos que ya existen: SQL serverless, Container App, Container Apps
  Job, Static Web App, Storage, Log Analytics, el entorno de Container
  Apps y el resource group. Configurar lo que ya está —una regla de CORS,
  una variable de entorno, un container de blobs— no es dar de alta nada
  y está bien.
- Si una etapa **necesita** un recurso nuevo, se para y se pregunta. No se
  provisiona y después se avisa. Hoy la única que lo necesitaría es **E6**:
  el login con Entra External ID crea un tenant, que tiene capa gratuita
  pero es un recurso nuevo igual.
- Las tres barreras que hacen que el techo sea estructural y no una
  cuestión de vigilancia: `freeLimitExhaustionBehavior = AutoPause` en la
  base —si se agota el grant gratis se pausa, no factura—, `minReplicas 0`
  en el Container App, y el budget de u$d 10 en el resource group.

### Contenedores y deploy

- El backend corre como usuario sin privilegios, así que **el puerto tiene
  que ser >= 1024**. Está en 8080. Con USER appuser y el puerto 80, uvicorn
  muere con `[Errno 13] permission denied`.
- **El az CLI no acepta valores que empiezan con guion en `--args`**
  (Azure/azure-cli#27011). Por eso existe `run_indices.py`: para no pasar
  `-m app.jobs.indices`.
- El workflow de backend necesita `docker/setup-buildx-action`; sin el driver
  container, el cache `type=gha` falla.
- El deploy sube la imagen, pero **el job sólo corre por cron o a mano**:
  `az containerapp job start -g rg-obra493 -n obra493-indices`.

### Frontend y diseño

Los tokens viven en `src/styles/tokens.css` y son la única fuente de verdad
visual. Reglas del sistema "Obra":

- **Bordes, no sombras.** Radio 4px. Un solo acento: `#1B3A5C`.
- **Nada de tipografía monoespaciada en los números.** El cero rayado o con
  punto en el medio es inaceptable para el usuario, lo dijo explícitamente.
  Los números van con la sans del sistema más
  `font-variant-numeric: tabular-nums lining-nums` y
  `font-feature-settings: "zero" 0`.
- Alto de fila 30px. Todo número lleva la clase `.ob-num`.
- Lo que sube es el costo: `--ob-sube` es el color malo, `--ob-baja` el bueno.
- Modo claro por defecto, oscuro sólo con `[data-theme="dark"]`.

### Convenciones de código

- Todo en español rioplatense: nombres de tablas, columnas, endpoints,
  variables, comentarios y textos de UI.
- Los comentarios en `.py` y `.sql` van **sin acentos ni eñes**. En `.md`,
  `.jsx` y textos de UI sí llevan.
- Los comentarios explican **por qué**, no qué. Si un comentario se puede
  deducir leyendo la línea de abajo, sobra. Los comentarios que valen son los
  que registran una decisión o una trampa: "OJO con esto porque...".
- Mensajes de commit en español, en minúscula, con el porqué en el cuerpo.

---

## 5. Las etapas

Cada etapa se cierra con su criterio de aceptación verificado en producción,
no en local. Una etapa que no se puede verificar no está terminada.

---

### E1 · El caparazón — HECHO

**Por qué primero:** es lo único que no depende de nada más, y es el reclamo
que el usuario viene haciendo hace tres conversaciones. Hoy la app se ve como
cuatro hojas de Excel sueltas.

**Alcance**

- Agregar `react-router-dom`. Rutas de verdad, con URL que se puede copiar.
- Layout de dos columnas: barra lateral fija + área de contenido.
- Arriba de la barra lateral, el **selector de obra**, siempre visible aunque
  haya una sola. Hoy el selector existe en el código pero se esconde cuando
  hay una obra, así que nunca se ve.
- Navegación de la barra lateral, en este orden:
  - Cómo viene *(resumen de la obra; por ahora placeholder honesto)*
  - Rubros
  - Cómputo
  - Lista de compra
  - Materiales y precios
  - Rendimientos
- Las cuatro pantallas actuales se mueven adentro sin cambiar su contenido.
- Estado vacío decente en "Cómo viene": decir qué va a haber ahí y qué falta
  cargar para que aparezca. No inventar datos.

**Archivos**

`frontend/package.json`, `frontend/src/App.jsx` (se parte),
`frontend/src/Layout.jsx` (nuevo), `frontend/src/componentes/Lateral.jsx`
(nuevo), `frontend/src/styles/base.css`.

**Criterio de aceptación**

Se entra a la app y se ve una barra lateral con el nombre de la obra arriba.
Se navega entre secciones y la URL cambia. Se recarga la página parado en
"Rendimientos" y sigue en Rendimientos. Nada de lo que funcionaba dejó de
funcionar.

**Qué NO hacer**

No rediseñar las tablas todavía. No agregar librerías de componentes. No
tocar el backend.

---

### E2 · Presupuestos y planes de pago — HECHO

**Por qué:** es lo que el usuario está haciendo en la vida real esta semana y
no tiene dónde vivir. Y es donde aparece el número de $88 millones.

**Migración `006_presupuestos.sql`**

- `presupuesto`: `obra_id`, `rubro_id`, `proveedor_id`, `tipo`
  (`materiales` | `mano_obra`), `nombre`, `monto_base`, `moneda`,
  `fecha_base`, `estado` (`borrador` | `confirmado` | `anulado`), `notas`.
- `plan_tramo`: `presupuesto_id`, `orden`, `tipo` (`anticipo` | `cuota`),
  `descripcion`, `porcentaje` o `monto_base`, `fecha_prevista`,
  `indexa` (bit), `indice_codigo` (default `IPC_NIVEL`).
- `cuota` derivada de `plan_tramo` cuando el presupuesto se confirma, con
  `monto_nominal`, `coeficiente_aplicado`, `monto_real`, `estado`
  (`pendiente` | `provisoria` | `definitiva` | `anulada`).

Los presupuestos y las cuotas **se anulan, no se borran**.

**Backend**

- `routers/presupuestos.py`: CRUD de presupuesto y tramos, confirmar
  presupuesto (genera las cuotas), y el cálculo del total proyectado.
- El total proyectado usa `dbo.fn_coef_ipc`. Si devuelve NULL para algún
  tramo, ese tramo se marca provisorio y **se dice en la respuesta**. No
  esconder el faltante detrás de un 1.

**Frontend**

- Sección "Presupuestos" dentro del rubro.
- Alta de presupuesto con armado de plan: anticipo en porcentaje, cantidad de
  cuotas, frecuencia (semanal, quincenal, mensual), fecha de inicio, y el
  interruptor `indexa` por tramo.
- La tabla del plan muestra las tres columnas que importan: **nominal,
  proyectado, real**, y el total abajo con la diferencia contra el nominal.

**Criterio de aceptación**

Cargar el caso real del cementista —$85.000.000, 20 % de anticipo que no
indexa, 14 cuotas semanales arrancando en dos meses, ajuste mensual— y que
la app muestre un total proyectado de alrededor de $88.000.000, con las
cuotas de cada mes llevando el mismo coeficiente.

---

### E3 · Pagos desde el celular — HECHO

**Por qué junto con E2 y no después:** si el registro de pagos llega tres
meses tarde, nadie carga tres meses de pagos hacia atrás. La app quedaría
llena de presupuestos sin un solo pago.

**Migración `007_pagos.sql`**

- `pago`: `obra_id`, `rubro_id`, `presupuesto_id` (nullable), `cuota_id`
  (nullable), `fecha`, `monto`, `medio`, `comprobante_url`, `notas`,
  `anulado`.

Que `presupuesto_id` y `cuota_id` puedan ser nulos es a propósito: siempre
aparece un pago suelto que no estaba en ningún plan.

**Frontend**

Una pantalla pensada para el teléfono, no una tabla achicada. Rubro,
presupuesto, monto, fecha —hoy por defecto—, y listo. Menos de quince
segundos parado en la obra. El resto de la app puede seguir siendo de
escritorio; esta pantalla no.

**Criterio de aceptación**

Desde un teléfono, con la app recién abierta, registrar un pago en menos de
quince segundos y verlo reflejado en el saldo del presupuesto.

---

### E4 · Mano de obra y materiales sin rendimiento — HECHO

**Migración `008_mano_obra.sql`**

- `material.tipo`: `rendimiento` | `cantidad`. Los de tipo `cantidad`
  (caños, artefactos, aberturas) no necesitan coeficiente por m²: se cargan
  directo en el cómputo con su cantidad.
- `tarea_tipo` gana un costo de mano de obra por unidad, editable por obra
  igual que todo lo demás.
- El motor de `lista-materiales` tiene que tolerar materiales sin
  coeficiente en vez de ignorarlos en silencio.

**Criterio de aceptación**

Cargar un rubro de plomería con caños por cantidad y mano de obra por m², y
que el teórico del rubro sume las dos cosas.

---

### E5 · Plazos, avance y el Gantt — HECHO (29-ago-2026)

**Por qué recién acá:** hoy no existe una sola fecha en la base. Hacer el
Gantt antes es dibujar una vista vacía.

**Migración `009_cronograma.sql`**

- `computo` gana `fecha_inicio`, `fecha_fin`, `avance_pct`.
- `tarea_dependencia`: `tarea_id`, `depende_de_id`, `dias_desfase`.
- `avance_rubro`: `obra_id`, `rubro_id`, `fecha`, `avance_pct`. El avance se
  carga como una serie en el tiempo, no como un número que se pisa, porque
  la curva de avance necesita historia igual que la de pagos.

**Frontend**

El Gantt es la vista principal de "Cómo viene", y su razón de ser no son las
barras: es que **sobre el mismo eje de tiempo se cruzan la curva de pagado y
la de avance**. La brecha entre las dos es la respuesta a "¿estoy pagando
más de lo que avanzó?". Si el Gantt sólo mostrara plazos, no valdría el
trabajo de construirlo.

Mover una tarea empuja a las que dependen de ella.

**Criterio de aceptación**

Con la obra 493 cargada, ver el cronograma y las dos curvas, y que correr
una tarea dos semanas corra también las que dependen de ella.

---

### E6 · Login y compartir — A MEDIO CAMINO (29-ago-2026)

**Hecho y en producción: la capa de autorización.** Es la que administra
Jose y la que el día de mañana sostiene el cobro.

- Migración `013_acceso.sql`. `usuario` gana `estado`
  (`invitado` | `activo` | `suspendido`), `rol_global` (`duenio` | `cliente`)
  y `ultimo_acceso`. `entra_oid` pasó a nullable: la fila se crea con el
  email y el oid se engancha en el primer login.
- `backend/app/acceso.py` — el portero. Está a nivel de router y mira el
  método: GET necesita acceso, cualquier otra cosa necesita ser editor.
- `routers/usuarios.py` + pantalla **Acceso** — habilitar por email,
  suspender, y asignar obras con rol.
- Verificado con dos cuentas: el editor entra a las dos obras; el de
  lectura lee una, recibe 403 al escribirla y 404 en la que no es suya;
  suspendido pierde el acceso hasta a la propia.

**Pendiente: enchufar la identidad.** Hoy `usuario_actual()` en
`acceso.py` devuelve siempre al dueño, resuelto por la clave compartida.
Ese es el único punto que cambia: el resto del acceso ya no se toca.

Lo que falta, en orden:

1. **Crear el tenant de External ID.** Lo hace Jose en el portal:
   Entra ID → Administrar inquilinos → Crear → **Externo**. Nombre
   `obra493`, país Argentina (no se cambia después), suscripción
   `Azure subscription 1` y grupo `rg-obra493`. Se llegó hasta la pantalla
   de elegir configuración y se paró ahí.
   > OJO: en esa lista aparecen tres directorios — Astorarg, GrupoZand y
   > el nuevo. El registro de la app va en el NUEVO. Hacerlo en el
   > equivocado da un login que falla sin decir por qué.
2. **Registrar la app** en el tenant nuevo, tipo SPA, con URI de
   redirección `https://proud-cliff-0e19abc0f.7.azurestaticapps.net`.
3. **Flujo de usuario** de registro e inicio de sesión, con email y
   contraseña y, si se quiere, Google.
4. Pasar tenant, client id y subdominio. Ninguno es secreto: van en el
   bundle del frontend igual.
5. Del lado del código: **`PyJWT` entra al requirements.txt**. Validar la
   firma de un token es RSA, y ahí hacerlo a mano — como se hizo con el
   SAS del storage — sería mala ingeniería, no ahorro. Es la excepción
   razonada a la regla de la imagen magra.

`Microsoft.AzureActiveDirectory` ya quedó registrado como proveedor en la
suscripción (29-ago-2026): sin eso el asistente falla a mitad de camino
con un error que no explica nada. Registrar un proveedor es configuración,
no un recurso.

### E6 · Login y compartir — el plan original

**Por qué acá:** hasta que no haya identidad, "compartir con un arquitecto"
no significa nada. Hoy el acceso es una clave compartida y `APP_KEY` está
documentado en el propio código como "no es autenticación, es un candado".

**Alcance**

- Microsoft Entra ID (el tenant ya existe, la suscripción es de Azure).
  Evaluar si conviene Entra External ID para que entren arquitectos con
  cuenta de Google o Microsoft.
- `usuario.entra_oid` ya existe en el modelo. Hoy hay un solo usuario con
  `entra_oid = 'local-sin-login'`; hay que migrarlo.
- Invitación por mail a una obra con rol `editor` o `lectura`.
- Todos los endpoints filtran por las obras del usuario. `obra_usuario` ya
  está: falta usarla.

**Criterio de aceptación**

Dos cuentas distintas. La segunda entra, ve sólo la obra a la que la
invitaron, y con rol `lectura` no puede editar nada.

---

### E7 · Documentos e imágenes — HECHO (29-ago-2026)

**Migración `010_documentos.sql`**

- `documento`: `obra_id`, `rubro_id` (nullable), `presupuesto_id` (nullable),
  `pago_id` (nullable), `tipo` (`foto` | `presupuesto` | `factura` |
  `remito` | `plano`), `nombre`, `blob_path`, `mime`, `bytes`, `subido_por`,
  `creado_en`.

**Backend**

Subida a Blob Storage con SAS de escritura de vida corta, y lectura con SAS
de lectura. El container `documentos` tiene `allow-blob-public-access false`
y así se queda: nada de URLs públicas.

**Criterio de aceptación**

Sacar una foto desde el teléfono al registrar un pago y que quede colgada de
ese pago.

---

## 6. Cómo trabajar

- **Una etapa por vez, y verificada en producción.** No arrancar la
  siguiente con la anterior a medias.
- **Migración primero, código después.** El código nuevo tiene que tolerar
  que la migración todavía no esté aplicada, sin morirse: ya pasó que una
  columna faltante mató el job entero en la primera iteración.
- Después de cada push, mirar el run de GitHub Actions. Verde no alcanza:
  hay que pegarle a la app.
- El `_to_delete/` de la raíz es basura de locks de git. Ignorarlo.

---

## 7. Preguntas abiertas — no inventar la respuesta

~~1. ¿Qué dólar?~~ Contestada el 28-ago-2026: peso y dólar oficial del BCRA.
   Es la decisión 10.

~~2. ¿Un pago puede partirse entre dos presupuestos?~~ Contestada el
   28-ago-2026: no. Es la decisión 11.

~~3. ¿Las entregas van por remito con detalle o por porcentaje?~~ Contestada
   el 28-ago-2026: **por remito con detalle por material, y pueden ser
   parciales** de lo que se compró. Es la decisión 15.

~~4. ¿El avance se carga por tarea o por rubro?~~ Contestada el 28-ago-2026:
   **por tarea, y de ahí impacta en el rubro.** Es la decisión 13.

~~5. ¿Los 762 m² de revoque son netos o brutos?~~ Contestada el 28-ago-2026:
   **netos de vanos.**

~~6. ¿A qué rubro pertenece el costo de un material?~~ Contestada el
   28-ago-2026: **al rubro donde se cargó el presupuesto de materiales**, no
   al rubro que el material tiene en la biblioteca. Es la decisión 14.

**No quedan preguntas abiertas.** Cuando aparezca una nueva va acá antes de
que alguien la conteste sola escribiendo código.

## 8. Deuda conocida

- `deploy-obra493.ps1` no carga `APP_KEY`; se puso a mano.
- `--system-assigned` está deprecado, va `--mi-system-assigned`.
- Los m² del cómputo son **netos de vanos** (confirmado 28-ago-2026).
- El Excel `493.xlsx` tiene la celda del Ladrillo H18 apuntando a la columna
  del H12: 1.040 en vez de 4.800. Son $4.223.946 que no estaban contados. La
  app ya lo calcula bien; la planilla no.
