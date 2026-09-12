import { useEffect, useMemo, useState } from 'react'
import * as api from '../api'
import Aviso from './Aviso'
import Modal from './Modal'
import GanttPagos from './GanttPagos'
import { fechaBreve, num, plata } from '../formato'

export default function PresupuestosProyecto({ obraId, proyecto, editable, alActualizar }) {
  const [datos, setDatos] = useState(null)
  const [error, setError] = useState(null)
  const [seleccionado, setSeleccionado] = useState(null)
  const [cargando, setCargando] = useState(true)

  const cargar = async () => {
    setCargando(true)
    try {
      const listado = await api.get(`/api/obras/${obraId}/proyecto/presupuestos`)
      const confirmados = listado.presupuestos.filter((p) => p.estado === 'confirmado')
      const detalles = await Promise.all(confirmados.map(async (p) => {
        try { return { ...p, detalle: await api.get(`/api/obras/${obraId}/presupuestos/${p.id}`) } }
        catch { return p }
      }))
      setDatos({ ...listado, presupuestos: detalles })
      setError(null)
    } catch (e) {
      // La migración es activable por separado: la pantalla principal sigue
      // siendo útil mientras Azure todavía devuelve 503 en este módulo.
      setError(e)
    } finally { setCargando(false) }
  }
  useEffect(() => { cargar() }, [obraId, proyecto.version])

  const tareas = useMemo(() => proyecto.tareas.filter((t) => t.tipo !== 'grupo'), [proyecto.tareas])
  const calendario = useMemo(() => (datos?.presupuestos || []).filter((p) => p.elegido).flatMap((p) =>
    (p.detalle?.cuotas || []).filter((c) => c.estado !== 'anulada').map((c) => ({ ...c, presupuesto: p.nombre, presupuesto_id: p.id, moneda: p.moneda, elegido: p.elegido })))
    .sort((a, b) => String(a.fecha_prevista).localeCompare(String(b.fecha_prevista))), [datos])

  if (cargando && !datos) return <section className="pr-panel pr-finanzas"><p className="ob-cargando">Cargando presupuestos vinculados…</p></section>
  if (error && error.status === 503) return <section className="pr-panel pr-finanzas"><div className="pr-finanzas__vacio"><h2>Presupuestos del proyecto</h2><p>La migración financiera todavía no está activada en esta base. El cronograma ya puede usarse y los presupuestos existentes siguen disponibles en su sección.</p></div></section>
  if (error) return <section className="pr-panel pr-finanzas"><Aviso error={error} alCerrar={() => setError(null)} /><button className="ob-btn" onClick={cargar}>Reintentar</button></section>

  return <>
    <section className="pr-panel pr-finanzas">
      <div className="pr-panel__titulo"><div><h2>Presupuestos vinculados</h2><p>Un acuerdo puede cubrir varias tareas; los grupos no se duplican.</p></div>
        <button className="ob-btn" onClick={cargar}>Actualizar</button></div>
      {datos.presupuestos.length === 0 ? <div className="pr-finanzas__vacio"><p>No hay presupuestos confirmados para vincular. Cargalos desde Presupuestos y volvé acá.</p></div> :
        <div className="pr-presupuestos">
          {datos.presupuestos.map((p) => <article className="pr-presupuesto" key={p.id}>
            <div><span className="ob-label">{p.elegido ? 'Elegido' : 'Confirmado'}</span><h3>{p.nombre}</h3>
              <p>{p.tareas} tarea(s) · {p.fecha_inicio ? `${fechaBreve(p.fecha_inicio)} — ${fechaBreve(p.fecha_fin)}` : 'Sin tareas con fechas'}</p></div>
            <strong className="ob-num">{plata(p.monto_base)} {p.moneda}</strong>
            {editable && <button className="ob-btn" onClick={() => setSeleccionado(p)}>Vincular tareas</button>}
          </article>)}
        </div>}
    </section>
    <GanttPagos cuotas={calendario} />
    {calendario.length > 0 && <section className="pr-panel pr-finanzas">
      <div className="pr-panel__titulo"><div><h2>Compromisos de pago</h2><p>Fechas previstas de cuotas; el pago real se registra por separado.</p></div>
        <span className="ob-label">{calendario.length} cuotas</span></div>
      <div className="pr-calendario"><table className="ob-table"><thead><tr><th>Fecha</th><th>Presupuesto</th><th>Concepto</th><th className="ob-num">Proyectado</th><th>Estado</th></tr></thead>
        <tbody>{calendario.map((c) => <tr key={`${c.presupuesto_id}-${c.id}`}><td>{fechaBreve(c.fecha_prevista)}</td><td>{c.presupuesto}</td><td>{c.descripcion}</td><td className="ob-num">{c.monto_proyectado == null ? '—' : plata(c.monto_proyectado)}</td><td><span className={`ob-chip ob-chip--${c.estado_coef === 'proyectado' ? 'warn' : c.estado_coef === 'sin_datos' ? 'bad' : 'ok'}`}>{c.estado_coef || c.estado}</span></td></tr>)}</tbody></table></div>
    </section>}
    {seleccionado && <Vincular obraId={obraId} presupuesto={seleccionado} tareas={tareas} version={datos.version}
      alCerrar={() => setSeleccionado(null)} alGuardar={() => { setSeleccionado(null); cargar(); alActualizar?.() }} />}
  </>
}

function Vincular({ obraId, presupuesto, tareas, version, alCerrar, alGuardar }) {
  const [ids, setIds] = useState(new Set(presupuesto.tarea_ids || []))
  const [error, setError] = useState(null)
  const [guardando, setGuardando] = useState(false)
  const alternar = (id) => setIds((actual) => { const n = new Set(actual); n.has(id) ? n.delete(id) : n.add(id); return n })
  const guardar = async () => {
    setGuardando(true); setError(null)
    try { await api.put(`/api/obras/${obraId}/proyecto/presupuestos/${presupuesto.id}/tareas`, { version, tarea_ids: [...ids] }); alGuardar() }
    catch (e) { setError(e); setGuardando(false) }
  }
  return <Modal titulo="Vincular tareas" bajada={`${presupuesto.nombre} · seleccioná qué trabajo cubre este acuerdo.`} alCerrar={alCerrar}>
    <Aviso error={error} alCerrar={() => setError(null)} />
    <div className="pr-lista-tareas">{tareas.map((t) => <label key={t.id} className="pr-check-tarea"><input type="checkbox" checked={ids.has(t.id)} onChange={() => alternar(t.id)} disabled={guardando} /><span><b>{t.nombre}</b><small>{t.fecha_inicio ? `${fechaBreve(t.fecha_inicio)} — ${fechaBreve(t.fecha_fin)}` : 'Sin fechas'}</small></span></label>)}</div>
    <footer className="pr-editor__acciones"><button className="ob-btn" disabled={guardando} onClick={alCerrar}>Cancelar</button><button className="ob-btn ob-btn--primario" disabled={guardando} onClick={guardar}>{guardando ? 'Guardando…' : `Vincular ${ids.size} tarea(s)`}</button></footer>
  </Modal>
}
