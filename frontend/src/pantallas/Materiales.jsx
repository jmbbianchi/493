import { useEffect, useState } from 'react'
import * as api from '../api'
import Editable from '../componentes/Editable'
import Aviso from '../componentes/Aviso'
import { num, plata, fecha } from '../formato'

/**
 * Materiales y precios. Todo editable.
 * El precio NO se pisa: cada cambio escribe una fila nueva con su fecha.
 */
export default function Materiales({ obra, alCambiar }) {
  const [filas, setFilas] = useState(null)
  const [rubros, setRubros] = useState([])
  const [error, setError] = useState(null)
  const [historial, setHistorial] = useState(null)
  const [nuevo, setNuevo] = useState(null)

  const cargar = async () => {
    try {
      const [m, r] = await Promise.all([
        api.get(`/api/obras/${obra.id}/materiales`),
        api.get(`/api/obras/${obra.id}/rubros`),
      ])
      setFilas(m); setRubros(r)
    } catch (e) { setError(e) }
  }
  useEffect(() => { setFilas(null); cargar() }, [obra.id])

  const editar = async (id, campos) => {
    try { await api.patch(`/api/obras/${obra.id}/materiales/${id}`, campos); await cargar(); alCambiar?.() }
    catch (e) { setError(e) }
  }

  const ponerPrecio = async (material_id, importe) => {
    if (importe == null) return
    try {
      await api.post(`/api/obras/${obra.id}/precios`, { material_id, importe, iva_incluido: true })
      await cargar(); alCambiar?.()
    } catch (e) { setError(e) }
  }

  const verHistorial = async (m) => {
    try {
      const h = await api.get(`/api/obras/${obra.id}/materiales/${m.id}/precios`)
      setHistorial({ material: m, filas: h })
    } catch (e) { setError(e) }
  }

  const crear = async (e) => {
    e.preventDefault()
    try {
      await api.post(`/api/obras/${obra.id}/materiales`, {
        ...nuevo,
        rubro_id: Number(nuevo.rubro_id),
        unidades_x_pres: Number(String(nuevo.unidades_x_pres || 1).replace(',', '.')),
      })
      setNuevo(null); await cargar(); alCambiar?.()
    } catch (e) { setError(e) }
  }

  if (!filas) return <p style={{ padding: 'var(--ob-gap-4)', color: 'var(--ob-ink-3)' }}>Cargando materiales…</p>

  return (
    <>
      <Aviso error={error} alCerrar={() => setError(null)} />

      <div className="ob-toolbar">
        <span className="ob-label">{filas.length} materiales en esta obra</span>
        <span className="ob-toolbar__meta">
          Editar un precio agrega una fila nueva con la fecha de hoy: el historial no se pierde
        </span>
      </div>

      <div className="ob-tablewrap">
        <table className="ob-table">
          <thead>
            <tr>
              <th className="ob-table__gutter"></th>
              <th>Material</th><th>Marca</th><th>Un.</th>
              <th>Presentacion</th>
              <th className="ob-num">Contenido</th>
              <th className="ob-num">Precio</th>
              <th>Desde</th><th></th>
            </tr>
          </thead>
          <tbody>
            {filas.map((m, i) => (
              <tr key={m.id}>
                <td className="ob-table__gutter">{i + 1}</td>
                <td>
                  <Editable valor={m.nombre} alGuardar={(v) => editar(m.id, { nombre: v })} />
                  {m.propio ? <span className="ob-chip ob-chip--ok" style={{ marginLeft: '.4rem' }}>propio</span>
                    : m.editado ? <span className="ob-chip ob-chip--mudo" style={{ marginLeft: '.4rem' }}>editado</span> : null}
                </td>
                <td><Editable valor={m.marca} alGuardar={(v) => editar(m.id, { marca: v })} vacio="sin marca" /></td>
                <td className="ob-table__sec">{m.unidad_consumo}</td>
                <td><Editable valor={m.presentacion} alGuardar={(v) => editar(m.id, { presentacion: v })} /></td>
                <td className="ob-num">
                  <Editable valor={m.unidades_x_pres} formato="numero" decimales={4}
                    alGuardar={(v) => editar(m.id, { unidades_x_pres: v })}
                    titulo="Cuanto trae la presentacion, en la unidad de consumo" />
                </td>
                <td className="ob-num">
                  <Editable valor={m.precio} formato="plata"
                    alGuardar={(v) => ponerPrecio(m.id, v)}
                    vacio="cargar" titulo="Escribe el precio: se guarda como fila nueva" />
                </td>
                <td className="ob-table__sec">{fecha(m.precio_desde)}</td>
                <td style={{ width: '5rem' }}>
                  {m.precio != null && (
                    <button className="ob-btn" style={{ padding: '.05rem .4rem' }}
                      onClick={() => verHistorial(m)}>Historial</button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div style={{ margin: '0 var(--ob-gap-4) var(--ob-gap-5)' }}>
        {!nuevo ? (
          <button className="ob-btn" onClick={() => setNuevo({
            codigo: '', nombre: '', rubro_id: rubros[0]?.id ?? '', unidad_consumo: 'u',
            marca: '', presentacion: '', unidades_x_pres: 1,
          })}>Agregar un material que no esta</button>
        ) : (
          <form onSubmit={crear} className="ob-card"
            style={{ padding: 'var(--ob-gap-4)', display: 'grid', gap: 'var(--ob-gap-2)',
                     gridTemplateColumns: 'repeat(auto-fit, minmax(9rem, 1fr))', alignItems: 'end' }}>
            <label><span className="ob-label">Codigo</span>
              <input className="ob-input" required style={{ width: '100%' }} value={nuevo.codigo}
                onChange={(e) => setNuevo({ ...nuevo, codigo: e.target.value })} /></label>
            <label style={{ gridColumn: 'span 2' }}><span className="ob-label">Nombre</span>
              <input className="ob-input" required style={{ width: '100%' }} value={nuevo.nombre}
                onChange={(e) => setNuevo({ ...nuevo, nombre: e.target.value })} /></label>
            <label><span className="ob-label">Rubro</span>
              <select className="ob-input" style={{ width: '100%' }} value={nuevo.rubro_id}
                onChange={(e) => setNuevo({ ...nuevo, rubro_id: e.target.value })}>
                {rubros.map((r) => <option key={r.id} value={r.id}>{r.nombre}</option>)}
              </select></label>
            <label><span className="ob-label">Unidad</span>
              <input className="ob-input" required style={{ width: '100%' }} value={nuevo.unidad_consumo}
                onChange={(e) => setNuevo({ ...nuevo, unidad_consumo: e.target.value })} /></label>
            <label><span className="ob-label">Marca</span>
              <input className="ob-input" style={{ width: '100%' }} value={nuevo.marca}
                onChange={(e) => setNuevo({ ...nuevo, marca: e.target.value })} /></label>
            <label><span className="ob-label">Presentacion</span>
              <input className="ob-input" style={{ width: '100%' }} value={nuevo.presentacion}
                onChange={(e) => setNuevo({ ...nuevo, presentacion: e.target.value })} /></label>
            <label><span className="ob-label">Contenido</span>
              <input className="ob-input ob-num" style={{ width: '100%' }} inputMode="decimal"
                value={nuevo.unidades_x_pres}
                onChange={(e) => setNuevo({ ...nuevo, unidades_x_pres: e.target.value })} /></label>
            <div style={{ display: 'flex', gap: '.4rem' }}>
              <button className="ob-btn ob-btn--primario" type="submit">Guardar</button>
              <button className="ob-btn" type="button" onClick={() => setNuevo(null)}>Cancelar</button>
            </div>
          </form>
        )}
      </div>

      {historial && (
        <div className="ob-card" style={{ margin: '0 var(--ob-gap-4) var(--ob-gap-5)', padding: 'var(--ob-gap-4)' }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 'var(--ob-gap-3)' }}>
            <span className="ob-label">Historial de precio</span>
            <strong>{historial.material.nombre}</strong>
            <button className="ob-btn" style={{ marginLeft: 'auto', padding: '.05rem .4rem' }}
              onClick={() => setHistorial(null)}>Cerrar</button>
          </div>
          <table className="ob-table" style={{ marginTop: 'var(--ob-gap-3)' }}>
            <thead><tr><th>Desde</th><th className="ob-num">Importe</th><th>IVA</th><th className="ob-num">Final</th></tr></thead>
            <tbody>
              {historial.filas.map((p) => (
                <tr key={p.id}>
                  <td>{fecha(p.vigente_desde)}</td>
                  <td className="ob-num">{plata(p.importe)}</td>
                  <td className="ob-table__sec">{p.iva_incluido ? 'incluido' : `+ ${num(p.alicuota_iva, 0)} %`}</td>
                  <td className="ob-num ob-table__strong">{plata(p.importe_final)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  )
}
