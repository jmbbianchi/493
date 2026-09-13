import { useEffect, useMemo, useState } from 'react'
import * as api from '../api'
import { calendarioPagos, semana, agruparRubros, estadoPago } from '../calendarioPagos'
import { num } from '../formato'
import '../styles/calendario-pagos.css'

const sumarDias = (fecha, dias) => { const d = new Date(fecha + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate()+dias); return d.toISOString().slice(0,10) }
export default function CalendarioSemanalPagos({ obraId, destinos, pagos }) {
  const hoy = new Date().toLocaleDateString('en-CA')
  const [inicio, setInicio] = useState(semana(hoy))
  const [datos, setDatos] = useState(null), [error, setError] = useState(''), [recarga, setRecarga] = useState(0)
  useEffect(() => {
    let activo = true; setDatos(null); setError('')
    Promise.all(destinos.presupuestos.map(async (p) => ({ ...p, ...(await api.get(`/api/obras/${obraId}/presupuestos/${p.id}`).then((d) => ({ cuotas: d.cuotas }))) })))
      .then((d) => { if (activo) setDatos(d) }).catch((e) => { if (activo) setError(e.message) })
    return () => { activo = false }
  }, [obraId, destinos, recarga])
  const filas = useMemo(() => calendarioPagos(datos || [], pagos, hoy), [datos, pagos, hoy])
  const [cerrados, setCerrados] = useState({})
  const [detalle, setDetalle] = useState(null)
  const rubros = useMemo(() => agruparRubros(filas), [filas])
  const semanas = Array.from({length: 12}, (_, i) => sumarDias(inicio, i*7))
  const monedas = [...new Set(filas.map((g) => g.moneda))]
  const campos = [['pactado','Pactado'],['estimado','Estimado'],['pagado','Pagado'],['pendiente','Pendiente']]
  const importe = (v) => num(v/100, 2)
  const describir = (g, s, c) => `${g.rubro}${g.subrubro ? ' / '+g.subrubro : ''} · ${g.moneda} · Semana ${s}
Pactado: ${importe(c.pactado || 0)}
Estimado: ${c.sinEstimacion ? 'Incompleto' : importe(c.estimado || 0)}
Pagado en esta semana: ${importe(c.pagado || 0)}
Pendiente de las cuotas: ${importe(c.pendiente || 0)}
Cuotas: ${c.completas || 0} pagadas, ${c.parciales || 0} parciales, ${(c.cuotas || 0)-(c.completas || 0)-(c.parciales || 0)} impagas
Sin imputar a cuota: ${importe(c.sinImputar || 0)}
Pagos diferidos: ${importe(c.diferido || 0)}`
  const celdas = (g) => semanas.map((s) => {
    const c = g.semanas[s]
    const texto = c ? describir(g, s, c) : ''
    return <td key={s} className={estadoPago(c)}>{c ? <button className="cp-celda" title={texto} aria-label={texto} onClick={() => setDetalle(texto)}>
      {c.sinEstimacion ? 'Sin estimación' : c.cuotas ? importe(c.estimado) : importe(c.pagado + c.diferido)}
    </button> : '—'}</td>
  })
  return <section className="cp-panel">
    <h2>Calendario de pagos</h2>
    <p>Importes estimados por semana. Desplegá cada rubro para ver sus subrubros; pasá el mouse o tocá un importe para comparar el detalle.</p>
    <div className="cp-controles"><button className="ob-btn" onClick={() => setInicio(sumarDias(inicio,-84))}>← 12 semanas</button>
      <label>Desde <input type="date" className="ob-input" value={inicio} onChange={(e) => { if (e.target.value) setInicio(semana(e.target.value)) }} /></label>
      <button className="ob-btn" onClick={() => setInicio(semana(hoy))}>Hoy</button><button className="ob-btn" onClick={() => setInicio(sumarDias(inicio,84))}>12 semanas →</button></div>
    {error ? <p role="alert">{error} <button className="ob-btn" onClick={() => setRecarga((x) => x+1)}>Reintentar</button></p> : datos === null ? <p>Cargando calendario…</p> : <>
      <div className="cp-scroll"><table className="cp-tabla"><thead><tr><th>Rubro / subrubro · Estimado</th>{semanas.map((s) => <th key={s}>{s.slice(8)}/{s.slice(5,7)}<br /><small>{s.slice(0,4)}</small></th>)}</tr></thead>
        <tbody>{rubros.flatMap((g) => [
          <tr key={g.key} className="cp-rubro"><th><button className="cp-grupo" aria-expanded={!cerrados[g.key]} onClick={() => setCerrados((v) => ({...v, [g.key]: !v[g.key]}))}>{cerrados[g.key] ? '▸' : '▾'} {g.rubro} <small>{g.moneda}</small></button></th>{celdas(g)}</tr>,
          ...(!cerrados[g.key] ? g.hijos.map((h) => <tr key={h.key}><th className="cp-subrubro">{h.subrubro}</th>{celdas(h)}</tr>) : [])
        ])}{!filas.length && <tr><td colSpan={13}>Todavía no hay compromisos ni pagos registrados.</td></tr>}</tbody>
        <tfoot>{monedas.map((moneda) => campos.map(([campo,label]) => <tr key={`${moneda}-${campo}`}><th>Total {moneda} · {label}</th>{semanas.map((s) => <td key={s}>{campo==='estimado' && filas.some((g) => g.moneda===moneda && g.semanas[s]?.sinEstimacion) ? 'Incompleto' : importe(filas.filter((g) => g.moneda===moneda).reduce((n,g) => n+(g.semanas[s]?.[campo] || 0),0))}</td>)}</tr>))}</tfoot>
      </table></div>
      <p><span className="cp-leyenda pendiente">Impago</span> <span className="cp-leyenda parcial">Parcial</span> <span className="cp-leyenda completo">Pagado</span> · Totales por moneda.</p>
      <p>En semanas sin cuotas se muestra el importe de los pagos registrados. El estado de las cuotas considera solo pagos imputados; el total pagado usa la fecha real del pago.</p>
      {detalle && <aside className="cp-detalle" aria-label="Detalle del importe"><button className="ob-btn" onClick={() => setDetalle(null)}>Cerrar detalle</button><p>{detalle}</p></aside>}
    </>}
  </section>
}
