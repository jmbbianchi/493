import { Children, cloneElement, isValidElement, useEffect, useId, useRef, useState } from 'react'
import * as api from '../api'
import Aviso from './Aviso'
import { hoyLocal } from './CronogramaProyecto'
import { fechaBreve as fmtFecha, num } from '../formato'

export default function EditorProyecto({ editor, proyecto, obraId, alCerrar, alGuardar }) {
  const original = editor.datos
  const clase = editor.clase
  const [form, setForm] = useState(() => ({
    nombre: original.nombre || '', rubro_id: original.rubro_id || proyecto.rubros[0]?.id || '',
    padre_id: original.padre_id || '', tipo: original.tipo || 'tarea', responsable: original.responsable || '',
    fecha_inicio: original.tipo === 'grupo' ? '' : original.fecha_inicio || '',
    fecha_fin: original.tipo === 'grupo' ? '' : original.fecha_fin || '',
    orden: original.orden ?? Math.max(0, ...(clase === 'rubro' ? proyecto.rubros : proyecto.tareas).map((t) => t.orden)) + 10,
    notas: original.notas || '', dependencias: (original.dependencias || []).map((d) => ({ ...d })),
    fecha: hoyLocal(), avance_pct: original.avance_pct ?? 0, nota: '',
  }))
  const [historia, setHistoria] = useState(null)
  const [errorHistoria, setErrorHistoria] = useState(null)
  const [error, setError] = useState(null)
  const [guardando, setGuardando] = useState(false)
  const caja = useRef(null)
  const cerrarRef = useRef(alCerrar)
  const guardandoRef = useRef(false)
  cerrarRef.current = alCerrar
  const cambiar = (campo, valor) => setForm((f) => ({ ...f, [campo]: valor }))
  const soloLectura = !proyecto.editable
  const raiz = `/api/obras/${obraId}/proyecto`

  useEffect(() => {
    const anterior = document.activeElement
    const overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    caja.current?.querySelector('input:not(:disabled), select:not(:disabled), button')?.focus()
    const tecla = (e) => {
      if (e.key === 'Escape' && !guardandoRef.current) cerrarRef.current()
      if (e.key !== 'Tab') return
      const controles = [...caja.current.querySelectorAll('button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex="0"]')]
      const primero = controles[0], ultimo = controles.at(-1)
      if (e.shiftKey && (document.activeElement === primero || !caja.current.contains(document.activeElement))) { e.preventDefault(); ultimo?.focus() }
      if (!e.shiftKey && document.activeElement === ultimo) { e.preventDefault(); primero?.focus() }
    }
    document.addEventListener('keydown', tecla)
    return () => { document.removeEventListener('keydown', tecla); document.body.style.overflow = overflow; anterior?.focus?.() }
  }, [])

  useEffect(() => {
    if (clase !== 'avance') return
    let vigente = true
    api.get(`${raiz}/tareas/${original.id}/avances`).then((h) => { if (vigente) setHistoria(h) })
      .catch((e) => { if (vigente) setErrorHistoria(e) })
    return () => { vigente = false }
  }, [raiz, original.id, clase])

  const guardar = async (e) => {
    e.preventDefault()
    if (guardandoRef.current || soloLectura) return
    guardandoRef.current = true
    setGuardando(true); setError(null)
    try {
      const version = proyecto.version
      let r
      if (clase === 'rubro') {
        const cuerpo = { version, nombre: form.nombre.trim(), orden: Number(form.orden) }
        r = original.id ? await api.put(`${raiz}/rubros/${original.id}`, cuerpo) : await api.post(`${raiz}/rubros`, cuerpo)
      } else if (clase === 'avance') {
        r = await api.post(`${raiz}/tareas/${original.id}/avances`, {
          version, fecha: form.fecha, avance_pct: Number(form.avance_pct), nota: form.nota.trim() || null,
        })
      } else {
        const cuerpo = {
          version, nombre: form.nombre.trim(), rubro_id: form.rubro_id, padre_id: form.padre_id || null,
          tipo: form.tipo, responsable: form.responsable.trim() || null, orden: Number(form.orden), notas: form.notas.trim() || null,
          fecha_inicio: form.tipo === 'grupo' ? null : form.fecha_inicio || null,
          fecha_fin: form.tipo === 'grupo' ? null : (form.tipo === 'hito' ? form.fecha_inicio : form.fecha_fin) || null,
          dependencias: form.tipo === 'grupo' ? [] : form.dependencias.map((d) => ({ ...d, dias_desfase: Number(d.dias_desfase) })),
        }
        r = original.id ? await api.put(`${raiz}/tareas/${original.id}`, cuerpo) : await api.post(`${raiz}/tareas`, cuerpo)
      }
      alGuardar(r)
    } catch (e) { setError(e) }
    finally { guardandoRef.current = false; setGuardando(false) }
  }

  const descendientes = new Set([original.id])
  let cambia = true
  while (cambia) {
    cambia = false
    for (const t of proyecto.tareas) if (t.padre_id && descendientes.has(t.padre_id) && !descendientes.has(t.id)) { descendientes.add(t.id); cambia = true }
  }
  const padres = proyecto.tareas.filter((t) => t.tipo === 'grupo' && t.rubro_id === form.rubro_id && !descendientes.has(t.id))
  const predecesoras = proyecto.tareas.filter((t) => t.id !== original.id && t.tipo !== 'grupo')
  const titulo = clase === 'avance' ? 'Avance de tarea' : clase === 'rubro' ? (original.id ? 'Editar rubro' : 'Nuevo rubro') : original.id ? 'Detalle de tarea' : 'Nueva tarea'

  return <div className="pr-modal" onMouseDown={(e) => { if (e.target === e.currentTarget && !guardando) alCerrar() }}>
    <div className="pr-editor" role="dialog" aria-modal="true" aria-labelledby="pr-editor-titulo" ref={caja}>
      <header><div><span className="ob-label">{soloLectura ? 'Consulta · Solo lectura' : 'Planificación de obra'}</span><h2 id="pr-editor-titulo">{titulo}</h2>
        {clase === 'avance' && <p>{original.nombre}</p>}</div><button type="button" className="pr-cerrar" aria-label="Cerrar editor" disabled={guardando} onClick={alCerrar}>×</button></header>
      <form onSubmit={guardar}>
        <Aviso error={error} />
        <fieldset disabled={guardando || soloLectura} className="pr-campos">
          {clase !== 'avance' && <Campo titulo="Nombre"><input className="ob-input" required maxLength={clase === 'rubro' ? 100 : 200} value={form.nombre} onChange={(e) => cambiar('nombre', e.target.value)} placeholder={clase === 'rubro' ? 'Ej. Estructura' : 'Ej. Encofrado de losa'} /></Campo>}
          {clase === 'tarea' && <>
            <div className="pr-dos"><Campo titulo="Tipo"><select className="ob-input" disabled={!!original.id} value={form.tipo} onChange={(e) => cambiar('tipo', e.target.value)}>
              <option value="tarea">Tarea</option><option value="grupo">Tarea resumen / grupo</option><option value="hito">Hito</option>
            </select></Campo><Campo titulo="Rubro"><select className="ob-input" required disabled={descendientes.size > 1} value={form.rubro_id} onChange={(e) => setForm((f) => ({ ...f, rubro_id: e.target.value, padre_id: '' }))}>
              {proyecto.rubros.map((r) => <option key={r.id} value={r.id}>{r.nombre}</option>)}
            </select></Campo></div>
            <Campo titulo="Dentro de"><select className="ob-input" value={form.padre_id} onChange={(e) => cambiar('padre_id', e.target.value)}>
              <option value="">Directamente en el rubro</option>{padres.map((t) => <option key={t.id} value={t.id}>{t.nombre}</option>)}
            </select></Campo>
            <div className="pr-dos"><Campo titulo="Responsable"><input className="ob-input" list="pr-responsables" maxLength={160} placeholder="Persona o equipo" value={form.responsable} onChange={(e) => cambiar('responsable', e.target.value)} />
              <datalist id="pr-responsables">{[...new Set(proyecto.tareas.map((t) => t.responsable).filter(Boolean))].map((r) => <option key={r} value={r} />)}</datalist></Campo>
              <Campo titulo="Orden"><input className="ob-input ob-num" type="number" required min="0" max="100000" step="1" value={form.orden} onChange={(e) => cambiar('orden', e.target.value)} /></Campo></div>
            {form.tipo === 'grupo' ? <p className="pr-ayuda">Las fechas y el avance se calculan a partir de las subtareas. Después de guardar, usá el botón + de este grupo para agregarlas.</p> : <>
              <div className="pr-dos"><Campo titulo={form.tipo === 'hito' ? 'Fecha del hito' : 'Inicio'}><input className="ob-input" type="date" min="1900-01-01" max="2100-12-31" required={!!form.fecha_fin && form.tipo !== 'hito'} value={form.fecha_inicio} onChange={(e) => cambiar('fecha_inicio', e.target.value)} /></Campo>
                {form.tipo !== 'hito' && <Campo titulo="Fin"><input className="ob-input" type="date" min={form.fecha_inicio || '1900-01-01'} max="2100-12-31" required={!!form.fecha_inicio} value={form.fecha_fin} onChange={(e) => cambiar('fecha_fin', e.target.value)} /></Campo>}</div>
              <p className="pr-ayuda">Podés dejar las fechas vacías. La duración incluye el día de inicio y el de fin.</p>
              <div className="pr-dependencias"><h3>Predecesoras</h3><p className="pr-ayuda">Fin–inicio: empieza al día siguiente del fin, más el desfase. Un desfase negativo permite superposición.</p>
                {form.dependencias.map((d, i) => <div className="pr-dependencia" key={i}>
                  <Campo titulo="Tarea anterior"><select className="ob-input" required value={d.depende_de_id} onChange={(e) => cambiar('dependencias', form.dependencias.map((v, n) => n === i ? { ...v, depende_de_id: e.target.value } : v))}>
                    <option value="">Seleccionar…</option>{predecesoras.map((t) => <option key={t.id} value={t.id} disabled={form.dependencias.some((v, n) => n !== i && v.depende_de_id === t.id)}>{t.nombre}{!t.fecha_fin ? ' (sin fecha)' : ''}</option>)}
                  </select></Campo><Campo titulo="Desfase (días)"><input className="ob-input ob-num" type="number" required min="-3650" max="3650" step="1" value={d.dias_desfase} onChange={(e) => cambiar('dependencias', form.dependencias.map((v, n) => n === i ? { ...v, dias_desfase: e.target.value } : v))} /></Campo>
                  <button className="ob-btn" type="button" aria-label={`Quitar predecesora ${i + 1}`} onClick={() => cambiar('dependencias', form.dependencias.filter((_, n) => n !== i))}>×</button>
                </div>)}
                <button className="ob-btn" type="button" disabled={form.dependencias.length >= predecesoras.length || form.dependencias.length >= 100} onClick={() => cambiar('dependencias', [...form.dependencias, { depende_de_id: '', dias_desfase: 0 }])}>+ Predecesora</button>
                {form.dependencias.some((d) => predecesoras.find((t) => t.id === d.depende_de_id && !t.fecha_fin)) && <p className="pr-ayuda">Hay predecesoras sin fecha: el ajuste del cronograma se realizará cuando las programes.</p>}
              </div>
            </>}
            <Campo titulo="Notas"><textarea className="ob-input" rows="3" maxLength={2000} value={form.notas} onChange={(e) => cambiar('notas', e.target.value)} /></Campo>
          </>}
          {clase === 'rubro' && <Campo titulo="Orden en el proyecto"><input className="ob-input ob-num" type="number" required min="0" max="100000" step="1" value={form.orden} onChange={(e) => cambiar('orden', e.target.value)} /></Campo>}
          {clase === 'avance' && <>
            <div className="pr-dos"><Campo titulo="Fecha de medición"><input className="ob-input" type="date" min="1900-01-01" required max={hoyLocal()} value={form.fecha} onChange={(e) => cambiar('fecha', e.target.value)} /></Campo>
              <Campo titulo="Avance acumulado (%)">{original.tipo === 'hito' ? <select className="ob-input" value={form.avance_pct} onChange={(e) => cambiar('avance_pct', e.target.value)}><option value="0">Pendiente (0 %)</option><option value="100">Cumplido (100 %)</option></select> :
                <input className="ob-input ob-num" type="number" min="0" max="100" step="0.01" required value={form.avance_pct} onChange={(e) => cambiar('avance_pct', e.target.value)} />}</Campo></div>
            <Campo titulo="Observación"><textarea className="ob-input" rows="2" maxLength={1000} value={form.nota} onChange={(e) => cambiar('nota', e.target.value)} /></Campo>
            <p className="pr-ayuda">Ingresá el porcentaje total ejecutado hasta esa fecha, no el incremento del día. Registrar una fecha existente reemplaza esa medición y su observación.</p>
          </>}
        </fieldset>
        {clase === 'avance' && <section className="pr-historial"><h3>Historial de avance</h3>
          <Aviso error={errorHistoria} />
          {historia === null && !errorHistoria ? <p>Cargando historial…</p> : historia?.length ? <ul>{historia.map((h) => <li key={h.fecha}><span>{fmtFecha(h.fecha)}</span><b className="ob-num">{num(h.avance_pct, 1)} %</b><span>{h.nota || 'Sin observación'}</span></li>)}</ul> : !errorHistoria && <p>Todavía no hay mediciones.</p>}
        </section>}
        <footer><button type="button" className="ob-btn" disabled={guardando} onClick={alCerrar}>{soloLectura ? 'Cerrar' : 'Cancelar'}</button>
          {!soloLectura && <button type="submit" className="ob-btn ob-btn--primario" disabled={guardando}>{guardando ? 'Guardando…' : 'Guardar cambios'}</button>}</footer>
      </form>
    </div>
  </div>
}

function Campo({ titulo, children }) {
  const id = useId()
  return <div className="pr-campo"><label htmlFor={id}>{titulo}</label>
    {Children.map(children, (hijo) => isValidElement(hijo) && ['input', 'select', 'textarea'].includes(hijo.type)
      ? cloneElement(hijo, { id }) : hijo)}</div>
}
