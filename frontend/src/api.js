// Cliente de la API. Una sola puerta: si algo devuelve 401, el error trae
// .clave = true y App.jsx vuelve a pedirla.
const BASE = import.meta.env.VITE_API_URL ?? ''
const GUARDA = 'obra493-clave'

let clave = ''
try { clave = localStorage.getItem(GUARDA) || '' } catch { /* modo privado */ }

export const hayClave = () => Boolean(clave)
export function guardarClave(c) {
  clave = c
  try { localStorage.setItem(GUARDA, c) } catch { /* se pierde al cerrar */ }
}
export function olvidarClave() {
  clave = ''
  try { localStorage.removeItem(GUARDA) } catch { /* nada */ }
}

async function pedir(ruta, opciones = {}) {
  const r = await fetch(BASE + ruta, {
    ...opciones,
    headers: { 'Content-Type': 'application/json', 'X-Obra-Key': clave, ...(opciones.headers || {}) },
  })
  if (r.status === 401) {
    const e = new Error('La clave no es correcta.')
    e.clave = true
    throw e
  }
  if (!r.ok) {
    let cuerpo = null
    try { cuerpo = await r.json() } catch { /* respuesta sin json */ }
    throw new Error(cuerpo?.detail || `La API respondio ${r.status}.`)
  }
  if (r.status === 204) return null
  return r.json()
}

export const get = (ruta) => pedir(ruta)
export const post = (ruta, cuerpo) => pedir(ruta, { method: 'POST', body: JSON.stringify(cuerpo) })
export const patch = (ruta, cuerpo) => pedir(ruta, { method: 'PATCH', body: JSON.stringify(cuerpo) })
export const put = (ruta, cuerpo) => pedir(ruta, { method: 'PUT', body: JSON.stringify(cuerpo) })
export const borrar = (ruta) => pedir(ruta, { method: 'DELETE' })
