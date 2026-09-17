export const ZONA_HORARIA = 'America/Argentina/Buenos_Aires'
export const mesArgentina = valor => valor ? `${String(valor).slice(5,7)}/${String(valor).slice(0,4)}` : '—'
const formato = new Intl.DateTimeFormat('es-AR', {timeZone: ZONA_HORARIA, day:'2-digit', month:'2-digit', year:'numeric'})
const instante = valor => {
  if (valor instanceof Date) return valor
  const texto = String(valor).replace(' ', 'T')
  // SQL devuelve los timestamps de auditoría en UTC sin sufijo.
  return new Date(/(?:Z|[+-]\d{2}:\d{2})$/i.test(texto) ? texto : texto + 'Z')
}
export function hoyArgentina(ahora = new Date()) {
  const partes = Object.fromEntries(formato.formatToParts(instante(ahora)).map(p => [p.type,p.value]))
  return `${partes.year}-${partes.month}-${partes.day}`
}
export function fechaArgentina(valor) {
  if (!valor) return '—'
  // Una fecha civil no es un instante: nunca desplazarla por zona horaria.
  if (/^\d{4}-\d{2}-\d{2}$/.test(String(valor))) return String(valor).split('-').reverse().join('/')
  const d = instante(valor)
  return Number.isNaN(d.getTime()) ? '—' : formato.format(d)
}
export function fechaHoraArgentina(valor) {
  if (!valor) return '—'
  const d = instante(valor)
  if (Number.isNaN(d.getTime())) return '—'
  return `${fechaArgentina(d)} ${new Intl.DateTimeFormat('es-AR', {timeZone:ZONA_HORARIA,hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).format(d)}`
}
