import { useEffect, useMemo, useState } from 'react'
import * as api from '../api'
import { calendarioPagos, semana } from '../calendarioPagos'
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
  const semanas = Array.from({length: 12}, (_, i) => sumarDias(inicio, i*7))
  const monedas = [...new Set(filas.map((g) => g.moneda))]
  const campos = [['pactado','Pactado'],['estimado','Estimado'],['pagado','Pagado'],['pendiente','Pendiente nominal'],['sinImputar','Sin imputar a cuota'],['diferido','Pago diferido']]
  const importe = (v) => num(v/100, 2)
  return <section className="cp-panel">
    <h2>Calendario de pagos</h2>
    <p>Semanas de lunes a domingo. Pagado se muestra en la fecha real del pago; pendiente corresponde a las cuotas de cada semana.</p>
    <div className="cp-controles"><button className="ob-btn" onClick={() => setInicio(sumarDias(inicio,-84))}>← 12 semanas</button>
      <label>Desde <input type="date" className="ob-input" value={inicio} onChange={(e) => { if (e.target.value) setInicio(semana(e.target.value)) }} /></label>
      <button className="ob-btn" onClick={() => setInicio(semana(hoy))}>Hoy</button><button className="ob-btn" onClick={() => setInicio(sumarDias(inicio,84))}>12 semanas →</button></div>
    {error ? <p role="alert">{error} <button className="ob-btn" onClick={() => setRecarga((x) => x+1)}>Reintentar</button></p> : datos === null ? <p>Cargando calendario…</p> : <>
      <p>Los pagos sin presupuesto se incluyen como pagados. Los pagos sin cuota asignada —o en otra moneda— aparecen sin imputar: no se descuentan automáticamente de una cuota.</p>
      <div className="cp-scroll"><table className="cp-tabla"><thead><tr><th>Rubro / subrubro</th><th>Concepto</th>{semanas.map((s) => <th key={s}>{s.slice(8)}/{s.slice(5,7)}<br /><small>{s.slice(0,4)}</small></th>)}</tr></thead>
        <tbody>{filas.map((g) => campos.map(([campo,label], i) => <tr key={`${g.key}-${campo}`}>
          {i===0 && <th rowSpan={campos.length}>{g.rubro}<br />{g.subrubro}<br />{g.moneda}</th>}<th>{label}</th>
          {semanas.map((s) => { const c = g.semanas[s]; const estado = !c?.cuotas ? '' : c.completas===c.cuotas ? 'completo' : c.completas || c.parciales ? 'parcial' : 'pendiente'; return <td key={s} className={campo==='pendiente' ? estado : ''} title={campo==='pendiente' ? `${c?.completas || 0} cuotas pagadas, ${c?.parciales || 0} parciales` : undefined}>{campo==='estimado' && c?.sinEstimacion ? 'Sin datos completos' : c?.[campo] ? importe(c[campo]) : '—'}</td> })}
        </tr>))}</tbody>
        <tfoot>{monedas.map((moneda) => campos.map(([campo,label], i) => <tr key={`${moneda}-${campo}`}>{i===0 && <th rowSpan={campos.length}>Total {moneda}</th>}<th>{label}</th>{semanas.map((s) => <td key={s}>{campo==='estimado' && filas.some((g) => g.moneda===moneda && g.semanas[s]?.sinEstimacion) ? 'Incompleto' : importe(filas.filter((g) => g.moneda===moneda).reduce((n,g) => n+(g.semanas[s]?.[campo] || 0),0))}</td>)}</tr>))}</tfoot>
      </table></div><p>Estados de cuotas: verde = pagadas · amarillo = pago parcial · rojo = pendientes. Totales separados por moneda.</p>
    </>}
  </section>
}
