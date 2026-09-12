import { useMemo, useState } from 'react'
import { fechaBreve as fmtFecha, num } from '../formato'

const DIA = 86400000
const instante = (f) => Date.parse(`${f}T00:00:00Z`)
const iso = (t) => new Date(t).toISOString().slice(0, 10)
const dias = (a, b) => Math.round((instante(b) - instante(a)) / DIA)
export const hoyLocal = () => {
  const f = new Date()
  return `${f.getFullYear()}-${String(f.getMonth() + 1).padStart(2, '0')}-${String(f.getDate()).padStart(2, '0')}`
}

export default function CronogramaProyecto({ datos, busqueda, agrupar, escala, editable, alEditar, alNueva, alRubro, alAvance }) {
  const [cerrados, setCerrados] = useState(new Set())
  const alternar = (id) => setCerrados((prev) => {
    const otro = new Set(prev)
    if (otro.has(id)) otro.delete(id); else otro.add(id)
    return otro
  })
  const hoy = hoyLocal()
  const ids = useMemo(() => new Map(datos.tareas.map((t) => [t.id, t])), [datos.tareas])
  const texto = busqueda.trim().toLocaleLowerCase('es')
  const visibles = new Set()
  for (const t of datos.tareas) {
    const rubro = datos.rubros.find((r) => r.id === t.rubro_id)?.nombre || ''
    if (!texto || `${t.nombre} ${t.responsable || ''} ${rubro}`.toLocaleLowerCase('es').includes(texto)) {
      visibles.add(t.id)
      let padre = ids.get(t.padre_id)
      while (padre && !visibles.has(padre.id)) { visibles.add(padre.id); padre = ids.get(padre.padre_id) }
    }
  }
  const filas = []
  if (agrupar === 'rubro') {
    for (const r of datos.rubros) {
      const suyas = datos.tareas.filter((t) => t.rubro_id === r.id && visibles.has(t.id))
      if (texto && !suyas.length) continue
      filas.push({ ...r, clave: `r-${r.id}`, clase: 'rubro', nivel: 0 })
      const agregar = (padre, nivel) => {
        for (const t of suyas.filter((t) => t.padre_id === padre)) {
          filas.push({ ...t, clave: t.id, clase: t.tipo, nivel })
          if (!cerrados.has(t.id) || texto) agregar(t.id, nivel + 1)
        }
      }
      if (!cerrados.has(`r-${r.id}`) || texto) agregar(null, 1)
    }
  } else {
    const grupos = new Map()
    for (const t of datos.tareas.filter((t) => t.tipo !== 'grupo' && visibles.has(t.id))) {
      const responsable = t.responsable || 'Sin asignar'
      if (!grupos.has(responsable)) grupos.set(responsable, [])
      grupos.get(responsable).push(t)
    }
    for (const [nombre, tareas] of [...grupos].sort(([a], [b]) => a.localeCompare(b, 'es'))) {
      const clave = `responsable-${nombre}`
      filas.push({ clave, nombre, clase: 'responsable', nivel: 0, cantidad_tareas: tareas.length })
      if (!cerrados.has(clave) || texto) tareas.forEach((t) => filas.push({ ...t, clave: t.id, clase: t.tipo, nivel: 1 }))
    }
  }
  const fechas = datos.tareas.flatMap((t) => [t.fecha_inicio, t.fecha_fin]).filter(Boolean).sort()
  const desde = iso(instante(fechas[0] || hoy) - 3 * DIA)
  const hasta = iso(instante(fechas.at(-1) || hoy) + 14 * DIA)
  const px = Math.min({ dia: 28, semana: 10, mes: 3 }[escala], 24000 / Math.max(1, dias(desde, hasta)))
  const ancho = Math.max(560, (dias(desde, hasta) + 1) * px)
  const paso = Math.max(escala === 'dia' ? 1 : escala === 'semana' ? 7 : 30, Math.ceil(65 / px))
  const marcas = []
  for (let n = 0; n <= ancho / px; n += paso) marcas.push({ left: n * px, fecha: iso(instante(desde) + n * DIA) })
  const estilo = { '--pr-tiempo': `${ancho}px`, '--pr-paso': `${paso * px}px` }
  return <div className="pr-scroll" tabIndex={0} aria-label="Tabla y Gantt; desplazamiento horizontal disponible">
    <table className="pr-tabla" style={estilo}>
      <caption className="sr-only">Cronograma agrupado por {agrupar}. Seleccioná una tarea para consultar o editar sus datos.</caption>
      <thead><tr><th scope="col" className="pr-nombre">Tarea / rubro</th><th scope="col" className="pr-responsable">Responsable</th>
        <th scope="col" className="pr-fecha">Inicio</th><th scope="col" className="pr-fecha">Fin</th><th scope="col" className="pr-porcentaje">Avance</th>
        <th scope="col" className="pr-tiempo"><span className="sr-only">Gantt</span><div className="pr-eje">
          {marcas.map((m) => <span key={m.fecha} style={{ left: m.left }}>{new Date(instante(m.fecha)).toLocaleDateString('es-AR', { day: 'numeric', month: 'short', timeZone: 'UTC' })}</span>)}
        </div></th></tr></thead>
      <tbody>{filas.map((t) => {
        const agrupador = ['rubro', 'grupo', 'responsable'].includes(t.clase)
        const abierta = !cerrados.has(t.clave) || !!texto
        const tarea = t.clase !== 'rubro' && t.clase !== 'responsable'
        const atraso = tarea && !agrupador && t.fecha_fin && t.fecha_fin < hoy && (t.avance_pct || 0) < 100
        const dependencias = (t.dependencias || []).map((d) => ids.get(d.depende_de_id)?.nombre || 'Tarea').join(', ')
        return <tr key={t.clave} className={`${agrupador ? 'pr-fila--grupo' : ''} ${atraso ? 'pr-fila--atraso' : ''}`}>
          <th scope="row" className="pr-nombre"><div className="pr-nombre__interior" style={{ paddingLeft: 10 + Math.min(t.nivel, 8) * 14 }}>
            {agrupador ? <button className="pr-expandir" aria-expanded={abierta} aria-label={`${abierta ? 'Contraer' : 'Expandir'} ${t.nombre}`} onClick={() => alternar(t.clave)}>{abierta ? '▾' : '▸'}</button>
              : <span className="pr-tipo" title={t.tipo === 'hito' ? 'Hito' : 'Tarea'}>{t.tipo === 'hito' ? '◆' : '─'}</span>}
            <div className="pr-nombre__texto">
              {t.clase === 'responsable' ? <span>{t.nombre}</span> :
                <button className="pr-enlace" title={t.nombre} onClick={() => t.clase === 'rubro' ? alRubro(t) : alEditar(t)}>{t.nombre}</button>}
              <small>{agrupador ? `${t.cantidad_tareas || 0} tareas e hitos` :
                [t.duracion != null ? (t.tipo === 'hito' ? 'Hito' : `${t.duracion} días`) : 'Sin programar', atraso ? 'Atrasada' : '', dependencias ? `Después de: ${dependencias}` : ''].filter(Boolean).join(' · ')}</small>
            </div>
            {editable && ['rubro', 'grupo'].includes(t.clase) && <button className="pr-agregar" aria-label={`Agregar tarea en ${t.nombre}`}
              onClick={() => alNueva('tarea', { rubro_id: t.clase === 'rubro' ? t.id : t.rubro_id, padre_id: t.clase === 'grupo' ? t.id : null })}>+</button>}
          </div></th>
          <td className="pr-responsable" title={t.responsable || ''}>{t.responsable || '—'}</td>
          <td className="pr-fecha ob-num">{t.fecha_inicio ? fmtFecha(t.fecha_inicio) : '—'}</td>
          <td className="pr-fecha ob-num">{t.fecha_fin ? fmtFecha(t.fecha_fin) : '—'}</td>
          <td className="pr-porcentaje ob-num">{tarea && !agrupador ?
            <button className="pr-enlace" aria-label={`Avance de ${t.nombre}`} onClick={() => alAvance(t)}>{t.tiene_avance ? `${num(t.avance_pct, 0)} %` : editable ? 'Registrar' : '—'}</button>
            : t.tiene_avance ? `${num(t.avance_pct, 0)} %` : '—'}</td>
          <td className="pr-tiempo"><div className="pr-pista">
            {hoy >= desde && dias(desde, hoy) * px <= ancho && <span className="pr-hoy" style={{ left: dias(desde, hoy) * px }} title="Hoy" />}
            {t.fecha_inicio && t.fecha_fin ? <button className={`pr-barra ${agrupador ? 'pr-barra--grupo' : ''} ${t.tipo === 'hito' ? 'pr-barra--hito' : ''}`}
              aria-label={`${t.nombre}: ${fmtFecha(t.fecha_inicio)} a ${fmtFecha(t.fecha_fin)}`}
              title={`${t.nombre} · ${fmtFecha(t.fecha_inicio)} — ${fmtFecha(t.fecha_fin)}${dependencias ? ` · Después de ${dependencias}` : ''}`}
              onClick={() => t.clase === 'rubro' ? alRubro(t) : alEditar(t)}
              style={{ left: dias(desde, t.fecha_inicio) * px, width: t.tipo === 'hito' ? 12 : Math.max(5, (dias(t.fecha_inicio, t.fecha_fin) + 1) * px) }}>
              <span className="pr-barra__avance" style={{ width: `${t.avance_pct || 0}%` }} />
            </button> : tarea && !agrupador ? <button className="pr-programar" onClick={() => alEditar(t)}>{editable ? '+ Programar' : 'Sin fechas'}</button> : null}
          </div></td>
        </tr>
      })}</tbody>
    </table>
    {!filas.length && <p className="pr-sinresultados">No hay tareas que coincidan con la búsqueda o la agrupación.</p>}
  </div>
}
