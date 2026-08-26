// Formato argentino en un solo lugar: punto de miles, coma decimal.
const AR = (dec) => new Intl.NumberFormat('es-AR', {
  minimumFractionDigits: dec, maximumFractionDigits: dec,
})

export const num = (v, dec = 2) =>
  v === null || v === undefined || v === '' ? '—' : AR(dec).format(Number(v))

export const entero = (v) =>
  v === null || v === undefined || v === '' ? '—' : AR(0).format(Number(v))

export const plata = (v) =>
  v === null || v === undefined || v === '' ? '—' : '$ ' + AR(2).format(Number(v))

export const fecha = (v) => (v ? String(v).slice(0, 10) : '—')

/** Como `num` pero sin ceros de relleno: 1,0000 -> 1 ; 14,4000 -> 14,4 */
export const numCorto = (v, dec = 4) => {
  if (v === null || v === undefined || v === '') return '—'
  const s = AR(dec).format(Number(v))
  return s.includes(',') ? s.replace(/,?0+$/, '') : s
}

/** Agrupa una lista por el valor de una propiedad, conservando el orden. */
export function porGrupo(filas, clave) {
  const grupos = []
  const indice = new Map()
  for (const f of filas) {
    const g = f[clave] ?? 'Sin rubro'
    if (!indice.has(g)) { indice.set(g, { nombre: g, filas: [] }); grupos.push(indice.get(g)) }
    indice.get(g).filas.push(f)
  }
  return grupos
}
