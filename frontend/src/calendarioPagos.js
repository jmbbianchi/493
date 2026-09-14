export function semana(fecha) {
  const d = new Date(fecha.slice(0, 10) + 'T00:00:00Z')
  d.setUTCDate(d.getUTCDate() - (d.getUTCDay() + 6) % 7)
  return d.toISOString().slice(0, 10)
}
const centavos = (v) => Math.round(Number(v) * 100)

export function calendarioPagos(presupuestos, pagos, hoy) {
  const grupos = new Map(), cuotas = new Map(), libres = new Map()
  function celda(r, fecha) {
    const key = `${r.rubro_id}/${r.subrubro_id ?? ''}/${r.moneda}`
    if (!grupos.has(key)) grupos.set(key, { key, subrubro_id: r.subrubro_id, rubro_id: r.rubro_id, rubro: r.rubro, subrubro: r.subrubro || 'Sin tipo', moneda: r.moneda, semanas: {} })
    const g = grupos.get(key), s = fecha ? semana(fecha) : 'sin_fecha'
    return g.semanas[s] ??= { pactado: 0, estimado: 0, sinEstimacion: false, pagado: 0, pendiente: 0, sinImputar: 0, diferido: 0, cuotas: 0, completas: 0, parciales: 0 }
  }
  for (const p of presupuestos) for (const c of p.cuotas.filter((c) => c.estado !== 'anulada')) {
    const cell = celda(p, c.fecha_prevista), monto = centavos(c.monto_nominal)
    cell.pactado += monto; cell.cuotas++
    if (c.monto_proyectado == null) cell.sinEstimacion = true
    else cell.estimado += centavos(c.monto_proyectado)
    cuotas.set(String(c.id), { cell, moneda: p.moneda, monto, cubierto: 0, presupuesto: String(p.id), fecha: c.fecha_prevista || '9999' })
  }
  for (const p of pagos.filter((p) => !p.anulado)) {
    const cell = celda(p, p.fecha), monto = centavos(p.monto)
    if (p.fecha.slice(0,10) > hoy) { cell.diferido += monto; continue }
    cell.pagado += monto
    const cuota = cuotas.get(String(p.cuota_id))
    const convertido = p.monto_presupuesto == null ? null : centavos(p.monto_presupuesto)
    const monedaCobertura = p.moneda_presupuesto || p.moneda
    const cobertura = monedaCobertura === p.moneda ? monto : convertido
    if (cuota && cuota.moneda === monedaCobertura && cobertura != null) cuota.cubierto += cobertura
    else if (p.presupuesto_id) {
      if (!presupuestos.some(b=>String(b.id)===String(p.presupuesto_id) && b.moneda===p.moneda)) cell.sinImputar += monto
      const key = `${p.presupuesto_id}/${monedaCobertura}`
      libres.set(key, (libres.get(key) || 0) + (cobertura || 0))
    }
  }
  // Apply unallocated budget payments to the earliest remaining commitments.
  // This is calendar coverage only: stored payment links and dates are preserved.
  for (const q of [...cuotas.values()].sort((a,b)=>a.fecha.localeCompare(b.fecha))) {
    const key = `${q.presupuesto}/${q.moneda}`
    const usado = Math.min(Math.max(0,q.monto-q.cubierto),libres.get(key)||0)
    q.cubierto += usado; libres.set(key,(libres.get(key)||0)-usado)
  }
  for (const q of cuotas.values()) {
    q.cell.pendiente += Math.max(0, q.monto - q.cubierto)
    if (q.cubierto >= q.monto) q.cell.completas++
    else if (q.cubierto > 0) q.cell.parciales++
  }
  return [...grupos.values()].sort((a,b) => `${a.rubro}/${a.subrubro}/${a.moneda}`.localeCompare(`${b.rubro}/${b.subrubro}/${b.moneda}`))
}

export function agruparRubros(filas) {
  const rubros = new Map()
  for (const fila of filas) {
    const key = `${fila.rubro_id}/${fila.moneda}`
    if (!rubros.has(key)) rubros.set(key, { key, rubro: fila.rubro, moneda: fila.moneda, hijos: [], semanas: {} })
    const rubro = rubros.get(key)
    rubro.hijos.push(fila)
    for (const [semana, celda] of Object.entries(fila.semanas)) {
      const total = rubro.semanas[semana] ??= {}
      for (const [campo, valor] of Object.entries(celda)) {
        total[campo] = campo === 'sinEstimacion' ? Boolean(total[campo] || valor) : (total[campo] || 0) + valor
      }
    }
  }
  return [...rubros.values()]
}

export function estadoPago(c) {
  if (!c) return ''
  if (c.cuotas) return c.completas === c.cuotas ? 'completo' : c.completas || c.parciales ? 'parcial' : 'pendiente'
  return c.diferido ? (c.pagado ? 'parcial' : 'pendiente') : c.pagado ? 'completo' : ''
}

export function agruparTipos(filas) {
  const tipos = new Map()
  for (const fila of filas) {
    const key = `${fila.subrubro_id ?? ''}/${fila.moneda}`
    if (!tipos.has(key)) tipos.set(key, { key, subrubro: fila.subrubro, moneda: fila.moneda, hijos: [], semanas: {} })
    const tipo = tipos.get(key)
    tipo.hijos.push(fila)
    for (const [semana, celda] of Object.entries(fila.semanas)) {
      const total = tipo.semanas[semana] ??= {}
      for (const [campo, valor] of Object.entries(celda)) total[campo] = campo === 'sinEstimacion' ? Boolean(total[campo] || valor) : (total[campo] || 0) + valor
    }
  }
  return [...tipos.values()]
}
