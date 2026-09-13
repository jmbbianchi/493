export function semana(fecha) {
  const d = new Date(fecha.slice(0, 10) + 'T00:00:00Z')
  d.setUTCDate(d.getUTCDate() - (d.getUTCDay() + 6) % 7)
  return d.toISOString().slice(0, 10)
}
const centavos = (v) => Math.round(Number(v) * 100)

export function calendarioPagos(presupuestos, pagos, hoy) {
  const grupos = new Map(), cuotas = new Map()
  function celda(r, fecha) {
    const key = `${r.rubro_id}/${r.subrubro_id ?? ''}/${r.moneda}`
    if (!grupos.has(key)) grupos.set(key, { key, rubro: r.rubro, subrubro: r.subrubro || 'Sin subrubro', moneda: r.moneda, semanas: {} })
    const g = grupos.get(key), s = semana(fecha)
    return g.semanas[s] ??= { pactado: 0, estimado: 0, sinEstimacion: false, pagado: 0, pendiente: 0, sinImputar: 0, diferido: 0, cuotas: 0, completas: 0, parciales: 0 }
  }
  for (const p of presupuestos) for (const c of p.cuotas.filter((c) => c.estado !== 'anulada')) {
    const cell = celda(p, c.fecha_prevista), monto = centavos(c.monto_nominal)
    cell.pactado += monto; cell.cuotas++
    if (c.monto_proyectado == null) cell.sinEstimacion = true
    else cell.estimado += centavos(c.monto_proyectado)
    cuotas.set(String(c.id), { cell, moneda: p.moneda, monto, cubierto: 0 })
  }
  for (const p of pagos.filter((p) => !p.anulado)) {
    const cell = celda(p, p.fecha), monto = centavos(p.monto)
    if (p.fecha.slice(0,10) > hoy) { cell.diferido += monto; continue }
    cell.pagado += monto
    const cuota = cuotas.get(String(p.cuota_id))
    if (cuota && cuota.moneda === p.moneda) cuota.cubierto += monto
    else if (p.presupuesto_id) cell.sinImputar += monto
  }
  for (const q of cuotas.values()) {
    q.cell.pendiente += Math.max(0, q.monto - q.cubierto)
    if (q.cubierto >= q.monto) q.cell.completas++
    else if (q.cubierto > 0) q.cell.parciales++
  }
  return [...grupos.values()].sort((a,b) => `${a.rubro}/${a.subrubro}/${a.moneda}`.localeCompare(`${b.rubro}/${b.subrubro}/${b.moneda}`))
}
