import { useEffect, useState } from 'react'
import * as api from '../api'
import Editable from '../componentes/Editable'
import Aviso from '../componentes/Aviso'
import { num } from '../formato'

/**
 * Los rendimientos: cuanto consume cada tarea de cada material.
 * Es el nucleo del motor y, segun la obra, lo que mas se ajusta.
 * Lo que edites queda en esta obra; lo que no toques sigue a la biblioteca.
 */
export default function Rendimientos({ obra, alCambiar }) {
  const [tareas, setTareas] = useState([])
  const [elegida, setElegida] = useState(null)
  const [filas, setFilas] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    api.get(`/api/obras/${obra.id}/tareas`)
      .then((t) => { setTareas(t); setElegida(t[0] || null) })
      .catch(setError)
  }, [obra.id])

  const cargar = async (tarea) => {
    if (!tarea) return
    try { setFilas(await api.get(`/api/obras/${obra.id}/tareas/${tarea.id}/rendimientos`)) }
    catch (e) { setError(e) }
  }
  useEffect(() => { setFilas(null); cargar(elegida) }, [elegida?.id])

  const guardar = async (material_id, consumo) => {
    if (consumo == null || consumo <= 0) return
    try {
      await api.put(`/api/obras/${obra.id}/tareas/${elegida.id}/rendimientos/${material_id}`, { consumo })
      await cargar(elegida); alCambiar?.()
    } catch (e) { setError(e) }
  }

  const restaurar = async (material_id) => {
    try {
      await api.borrar(`/api/obras/${obra.id}/tareas/${elegida.id}/rendimientos/${material_id}`)
      await cargar(elegida); alCambiar?.()
    } catch (e) { setError(e) }
  }

  return (
    <>
      <Aviso error={error} alCerrar={() => setError(null)} />

      <div className="ob-toolbar">
        <select className="ob-input" style={{ minWidth: '26rem' }}
          value={elegida?.id ?? ''}
          onChange={(e) => setElegida(tareas.find((t) => String(t.id) === e.target.value))}>
          {tareas.map((t) => <option key={t.id} value={t.id}>{t.rubro} · {t.nombre}</option>)}
        </select>
        <span className="ob-toolbar__meta">
          {elegida ? `Consumo por ${elegida.unidad_medicion} de tarea` : ''}
        </span>
      </div>

      {!filas ? (
        <p style={{ padding: 'var(--ob-gap-4)', color: 'var(--ob-ink-3)' }}>Cargando rendimientos…</p>
      ) : (
        <div className="ob-tablewrap">
          <table className="ob-table">
            <thead>
              <tr>
                <th className="ob-table__gutter"></th>
                <th>Material</th><th>Presentacion</th>
                <th className="ob-num">Consumo</th><th>Un.</th>
                <th className="ob-num">Desperdicio</th><th></th>
              </tr>
            </thead>
            <tbody>
              {filas.map((f, i) => (
                <tr key={f.material_id}>
                  <td className="ob-table__gutter">{i + 1}</td>
                  <td>{f.material}
                    {f.editado ? <span className="ob-chip ob-chip--mudo" style={{ marginLeft: '.4rem' }}>ajustado</span> : null}</td>
                  <td className="ob-table__sec">{f.presentacion || '—'}</td>
                  <td className="ob-num">
                    <Editable valor={f.consumo} formato="numero" decimales={6}
                      alGuardar={(v) => guardar(f.material_id, v)} />
                  </td>
                  <td className="ob-table__sec">{f.unidad_consumo}</td>
                  <td className="ob-num ob-table__sec">
                    {f.desperdicio_pct == null ? 'hereda' : num(f.desperdicio_pct, 2) + ' %'}
                  </td>
                  <td style={{ width: '6rem' }}>
                    {f.editado && (
                      <button className="ob-btn" style={{ padding: '.05rem .4rem' }}
                        onClick={() => restaurar(f.material_id)}
                        title="Vuelve al valor de la biblioteca">Restaurar</button>
                    )}
                  </td>
                </tr>
              ))}
              {filas.length === 0 && (
                <tr><td colSpan={7} style={{ color: 'var(--ob-ink-3)', padding: 'var(--ob-gap-4)' }}>
                  Esta tarea todavia no tiene materiales asociados.
                </td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </>
  )
}
