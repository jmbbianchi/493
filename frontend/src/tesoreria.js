import { semana } from './calendarioPagos.js'

export const sumarDias = (fecha, dias) => {
  const d = new Date(fecha + 'T00:00:00Z')
  d.setUTCDate(d.getUTCDate() + dias)
  return d.toISOString().slice(0, 10)
}
const cents = n => Math.round(Number(n) * 100)
export const sumar = valores => valores.some(v => v == null) ? null : valores.reduce((a, b) => a + b, 0)
export function tasaEn(tasas, fecha) {
  return tasas.filter(t => t.fecha.slice(0,10) <= fecha && Number(t.valor) > 0).at(-1) || null
}
export function convertirCentavos(monto, origen, destino, tasa) {
  if (monto == null) return null
  if (origen === destino || monto === 0) return monto
  if (!tasa || Number(tasa.valor) <= 0) return null
  return Math.round(destino === 'ARS' ? monto * Number(tasa.valor) : monto / Number(tasa.valor))
}

/** Los pagos se imputan en moneda del acuerdo antes de convertir la vista.
 * Cambiar la fecha de tesorería no cambia la prioridad original de imputación.
 * Las fechas vencidas se arrastran sólo para el saldo, nunca para el pago real.
 */
export function tesoreria({ presupuestos, pagos, programaciones = [], tasas = [], hoy, moneda = 'ARS' }) {
  const actual = tasaEn(tasas, hoy), semanaActual = semana(hoy)
  const porFecha = new Map(programaciones.map(p => [String(p.cuota_id), p]))
  const cuotas = new Map(), libres = new Map(), incompletos = new Set(), registros = []
  const presupuestosPorId = new Map(presupuestos.map(p => [String(p.id), p]))
  const categoria = p => ({ rubro_id:p.rubro_id, rubro:p.rubro || 'Sin rubro', tipo_id:p.subrubro_id ?? '', tipo:p.subrubro || 'Sin tipo' })
  for (const p of presupuestos) for (const q of (p.cuotas || []).filter(q => q.estado !== 'anulada')) {
    const manual = porFecha.get(String(q.id))
    cuotas.set(String(q.id), { ...categoria(p), id:String(q.id), presupuesto_id:String(p.id), nombre:p.nombre,
      descripcion:q.descripcion || 'Cuota', moneda:p.moneda, nominal:cents(q.monto_nominal),
      proyectado:q.monto_proyectado == null ? null : cents(q.monto_proyectado), cubierto:0,
      original:q.fecha_prevista?.slice(0,10) || null,
      fecha:manual ? manual.fecha?.slice(0,10) || null : q.fecha_prevista?.slice(0,10) || null,
      version:manual?.version || 0 })
  }
  for (const p of pagos.filter(p => !p.anulado)) {
    const fecha = p.fecha.slice(0,10), monto = cents(p.monto), presupuesto = presupuestosPorId.get(String(p.presupuesto_id))
    if (fecha > hoy) {
      // Un pago diferido asociado no se suma otra vez a sus cuotas.
      if (!presupuesto) registros.push({ ...categoria(p), id:'diferido-'+p.id, clase:'diferido', fecha, semana:semana(fecha),
        descripcion:'Pago diferido', moneda:p.moneda, nominal:monto, pendiente:convertirCentavos(monto,p.moneda,moneda,actual), pagado:0, estado:'pendiente' })
      continue
    }
    const tasa = tasaEn(tasas, fecha)
    registros.push({ ...categoria(p), id:'pago-'+p.id, clase:'pago', fecha, semana:semana(fecha),
      descripcion:p.notas || p.medio || 'Pago registrado', nombre:presupuesto?.nombre || 'Sin presupuesto',
      moneda:p.moneda, nominal:monto, pendiente:0, pagado:convertirCentavos(monto,p.moneda,moneda,tasa), tasa, estado:'completo' })
    if (!presupuesto) continue
    const cobertura = p.moneda === presupuesto.moneda ? monto : p.monto_presupuesto != null
      ? cents(p.monto_presupuesto) : convertirCentavos(monto,p.moneda,presupuesto.moneda,tasa)
    if (cobertura == null) { incompletos.add(String(presupuesto.id)); continue }
    const q = cuotas.get(String(p.cuota_id))
    if (q && q.presupuesto_id === String(presupuesto.id)) {
      const usado = Math.min(Math.max(0,q.nominal-q.cubierto),cobertura)
      q.cubierto += usado
      libres.set(String(presupuesto.id),(libres.get(String(presupuesto.id)) || 0)+cobertura-usado)
    } else libres.set(String(presupuesto.id),(libres.get(String(presupuesto.id)) || 0)+cobertura)
  }
  for (const q of [...cuotas.values()].sort((a,b)=>(a.original || '9999').localeCompare(b.original || '9999'))) {
    const libre = libres.get(q.presupuesto_id) || 0, usado = Math.min(Math.max(0,q.nominal-q.cubierto),libre)
    q.cubierto += usado; libres.set(q.presupuesto_id,libre-usado)
    const restante = Math.max(0,q.nominal-q.cubierto)
    const nativo = incompletos.has(q.presupuesto_id) ? null : restante === 0 ? 0 : q.cubierto > 0 ? restante : q.proyectado
    const vencido = restante > 0 && q.fecha && semana(q.fecha) < semanaActual
    registros.push({ ...q, clase:'cuota', saldoNominal:restante, pendienteNativo:nativo,
      pendiente:convertirCentavos(nativo,q.moneda,moneda,actual), pagado:0,
      semana:q.fecha ? vencido ? semanaActual : semana(q.fecha) : 'sin_fecha', vencido,
      estado:restante === 0 ? 'completo' : q.cubierto > 0 ? 'parcial' : 'pendiente' })
  }
  const filas = new Map()
  for (const r of registros) {
    const key = `${r.tipo_id}/${r.rubro_id}`
    if (!filas.has(key)) filas.set(key,{key,tipo_id:r.tipo_id,tipo:r.tipo,rubro:r.rubro,registros:[]})
    filas.get(key).registros.push(r)
  }
  const resumir = rs => ({ pendiente:sumar(rs.map(r=>r.pendiente)), pagado:sumar(rs.map(r=>r.pagado)) })
  return { registros, filas:[...filas.values()].sort((a,b)=>`${a.tipo}/${a.rubro}`.localeCompare(`${b.tipo}/${b.rubro}`)),
    ...resumir(registros), actual,
    aprobado:sumar(presupuestos.map(p=>convertirCentavos(cents(p.nominal ?? p.monto_base ?? (p.cuotas || []).filter(c=>c.estado!=='anulada').reduce((s,c)=>s+Number(c.monto_nominal),0)),p.moneda,moneda,actual))),
    semanaActual:resumir(registros.filter(r=>r.semana===semanaActual)).pendiente,
    proxima:resumir(registros.filter(r=>r.semana===sumarDias(semanaActual,7))).pendiente,
    siguiente:resumir(registros.filter(r=>r.semana===sumarDias(semanaActual,14))).pendiente,
    sinFecha:resumir(registros.filter(r=>r.semana==='sin_fecha')).pendiente }
}

export function resumenCelda(registros) {
  const pendientes = registros.filter(r=>r.clase!=='pago')
  return { pendiente:sumar(registros.map(r=>r.pendiente)), pagado:sumar(registros.map(r=>r.pagado)),
    estado:pendientes.some(r=>r.pendiente==null) ? 'sin-datos' : pendientes.some(r=>r.estado==='parcial') ||
      (pendientes.some(r=>r.estado==='pendiente') && pendientes.some(r=>r.estado==='completo')) ? 'parcial' :
      pendientes.some(r=>r.estado==='pendiente') ? 'pendiente' : registros.length ? 'completo' : '',
    vencidos:pendientes.filter(r=>r.vencido).length }
}
