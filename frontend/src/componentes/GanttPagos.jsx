import { useMemo } from 'react'
import { plata, fechaBreve } from '../formato'

export default function GanttPagos({ cuotas }) {
  const meses = useMemo(() => [...new Set(cuotas.map((c) => c.fecha_prevista?.slice(0, 7)).filter(Boolean))].sort(), [cuotas])
  const grupos = useMemo(() => [...new Map(cuotas.map((c) => [c.presupuesto_id, { id: c.presupuesto_id, nombre: c.presupuesto, moneda: c.moneda }])).values()], [cuotas])
  return <section className="pr-panel pr-finanzas">
    <div className="pr-panel__titulo"><div><h2>Gantt de pagos</h2><p>Compromisos de presupuestos elegidos. Importes pactados y estimados; no representan pagos realizados.</p></div></div>
    {!meses.length ? <p className="pr-finanzas__vacio">Elegí y confirmá un presupuesto con cuotas para ver su calendario.</p> :
      <div style={{ overflowX: 'auto' }}><table className="ob-table" style={{ minWidth: Math.max(600, meses.length * 190 + 220) }}>
        <thead><tr><th>Presupuesto</th>{meses.map((mes) => <th key={mes}>{mes.slice(5)}/{mes.slice(0, 4)}</th>)}</tr></thead>
        <tbody>{grupos.map((g) => <tr key={g.id}><th>{g.nombre}<br />{g.moneda}</th>{meses.map((mes) => <td key={mes} style={{ verticalAlign: 'top', minWidth: 190 }}>
          {cuotas.filter((c) => c.presupuesto_id === g.id && c.fecha_prevista?.startsWith(mes)).map((c) => <div key={c.id} style={{ background: 'var(--ob-bg)', borderLeft: '4px solid var(--ob-ink-2)', padding: '.5rem', marginBottom: '.5rem' }}>
            <strong>{fechaBreve(c.fecha_prevista)}</strong> · {c.descripcion}<br />
            Pactado: {plata(c.monto_nominal)}<br />
            Estimado: {c.monto_proyectado == null ? 'Sin datos' : plata(c.monto_proyectado)}
          </div>)}
        </td>)}</tr>)}</tbody>
      </table></div>}
  </section>
}
