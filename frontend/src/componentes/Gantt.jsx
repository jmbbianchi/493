import { useState } from 'react'
import { num, fecha as fmtFecha } from '../formato'

/**
 * El cronograma, agrupado por rubro y desplegable.
 *
 * La barra lleva el avance adentro y no al lado: una tarea que va por la
 * mitad se ve por la mitad. Al lado sería un número más que hay que ir a
 * buscar.
 *
 * La escala cambia cuántos píxeles vale un día. En «año» una obra de dos
 * años entra en pantalla; en «día» se puede ver que dos tareas se pisan
 * por tres jornadas. Es la misma información con distinto zoom, no vistas
 * distintas.
 */
const PX_POR_DIA = { dia: 24, semana: 6, mes: 2.2, anio: 0.5 }
const ANCHO_ETIQUETA = 260

export default function Gantt({ tareas, rubros, escala, alCambiarEscala, alMover }) {
  const [abierto, setAbierto] = useState({})
  const conFecha = tareas.filter((t) => t.fecha_inicio)

  if (conFecha.length === 0) {
    return (
      <div className="ob-vacio">
        <h2>El cronograma está vacío</h2>
        <p>
          Ninguna tarea del cómputo tiene fechas todavía. Poneles fecha de
          inicio y de fin y acá aparece la barra de cada una, con su avance
          adentro.
        </p>
        <p>
          Cuando además las encadenes —el revoque va después de la
          mampostería— correr una tarea corre sola a las que dependen de ella.
        </p>
      </div>
    )
  }

  const dias = (a, b) => Math.round((new Date(b) - new Date(a)) / 86400000)
  const desde = conFecha.reduce((m, t) => (t.fecha_inicio < m ? t.fecha_inicio : m),
    conFecha[0].fecha_inicio)
  const hasta = conFecha.reduce((m, t) => {
    const f = t.fecha_fin || t.fecha_inicio
    return f > m ? f : m
  }, conFecha[0].fecha_fin || conFecha[0].fecha_inicio)

  const px = PX_POR_DIA[escala]
  const total = Math.max(1, dias(desde, hasta)) + 1
  const ancho = Math.max(320, total * px)
  const hoy = new Date().toISOString().slice(0, 10)

  return (
    <div className="ob-gantt">
      <div className="ob-toolbar">
        <span className="ob-label">Cronograma</span>
        <span className="ob-toolbar__meta">
          {conFecha.length} de {tareas.length} tareas con fecha ·{' '}
          {fmtFecha(desde)} a {fmtFecha(hasta)}
          <span style={{ marginLeft: 'var(--ob-gap-3)' }}>
            {[['dia', 'Día'], ['semana', 'Semana'], ['mes', 'Mes'], ['anio', 'Año']]
              .map(([v, t]) => (
                <button key={v} className="ob-pill" aria-pressed={escala === v}
                  onClick={() => alCambiarEscala(v)}>{t}</button>
              ))}
          </span>
        </span>
      </div>

      <div className="ob-gantt__scroll">
        <div style={{ minWidth: ANCHO_ETIQUETA + ancho }}>
          {rubros.map((r) => {
            const suyas = tareas.filter((t) => t.rubro_id === r.rubro_id)
            const abierta = abierto[r.rubro_id] ?? true
            return (
              <div key={r.rubro_id}>
                <button className="ob-gantt__rubro"
                  onClick={() => setAbierto((a) => ({ ...a, [r.rubro_id]: !abierta }))}>
                  <span className="ob-gantt__etiqueta">
                    <span className="ob-comp__flecha">{abierta ? '▾' : '▸'}</span>
                    {r.rubro}
                    <span className="ob-gantt__meta">
                      {r.tareas} tarea(s) · {num(r.avance_pct, 0)} %
                      {r.peso_pct != null && ` · pesa ${num(r.peso_pct, 0)} %`}
                    </span>
                  </span>
                  {/* La barra del rubro resume a sus tareas: de la primera
                      fecha a la ultima, con el avance ponderado adentro. */}
                  {r.desde && (
                    <span className="ob-gantt__pista" style={{ width: ancho }}>
                      <span className="ob-gantt__barra ob-gantt__barra--rubro"
                        style={{
                          left: dias(desde, r.desde) * px,
                          width: Math.max(3, (dias(r.desde, r.hasta || r.desde) + 1) * px),
                        }}>
                        <span className="ob-gantt__avance"
                          style={{ width: `${r.avance_pct}%` }} />
                      </span>
                    </span>
                  )}
                </button>

                {abierta && suyas.map((t) => (
                  <div className="ob-gantt__fila" key={t.id}>
                    <span className="ob-gantt__etiqueta">
                      <span className="ob-gantt__tarea">{t.tarea}</span>
                      <span className="ob-gantt__meta">
                        {t.ubicacion || 'sin ubicar'} · {num(t.cantidad, 0)} {t.unidad_medicion}
                      </span>
                    </span>
                    <span className="ob-gantt__pista" style={{ width: ancho }}>
                      {t.fecha_inicio ? (
                        <span className="ob-gantt__barra"
                          title={`${fmtFecha(t.fecha_inicio)} a ${fmtFecha(t.fecha_fin)} · ${t.avance_pct} %`}
                          onClick={() => alMover?.(t)}
                          style={{
                            left: dias(desde, t.fecha_inicio) * px,
                            width: Math.max(3,
                              (dias(t.fecha_inicio, t.fecha_fin || t.fecha_inicio) + 1) * px),
                          }}>
                          <span className="ob-gantt__avance"
                            style={{ width: `${t.avance_pct}%` }} />
                          {t.dependencias?.length > 0 && (
                            <span className="ob-gantt__atado" title="Depende de otra tarea">⛓</span>
                          )}
                        </span>
                      ) : (
                        <button className="ob-gantt__sinfecha" onClick={() => alMover?.(t)}>
                          poner fecha
                        </button>
                      )}
                    </span>
                  </div>
                ))}
              </div>
            )
          })}

          {/* La linea de hoy: sin ella, mirar el cronograma no dice si vas
              atrasado, solo dice que fechas se planificaron. */}
          {hoy >= desde && hoy <= hasta && (
            <div className="ob-gantt__hoy"
              style={{ left: ANCHO_ETIQUETA + dias(desde, hoy) * px }} />
          )}
        </div>
      </div>
    </div>
  )
}
