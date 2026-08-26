import { useEffect, useState } from 'react'
import * as api from '../api'
import Editable from '../componentes/Editable'
import Aviso from '../componentes/Aviso'
import { num, porGrupo } from '../formato'

/** El computo: que tarea, donde, cuanto. Es la entrada del motor. */
export default function Computo({ obra, alCambiar }) {
  const [filas, setFilas] = useState(null)
  const [tareas, setTareas] = useState([])
  const [error, setError] = useState(null)
  const [nueva, setNueva] = useState({ tarea_tipo_id: '', ubicacion: '', cantidad: '' })

  const cargar = async () => {
    try {
      const [f, t] = await Promise.all([
        api.get(`/api/obras/${obra.id}/computo`),
        api.get(`/api/obras/${obra.id}/tareas`),
      ])
      setFilas(f); setTareas(t)
    } catch (e) { setError(e) }
  }

  useEffect(() => { setFilas(null); cargar() }, [obra.id])

  const agregar = async (e) => {
    e.preventDefault()
    if (!nueva.tarea_tipo_id || !nueva.cantidad) return
    try {
      await api.post(`/api/obras/${obra.id}/computo`, {
        tarea_tipo_id: Number(nueva.tarea_tipo_id),
        ubicacion: nueva.ubicacion || null,
        cantidad: Number(String(nueva.cantidad).replace(',', '.')),
      })
      setNueva({ tarea_tipo_id: '', ubicacion: '', cantidad: '' })
      await cargar(); alCambiar?.()
    } catch (e) { setError(e) }
  }

  const editar = async (id, campos) => {
    try { await api.patch(`/api/obras/${obra.id}/computo/${id}`, campos); await cargar(); alCambiar?.() }
    catch (e) { setError(e) }
  }

  const quitar = async (id) => {
    try { await api.borrar(`/api/obras/${obra.id}/computo/${id}`); await cargar(); alCambiar?.() }
    catch (e) { setError(e) }
  }

  if (!filas) return <p style={{ padding: 'var(--ob-gap-4)', color: 'var(--ob-ink-3)' }}>Cargando el computo…</p>

  const total = filas.reduce((a, f) => a + Number(f.cantidad), 0)

  return (
    <>
      <Aviso error={error} alCerrar={() => setError(null)} />

      <div className="ob-tablewrap">
        <table className="ob-table">
          <thead>
            <tr>
              <th className="ob-table__gutter"></th>
              <th>Tarea</th><th>Ubicacion</th>
              <th className="ob-num">Cantidad</th><th>Un.</th><th></th>
            </tr>
          </thead>
          {porGrupo(filas, 'rubro').map((g) => (
            <tbody key={g.nombre}>
              <tr className="ob-grupo">
                <td></td>
                <td colSpan={6}>{g.nombre} · {g.filas.length} {g.filas.length === 1 ? 'fila' : 'filas'}</td>
              </tr>
              {g.filas.map((f) => (
                <tr key={f.id}>
                  <td className="ob-table__gutter">{filas.indexOf(f) + 1}</td>
                  <td>{f.tarea}{f.cerrado ? <span className="ob-chip ob-chip--ok" style={{ marginLeft: '.5rem' }}>cerrada</span> : null}</td>
                  <td>
                    <Editable valor={f.ubicacion} deshabilitado={!!f.cerrado}
                      alGuardar={(v) => editar(f.id, { ubicacion: v })} vacio="sin ubicar" />
                  </td>
                  <td className="ob-num">
                    <Editable valor={f.cantidad} formato="numero" deshabilitado={!!f.cerrado}
                      alGuardar={(v) => editar(f.id, { cantidad: v })} />
                  </td>
                  <td className="ob-table__sec">{f.unidad_medicion}</td>
                  <td style={{ width: '4rem' }}>
                    {!f.cerrado && (
                      <button className="ob-btn" style={{ padding: '.05rem .4rem' }}
                        onClick={() => quitar(f.id)} title="Quitar la fila">Quitar</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          ))}
          {filas.length === 0 && (
            <tbody>
              <tr><td colSpan={6} style={{ color: 'var(--ob-ink-3)', padding: 'var(--ob-gap-4)' }}>
                Todavia no hay computo. Agrega la primera tarea abajo y la lista de compra se arma sola.
              </td></tr>
            </tbody>
          )}
          {filas.length > 0 && (
            <tfoot>
              <tr>
                <td className="ob-table__gutter"></td>
                <td colSpan={2}>{filas.length} filas de computo</td>
                <td className="ob-num ob-total">{num(total, 2)}</td>
                <td colSpan={2} className="ob-table__sec">suma de cantidades</td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      <form onSubmit={agregar} style={{
        display: 'flex', gap: 'var(--ob-gap-2)', alignItems: 'center',
        margin: '0 var(--ob-gap-4) var(--ob-gap-5)', flexWrap: 'wrap',
      }}>
        <select className="ob-input" style={{ minWidth: '22rem' }}
          value={nueva.tarea_tipo_id}
          onChange={(e) => setNueva({ ...nueva, tarea_tipo_id: e.target.value })}>
          <option value="">Elegi una tarea…</option>
          {tareas.map((t) => (
            <option key={t.id} value={t.id}>{t.rubro} · {t.nombre}</option>
          ))}
        </select>
        <input className="ob-input" placeholder="Ubicacion (PB, planta alta, perimetro…)"
          style={{ minWidth: '16rem' }}
          value={nueva.ubicacion}
          onChange={(e) => setNueva({ ...nueva, ubicacion: e.target.value })} />
        <input className="ob-input ob-num" placeholder="Cantidad" style={{ width: '7rem' }}
          inputMode="decimal"
          value={nueva.cantidad}
          onChange={(e) => setNueva({ ...nueva, cantidad: e.target.value })} />
        <button className="ob-btn ob-btn--primario" type="submit">Agregar al computo</button>
      </form>
    </>
  )
}
