import { useEffect, useMemo, useState } from 'react'
import * as api from '../api'
import { calendarioPagos, semana, agruparTipos, estadoPago } from '../calendarioPagos'
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
  const rubros = useMemo(() => agruparTipos(filas), [filas])
  const semanas = [...Array.from({length: 12}, (_, i) => sumarDias(inicio, i*7)), 'sin_fecha']
  const monedas = [...new Set(filas.map((g) => g.moneda))]
  const campos = [['pactado','Pactado'],['estimado','Estimado'],['pagado','Pagado'],['pendiente','Pendiente']]
  const importe = (v) => num(v/100, 2)
  const describir = (g, s, c) => `${g.subrubro}${g.rubro ? ' / '+g.rubro : ''} · ${g.moneda} · Semana ${s}
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
    <p>Importes estimados por semana. Desplegá cada tipo para ver sus rubros; pasá el mouse o tocá un importe para comparar el detalle.</p>
    <div className="cp-controles"><button className="ob-btn" onClick={() => setInicio(sumarDias(inicio,-84))}>← 12 semanas</button>
      <label>Desde <input type="date" className="ob-input" value={inicio} onChange={(e) => { if (e.target.value) setInicio(semana(e.target.value)) }} /></label>
      <button className="ob-btn" onClick={() => setInicio(semana(hoy))}>Hoy</button><button className="ob-btn" onClick={() => setInicio(sumarDias(inicio,84))}>12 semanas →</button></div>
    {error ? <p role="alert">{error} <button className="ob-btn" onClick={() => setRecarga((x) => x+1)}>Reintentar</button></p> : datos === null ? <p>Cargando calendario…</p> : <>
      <div className="cp-indicadores">{[1,2].map(n => {
        const desde = sumarDias(semana(hoy), n*7)
        return <div key={n}><strong>{n===1 ? 'Próxima semana' : 'Semana siguiente'}</strong><small>{desde} al {sumarDias(desde,6)}</small>
          {monedas.map(moneda => {
            const cs = filas.filter(g=>g.moneda===moneda).map(g=>g.semanas[desde]).filter(Boolean)
            return <p key={moneda}>{moneda} {cs.some(c=>c.sinEstimacion) ? 'Estimación incompleta' : importe(cs.reduce((v,c)=>v+(c.pactado ? Math.round(c.estimado*c.pendiente/c.pactado) : 0),0))}</p>
          })}{!monedas.length && <p>Sin gastos previstos</p>}
        </div>
      })}</div>
      <div className="cp-scroll"><table className="cp-tabla"><thead><tr><th>Tipo</th><th>Rubro · Estimado</th>{semanas.map((s) => <th key={s}>{s === 'sin_fecha' ? 'Sin programar' : `${s.slice(8)}/${s.slice(5,7)}`}<br /><small>{s === 'sin_fecha' ? '' : s.slice(0,4)}</small></th>)}</tr></thead>
        <tbody>{rubros.flatMap((g) => [
          <tr key={g.key} className="cp-rubro"><th><button className="cp-grupo" aria-expanded={!cerrados[g.key]} onClick={() => setCerrados((v) => ({...v, [g.key]: !v[g.key]}))}>{cerrados[g.key] ? '▸' : '▾'} {g.subrubro} <small>{g.moneda}</small></button></th><th></th>{celdas(g)}</tr>,
          ...(!cerrados[g.key] ? g.hijos.map((h) => <tr key={h.key}><th></th><th className="cp-subrubro">{h.rubro}</th>{celdas(h)}</tr>) : [])
        ])}{!filas.length && <tr><td colSpan={15}>Todavía no hay compromisos ni pagos registrados.</td></tr>}</tbody>
        <tfoot>{monedas.map((moneda) => campos.map(([campo,label]) => <tr key={`${moneda}-${campo}`}><th colSpan={2}>Total {moneda} · {label}</th>{semanas.map((s) => <td key={s}>{campo==='estimado' && filas.some((g) => g.moneda===moneda && g.semanas[s]?.sinEstimacion) ? 'Incompleto' : importe(filas.filter((g) => g.moneda===moneda).reduce((n,g) => n+(g.semanas[s]?.[campo] || 0),0))}</td>)}</tr>))}</tfoot>
      </table></div>
      <p><span className="cp-leyenda pendiente">Impago</span> <span className="cp-leyenda parcial">Parcial</span> <span className="cp-leyenda completo">Pagado</span> · Totales por moneda.</p>
      <p>En semanas sin cuotas se muestra el importe de los pagos registrados. Los pagos asociados al presupuesto cubren primero las cuotas pendientes más antiguas si no tienen cuota asignada. Pagado se muestra en su fecha real; los indicadores muestran el saldo previsto por pagar.</p>
      {detalle && <aside className="cp-detalle" aria-label="Detalle del importe"><button className="ob-btn" onClick={() => setDetalle(null)}>Cerrar detalle</button><p>{detalle}</p></aside>}
    </>}
  </section>
}
