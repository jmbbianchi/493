// Pruebas de interfaz con respuestas sinteticas. No abre la base real.
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const base = process.env.PREVIEW_URL || 'http://127.0.0.1:5173'
const salida = path.resolve(__dirname, '../test-results')
fs.mkdirSync(salida, { recursive: true })
const id = (n) => `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`
const obra = { id: id(1), nombre: 'Obra de demostración · Datos ficticios', nomenclatura: 'Vivienda unifamiliar', sup_cubierta: 240 }
const rubros = [{ id: id(10), nombre: 'Estructura', orden: 10, cantidad_tareas: 5, fecha_inicio: '2026-09-01', fecha_fin: '2026-10-07', avance_pct: 32, tiene_avance: true },
  { id: id(11), nombre: 'Albañilería', orden: 20, cantidad_tareas: 1 }, { id: id(12), nombre: 'Instalaciones', orden: 30, cantidad_tareas: 0 }]
const tarea = (n, nombre, extra = {}) => ({ id: id(n), rubro_id: id(10), padre_id: id(20), nombre, tipo: 'tarea', responsable: 'Equipo de estructura',
  fecha_inicio: null, fecha_fin: null, orden: n, notas: '', dependencias: [], avance_pct: null, tiene_avance: false, duracion: null, ...extra })
const inicial = { version: 4, editable: true, rubros,
  tareas: [tarea(20, 'Estructura de planta baja', { tipo: 'grupo', padre_id: null, fecha_inicio: '2026-09-01', fecha_fin: '2026-10-07', cantidad_tareas: 5, avance_pct: 32, tiene_avance: true }),
    tarea(21, 'Encofrado de columnas', { fecha_inicio: '2026-09-01', fecha_fin: '2026-09-07', duracion: 7, avance_pct: 100, tiene_avance: true }),
    tarea(22, 'Armado de vigas', { fecha_inicio: '2026-09-08', fecha_fin: '2026-09-18', duracion: 11, avance_pct: 60, tiene_avance: true, dependencias: [{ depende_de_id: id(21), dias_desfase: 0 }] }),
    tarea(23, 'Hormigonado de losa', { fecha_inicio: '2026-09-19', fecha_fin: '2026-09-22', duracion: 4, dependencias: [{ depende_de_id: id(21), dias_desfase: 0 }, { depende_de_id: id(22), dias_desfase: 0 }] }),
    tarea(24, 'Desencofrado', { fecha_inicio: '2026-10-01', fecha_fin: '2026-10-06', duracion: 6 }),
    tarea(25, 'Estructura terminada', { tipo: 'hito', fecha_inicio: '2026-10-07', fecha_fin: '2026-10-07', duracion: 0 }),
    tarea(26, 'Mampostería exterior', { rubro_id: id(11), padre_id: null, responsable: 'Albañilería' })],
  resumen: { cantidad_tareas: 6, completadas: 1, fecha_inicio: '2026-09-01', fecha_fin: '2026-10-07', avance_pct: 26.6667, tiene_avance: true, sin_fecha: 1 },
  criterio_avance: 'Promedio simple de tareas e hitos; las tareas sin avance cuentan como 0 %.' }

async function principal() {
  const browser = await chromium.launch({ headless: true, ...(process.env.BROWSER_EXECUTABLE ? { executablePath: process.env.BROWSER_EXECUTABLE } : {}) })
  try {
    const context = await browser.newContext({ viewport: { width: 1500, height: 1000 }, locale: 'es-AR', timezoneId: 'America/Argentina/Buenos_Aires' })
    await context.addInitScript(() => localStorage.setItem('obra493-clave', 'solo-prueba'))
    let datos = structuredClone(inicial), escrituras = [], errorGuardar = false, falloCarga = false
    await context.route('**/api/**', async (route) => {
      const req = route.request(), url = new URL(req.url()), ruta = url.pathname
      const responder = (json, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(json) })
      if (ruta === '/api/obras') return responder([obra, { ...obra, id: id(2), nombre: 'Segunda obra · Datos ficticios' }])
      if (ruta === '/api/indices/ultimo') return responder({ detail: 'sin datos' })
      if (ruta === `/api/obras/${id(2)}/proyecto`) return responder({ ...datos, rubros: [], tareas: [], resumen: { cantidad_tareas: 0, completadas: 0, sin_fecha: 0 } })
      if (ruta.endsWith('/avances') && req.method() === 'GET') return responder([{ fecha: '2026-09-10', avance_pct: 60, nota: 'Medición de prueba' }])
      if (ruta.endsWith('/proyecto') && req.method() === 'GET') return responder(falloCarga ? { detail: 'Fallo de carga de prueba' } : datos, falloCarga ? 503 : 200)
      if (req.method() !== 'GET') {
        const body = req.postDataJSON()
        escrituras.push({ ruta, method: req.method(), body })
        if (errorGuardar) return responder({ detail: 'Otra sesión modificó el proyecto. Cerrá el editor y actualizá antes de guardar.' }, 409)
        datos.version += 1
        if (ruta.endsWith('/tareas')) {
          datos.tareas.push({ ...tarea(90, body.nombre, { padre_id: null }), ...body })
          datos.resumen.cantidad_tareas += 1
        } else if (ruta.includes('/tareas/') && req.method() === 'PUT') {
          const t = datos.tareas.find((t) => ruta.endsWith(t.id)); Object.assign(t, body)
        } else if (ruta.endsWith('/rubros')) {
          datos.rubros.push({ ...body, id: id(91), cantidad_tareas: 0 })
        }
        return responder({ id: id(90), version: datos.version, movidas: 0 }, req.method() === 'POST' ? 201 : 200)
      }
      return responder({ detail: `Ruta inesperada: ${ruta}` }, 404)
    })
    const page = await context.newPage()
    const errores = []
    page.on('pageerror', (e) => errores.push(e.message))
    await page.goto(`${base}/obra/${obra.id}/como-viene`)
    await page.getByRole('heading', { name: 'Cronograma de obra' }).waitFor()
    await page.getByRole('button', { name: 'Encofrado de columnas', exact: true }).waitFor()
    await page.screenshot({ path: path.join(salida, 'proyecto-escritorio.png'), fullPage: true })

    await page.getByRole('button', { name: 'Contraer Estructura de planta baja' }).click()
    assert.equal(await page.getByRole('button', { name: 'Encofrado de columnas', exact: true }).count(), 0)
    await page.getByRole('button', { name: 'Expandir Estructura de planta baja' }).click()
    await page.getByRole('searchbox').fill('Mampostería')
    assert.equal(await page.getByRole('button', { name: 'Encofrado de columnas', exact: true }).count(), 0)
    await page.getByRole('button', { name: 'Mampostería exterior', exact: true }).waitFor()
    await page.getByRole('searchbox').fill('')
    await page.getByLabel('Agrupar por').selectOption('responsable')
    await page.getByRole('button', { name: 'Contraer Equipo de estructura' }).waitFor()
    await page.getByLabel('Agrupar por').selectOption('rubro')

    await page.getByRole('button', { name: 'Hormigonado de losa', exact: true }).click()
    const dialog = page.getByRole('dialog')
    await dialog.getByLabel('Tarea anterior', { exact: true }).first().waitFor()
    assert.equal(await dialog.getByLabel('Tarea anterior', { exact: true }).count(), 2)
    await dialog.getByLabel('Responsable', { exact: true }).fill('Equipo de hormigón')
    assert.equal(await dialog.getByLabel('Responsable', { exact: true }).inputValue(), 'Equipo de hormigón')
    await page.screenshot({ path: path.join(salida, 'proyecto-editor.png'), fullPage: true })
    await dialog.getByRole('button', { name: 'Guardar cambios' }).click()
    await dialog.waitFor({ state: 'hidden' })
    assert.equal(escrituras.at(-1).body.dependencias.length, 2)
    assert.equal(escrituras.at(-1).body.version, 4)
    await page.getByText('Cambios guardados.', { exact: true }).waitFor()

    await page.getByRole('button', { name: '+ Nueva tarea', exact: true }).click()
    await dialog.getByLabel('Nombre', { exact: true }).fill('Replanteo sin cómputo')
    await dialog.getByRole('button', { name: 'Guardar cambios' }).click()
    await page.getByRole('button', { name: 'Replanteo sin cómputo', exact: true }).waitFor()
    assert.equal(escrituras.at(-1).body.fecha_inicio, null)
    assert.equal(escrituras.at(-1).body.padre_id, null)

    await page.getByRole('button', { name: 'Avance de Armado de vigas', exact: true }).click()
    await dialog.getByText('Medición de prueba', { exact: true }).waitFor()
    await dialog.getByLabel('Avance acumulado (%)', { exact: true }).fill('75')
    await dialog.getByRole('button', { name: 'Guardar cambios' }).click()
    await dialog.waitFor({ state: 'hidden' })
    assert.equal(escrituras.at(-1).body.avance_pct, 75)

    errorGuardar = true
    await page.getByRole('button', { name: 'Encofrado de columnas', exact: true }).click()
    await dialog.getByLabel('Notas', { exact: true }).fill('No perder este texto')
    await dialog.getByRole('button', { name: 'Guardar cambios' }).click()
    await dialog.getByText(/Otra sesión modificó/).waitFor()
    assert.equal(await dialog.getByLabel('Notas', { exact: true }).inputValue(), 'No perder este texto')
    await page.keyboard.press('Escape')
    errorGuardar = false

    // Un lector conserva la consulta de historial y no puede guardar.
    datos.editable = false
    await page.getByRole('button', { name: 'Actualizar', exact: true }).click()
    await page.getByText('Tenés acceso de lectura a esta obra.').waitFor()
    assert.equal(await page.getByRole('button', { name: '+ Nueva tarea', exact: true }).isDisabled(), true)
    await page.getByRole('button', { name: 'Encofrado de columnas', exact: true }).click()
    assert.equal(await dialog.getByLabel('Nombre', { exact: true }).isDisabled(), true)
    assert.equal(await dialog.getByRole('button', { name: 'Guardar cambios' }).count(), 0)
    await page.keyboard.press('Escape')

    // El cambio de obra muestra el estado vacio sin arrastrar tareas.
    await page.locator('.ob-lateral__select').selectOption(id(2))
    await page.getByRole('heading', { name: 'Tu obra empieza con un plan' }).waitFor()
    datos = structuredClone(inicial)
    await page.locator('.ob-lateral__select').selectOption(id(1))
    await page.getByRole('button', { name: 'Encofrado de columnas', exact: true }).waitFor()

    await page.setViewportSize({ width: 390, height: 844 })
    await page.screenshot({ path: path.join(salida, 'proyecto-movil.png'), fullPage: true })
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth))
    await page.getByRole('button', { name: 'Avance de Armado de vigas', exact: true }).click()
    await dialog.getByLabel('Avance acumulado (%)', { exact: true }).waitFor()
    await page.keyboard.press('Escape')
    await page.getByRole('button', { name: 'Mampostería exterior', exact: true }).click()
    await dialog.getByLabel('Inicio', { exact: true }).fill('2026-10-08')
    await dialog.getByLabel('Fin', { exact: true }).fill('2026-10-28')
    await dialog.getByRole('button', { name: 'Guardar cambios' }).click()
    await dialog.waitFor({ state: 'hidden' })
    assert.equal(escrituras.at(-1).body.fecha_fin, '2026-10-28')

    falloCarga = true
    await page.getByRole('button', { name: 'Actualizar', exact: true }).click()
    await page.getByText('Fallo de carga de prueba').waitFor()
    falloCarga = false
    await page.getByRole('button', { name: 'Reintentar', exact: true }).first().click()
    await page.getByRole('button', { name: '+ Nueva tarea', exact: true }).waitFor()
    await page.waitForFunction(() => !document.querySelector('.pr-mensaje')?.textContent.includes('Cargando'))
    assert.equal(await page.getByText('Fallo de carga de prueba').count(), 0)
    assert.deepEqual(errores, [])
    console.log('OK: carga, jerarquía, búsqueda, agrupación, edición, dependencias múltiples, alta sin fechas, historial, conflicto, lectura, cambio de obra, móvil y recuperación de error.')
    console.log(`Capturas: ${salida}`)
  } finally { await browser.close() }
}
principal().catch((e) => { console.error(e); process.exitCode = 1 })
