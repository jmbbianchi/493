import { useEffect, useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import * as api from '../api'
import Aviso from '../componentes/Aviso'
import { estaActivo } from '../listas'

/**
 * Las listas desplegables, en un solo lugar.
 *
 * Son dos: rubros y tipos. Todo el resto de los desplegables de la app
 * —moneda, medio de pago, periodicidad— son opciones del motor y no
 * listas: detrás de cada valor hay una cuenta distinta, y cambiarles el
 * nombre no los haría configurables, los haría mentirosos.
 *
 * Se renombra, se reordena y se oculta. No se borra. Por eso cada fila
 * dice dónde está usada: es lo único que distingue renombrar un rubro
 * vivo —que le cambia el nombre a la historia— de aprovechar uno que
 * sobra, que no le cambia nada a nadie.
 */
const SECCIONES = [
  ['rubros', 'Rubros', 'El desplegable de Rubro en presupuestos, pagos y materiales.'],
  ['subrubros', 'Tipos', 'El desplegable de Tipo: materiales, mano de obra, equipos.'],
]

// Tiene que ser igual al USOS del backend: la pantalla dice «libre» y
// del otro lado hay un botón de borrar. Si acá faltara uno, diría libre
// sobre algo que no lo está. El que manda es el backend, que vuelve a
// comprobarlo adentro del DELETE.
const USOS = {
  rubros: [['presupuestos', 'presupuesto'], ['pagos', 'pago'],
    ['materiales', 'material'], ['tareas', 'tarea'], ['documentos', 'documento'],
    ['proyectos', 'rubro del cronograma']],
  subrubros: [['presupuestos', 'presupuesto'], ['pagos', 'pago'],
    ['computo', 'renglón de cómputo']],
}

const plural = (n, palabra) => `${n} ${palabra}${n === 1 ? '' : 's'}`

export default function Listas() {
  const { obra } = useOutletContext()
  const [datos, setDatos] = useState(null)
  const [error, setError] = useState(null)

  const cargar = async () => {
    try { setDatos(await api.get(`/api/obras/${obra.id}/listas`)) }
    catch (e) { setError(e) }
  }
  useEffect(() => { cargar() }, [obra.id])

  if (error) return <Aviso error={error} alCerrar={() => { setError(null); cargar() }} />
  if (!datos) return <p className="ob-cargando">Cargando…</p>

  return (
    <>
      <div className="ob-toolbar">
        <span className="ob-label">Listas desplegables</span>
      </div>
      <p className="ob-nota">
        Las listas son compartidas por todas tus obras: lo que renombres acá
        se renombra en todas. Sólo se puede borrar lo que no usa nadie; lo
        demás se oculta, y sigue intacto en lo que ya cargaste.
      </p>
      {SECCIONES.map(([clave, titulo, bajada]) => (
        <Seccion key={clave} clave={clave} titulo={titulo} bajada={bajada}
          obra={obra} items={datos[clave]} alCambiar={cargar} />
      ))}
    </>
  )
}

function Seccion({ clave, titulo, bajada, obra, items, alCambiar }) {
  // El orden se mueve en la pantalla y se guarda de una. Mandar un PUT
  // por cada flecha dejaría la lista a medio ordenar si algo falla en el
  // medio, y encima despierta la base cinco veces para un solo cambio.
  const [orden, setOrden] = useState(items)
  const [sucio, setSucio] = useState(false)
  const [error, setError] = useState(null)
  const [ocupado, setOcupado] = useState(false)
  useEffect(() => { setOrden(items); setSucio(false) }, [items])

  const mover = (i, paso) => {
    const j = i + paso
    if (j < 0 || j >= orden.length) return
    const copia = [...orden]
    copia[i] = orden[j]; copia[j] = orden[i]
    setOrden(copia); setSucio(true)
  }

  const guardarOrden = async () => {
    setOcupado(true); setError(null)
    try {
      await api.put(`/api/obras/${obra.id}/listas/${clave}/orden`, orden.map((x) => x.id))
      await alCambiar()
    } catch (e) { setError(e) } finally { setOcupado(false) }
  }

  const activos = orden.filter(estaActivo).length

  return (
    <section style={{ marginTop: 'var(--ob-gap-4)' }}>
      <div className="ob-toolbar">
        <span className="ob-label">{titulo}</span>
        <span className="ob-toolbar__meta">
          {activos} a la vista de {orden.length}
          {sucio && <button className="ob-btn ob-btn--primario" disabled={ocupado}
            style={{ marginLeft: 'var(--ob-gap-3)' }} onClick={guardarOrden}>
            {ocupado ? 'Guardando…' : 'Guardar el orden'}
          </button>}
        </span>
      </div>
      <p className="ob-nota">{bajada}</p>
      <Aviso error={error} alCerrar={() => setError(null)} />

      <div className="ob-tablewrap">
        <table className="ob-table">
          <thead>
            <tr>
              <th style={{ width: '6rem', whiteSpace: 'nowrap' }}>Orden</th>
              <th style={{ minWidth: '13rem' }}>Nombre</th>
              <th style={{ minWidth: '12rem' }}>Dónde está usado</th>
              <th style={{ width: '16.5rem' }}></th>
            </tr>
          </thead>
          <tbody>
            {orden.map((x, i) => (
              <Fila key={x.id} item={x} clave={clave} obra={obra} posicion={i}
                ultimo={i === orden.length - 1}
                alMover={mover} alCambiar={alCambiar} />
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}

function Fila({ item, clave, obra, posicion, ultimo, alMover, alCambiar }) {
  const [nombre, setNombre] = useState(null)
  const [error, setError] = useState(null)
  const [ocupado, setOcupado] = useState(false)
  const visible = estaActivo(item)

  const usos = USOS[clave]
    .map(([campo, palabra]) => [item[campo] ?? 0, palabra])
    .filter(([n]) => n > 0)
  const total = usos.reduce((s, [n]) => s + n, 0)

  const guardar = async (cuerpo) => {
    setOcupado(true); setError(null)
    try { await api.patch(`/api/obras/${obra.id}/listas/${clave}/${item.id}`, cuerpo); await alCambiar() }
    catch (e) { setError(e); setOcupado(false) }
  }

  const borrar = async () => {
    if (!confirm(`Borrar «${item.nombre}» de la lista.\n\n`
      + 'No lo usa ningún presupuesto, pago, material ni tarea, así que no se '
      + 'pierde nada cargado. No se puede deshacer: habría que crearlo de nuevo.')) return
    setOcupado(true); setError(null)
    try { await api.borrar(`/api/obras/${obra.id}/listas/${clave}/${item.id}`); await alCambiar() }
    catch (e) { setError(e); setOcupado(false) }
  }

  const renombrar = async () => {
    const limpio = nombre.trim()
    if (!limpio || limpio === item.nombre) { setNombre(null); return }
    // Renombrar algo en uso no rompe nada, pero le cambia el nombre a lo
    // que ya pasó: el pago que decía Cementista va a decir otra cosa.
    if (total && !confirm(
      `«${item.nombre}» está usado en ${usos.map(([n, p]) => plural(n, p)).join(', ')}.\n\n`
      + `Renombrarlo a «${limpio}» les cambia el nombre también a esos. Nada se borra.`)) return
    setNombre(null)
    await guardar({ nombre: limpio })
  }

  return (
    <tr style={visible ? undefined : { opacity: .55 }}>
      <td style={{ whiteSpace: 'nowrap' }}>
        <button className="ob-btn" style={{ padding: '.05rem .35rem' }} disabled={!posicion}
          aria-label="Subir" onClick={() => alMover(posicion, -1)}>↑</button>
        <button className="ob-btn" style={{ padding: '.05rem .35rem', marginLeft: '.2rem' }}
          disabled={ultimo} aria-label="Bajar" onClick={() => alMover(posicion, 1)}>↓</button>
      </td>
      <td className="ob-table__strong">
        {nombre === null ? (
          <>
            {item.nombre}
            {!visible && <span className="ob-chip ob-chip--mudo" style={{ marginLeft: '.4rem' }}>oculto</span>}
          </>
        ) : (
          <span style={{ display: 'flex', gap: '.3rem' }}>
            <input className="ob-input" autoFocus value={nombre} maxLength={clave === 'rubros' ? 80 : 60}
              aria-label="Nombre" onChange={(e) => setNombre(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') { e.preventDefault(); renombrar() }
                if (e.key === 'Escape') setNombre(null)
              }} />
            <button className="ob-btn" disabled={ocupado} onClick={renombrar}>Guardar</button>
            <button className="ob-btn" onClick={() => setNombre(null)}>Cancelar</button>
          </span>
        )}
        {error && <div style={{ color: 'var(--ob-bad)', fontSize: 'var(--ob-fs-sm)' }}>{String(error.message)}</div>}
      </td>
      <td className="ob-table__sec">
        {total === 0
          ? <span title="No lo usa nadie: renombralo y pasa a ser otra cosa, sin consecuencias.">libre</span>
          : usos.map(([n, p]) => plural(n, p)).join(' · ')}
      </td>
      <td style={{ whiteSpace: 'nowrap' }}>
        <button className="ob-btn" style={{ padding: '.05rem .4rem' }} disabled={ocupado}
          onClick={() => setNombre(item.nombre)}>Renombrar</button>
        <button className="ob-btn" style={{ padding: '.05rem .4rem', marginLeft: '.3rem' }}
          disabled={ocupado} onClick={() => guardar({ activo: !visible })}>
          {visible ? 'Ocultar' : 'Mostrar'}
        </button>
        {/* Borrar aparece sólo en lo que no usa nadie. Mostrarlo gris en
            todo lo demás sería ofrecer algo que nunca va a andar. */}
        {total === 0 && <button className="ob-btn" style={{ padding: '.05rem .4rem', marginLeft: '.3rem' }}
          disabled={ocupado} onClick={borrar}>Borrar</button>}
      </td>
    </tr>
  )
}
