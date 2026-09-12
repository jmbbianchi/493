import { useCallback, useEffect, useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import * as api from '../api'
import Aviso from '../componentes/Aviso'
import CronogramaProyecto from '../componentes/CronogramaProyecto'
import EditorProyecto from '../componentes/EditorProyecto'
import PresupuestosProyecto from '../componentes/PresupuestosProyecto'
import { fechaBreve as fmtFecha, num } from '../formato'
import '../styles/proyecto.css'

export default function Proyecto() {
  const contexto = useOutletContext()
  // Cambiar de obra desmonta tambien los editores y las respuestas pendientes.
  return <PlanDeObra key={contexto.obra.id} {...contexto} />
}

function PlanDeObra({ obra, version }) {
  const [datos, setDatos] = useState(null)
  const [error, setError] = useState(null)
  const [recarga, setRecarga] = useState(0)
  const [cargando, setCargando] = useState(true)
  const [editor, setEditor] = useState(null)
  const [mensaje, setMensaje] = useState('')
  const [busqueda, setBusqueda] = useState('')
  const [agrupar, setAgrupar] = useState('rubro')
  const [escala, setEscala] = useState('semana')
  const cerrar = useCallback(() => setEditor(null), [])

  useEffect(() => {
    let vigente = true
    setCargando(true)
    setError(null)
    api.get(`/api/obras/${obra.id}/proyecto`).then((d) => {
      if (vigente) setDatos(d)
    }).catch((e) => { if (vigente) setError(e) })
      .finally(() => { if (vigente) setCargando(false) })
    return () => { vigente = false }
  }, [obra.id, version, recarga])

  const guardado = (r) => {
    setEditor(null)
    setMensaje(r.movidas ? `Guardado. Se ajustaron ${r.movidas} tareas por sus dependencias.` : 'Cambios guardados.')
    setRecarga((v) => v + 1)
  }
  const editable = datos?.editable && !cargando && !error
  const resumen = datos?.resumen
  const nueva = (tipo = 'tarea', extra = {}) => setEditor({ clase: 'tarea', datos: { tipo, ...extra } })

  return (
    <section className="pr-proyecto" aria-label="Planificación del proyecto">
      <header className="pr-cabecera">
        <div><span className="ob-label">Gestión de obra / Planificación</span>
          <h1>Proyecto</h1><p>Organizá el trabajo, coordiná los plazos y registrá el avance.</p></div>
        <div className="pr-acciones">
          <button className="ob-btn" disabled={!editable} onClick={() => setEditor({ clase: 'rubro', datos: {} })}>+ Rubro</button>
          <button className="ob-btn ob-btn--primario" disabled={!editable || !datos?.rubros.length}
            onClick={() => nueva()}>+ Nueva tarea</button>
        </div>
      </header>
      <Aviso error={error} />
      {error && <button className="ob-btn" onClick={() => setRecarga((v) => v + 1)}>Reintentar</button>}
      <div className="pr-mensaje" role="status" aria-live="polite">{cargando ? 'Cargando planificación…' : mensaje}</div>
      {datos && <>
        <div className="pr-indicadores">
          <Indicador titulo="Tareas e hitos" valor={resumen.cantidad_tareas} pie={`${resumen.completadas} completadas`} />
          <Indicador titulo="Período planificado" valor={resumen.fecha_inicio ? `${fmtFecha(resumen.fecha_inicio)} — ${fmtFecha(resumen.fecha_fin)}` : 'Sin definir'} pie="Días corridos" />
          <Indicador titulo="Avance registrado" valor={resumen.tiene_avance ? `${num(resumen.avance_pct, 1)} %` : 'Sin registrar'} pie="Promedio simple de tareas e hitos" />
          <Indicador titulo="Por programar" valor={resumen.sin_fecha} pie="Tareas e hitos sin fechas" />
        </div>
        {!datos.editable && <p className="pr-nota">Tenés acceso de lectura a esta obra.</p>}
        <div className="pr-panel">
          <div className="pr-panel__titulo"><div><h2>Cronograma de obra</h2><p>Rubros, tareas y subtareas en un mismo plan.</p></div>
            <button className="ob-btn" disabled={cargando || !!editor} onClick={() => setRecarga((v) => v + 1)}>Actualizar</button>
          </div>
          <div className="pr-herramientas">
            <label className="pr-busqueda"><span className="sr-only">Buscar tareas o responsables</span>
              <input className="ob-input" type="search" placeholder="Buscar tarea o responsable…" value={busqueda} onChange={(e) => setBusqueda(e.target.value)} /></label>
            <label className="pr-agrupar">Agrupar por <select className="ob-input" value={agrupar} onChange={(e) => setAgrupar(e.target.value)}>
              <option value="rubro">Rubro</option><option value="responsable">Responsable</option>
            </select></label>
            <div className="pr-escalas" aria-label="Escala del cronograma">
              {[['dia', 'Día'], ['semana', 'Semana'], ['mes', 'Mes']].map(([id, texto]) =>
                <button key={id} aria-pressed={escala === id} onClick={() => setEscala(id)}>{texto}</button>)}
            </div>
          </div>
          {datos.rubros.length === 0 ? <div className="pr-vacio">
            <span className="pr-vacio__simbolo" aria-hidden="true">▤</span>
            <h3>Tu obra empieza con un plan</h3>
            <p>Creá el primer rubro, por ejemplo Estructura. Después agregá las tareas, sus responsables y sus fechas.</p>
            <button className="ob-btn ob-btn--primario" disabled={!editable}
              onClick={() => setEditor({ clase: 'rubro', datos: {} })}>Crear primer rubro</button>
          </div> : <CronogramaProyecto datos={datos} busqueda={busqueda} agrupar={agrupar} escala={escala}
            editable={editable} alEditar={(t) => setEditor({ clase: 'tarea', datos: t })} alNueva={nueva}
            alRubro={(r) => setEditor({ clase: 'rubro', datos: r })}
            alAvance={(t) => setEditor({ clase: 'avance', datos: t })} />}
          <footer className="pr-leyenda"><span><i className="pr-muestra" /> Planificado <i className="pr-muestra pr-muestra--avance" /> Avance</span>
            <span>◆ Hito · Fin–inicio · Días corridos</span>
            <span>Las demoras desplazan las sucesoras; los adelantos se revisan manualmente.</span></footer>
        </div>
        <p className="pr-nota">{datos.criterio_avance} Los grupos resumen sus subtareas y no se cuentan dos veces.</p>
        <PresupuestosProyecto obraId={obra.id} proyecto={datos} editable={!!editable} alActualizar={() => setRecarga((v) => v + 1)} />
      </>}
      {editor && datos && <EditorProyecto key={`${editor.clase}-${editor.datos.id || 'nuevo'}`}
        editor={editor} proyecto={{ ...datos, editable: !!editable }} obraId={obra.id} alCerrar={cerrar} alGuardar={guardado} />}
    </section>
  )
}

function Indicador({ titulo, valor, pie }) {
  return <div className="pr-indicador"><span className="ob-label">{titulo}</span>
    <strong className="ob-num">{valor}</strong><span>{pie}</span></div>
}
