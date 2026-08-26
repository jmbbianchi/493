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
