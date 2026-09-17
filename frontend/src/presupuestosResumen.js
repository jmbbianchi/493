// Los acuerdos confirmados son independientes, incluso dentro del mismo rubro.
export function resumenAprobados(cotizaciones, saldos = {}, campo = 'monto_base') {
  const totales = new Map()
  for (const p of cotizaciones.filter(p => p.estado === 'confirmado')) {
    const saldo = saldos[p.id]
    const valor = campo === 'monto_base' ? p.monto_base
      : (!saldo || saldo.pagos_sin_convertir ? null : saldo[campo])
    const anterior = totales.get(p.moneda) ?? 0
    totales.set(p.moneda, valor == null || totales.get(p.moneda) === null ? null : anterior + Number(valor))
  }
  return [...totales].map(([moneda, valor]) => ({moneda, valor}))
}
