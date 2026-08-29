import { num, plata, fecha as fmtFecha } from '../formato'

/**
 * Las dos curvas sobre el mismo eje de tiempo: pagado y avance.
 *
 * La brecha entre las dos ES el producto. Si la de plata va por arriba de
 * la de obra, estás pagando más rápido de lo que se construye, y eso se
 * ve de un vistazo o no se ve nunca.
 *
 * SVG a mano y no una librería de gráficos. Recharts o Chart.js pesan más
 * que toda la app junta, y acá hacen falta dos polilíneas y unos ejes: el
 * ahorro no compensa ni el peso ni tener que pelearle el estilo a los
 * defaults de otro sistema de diseño.
 */
const ANCHO = 720
const ALTO = 260
const M = { arriba: 16, derecha: 16, abajo: 30, izquierda: 44 }

export default function Curvas({ datos, escala, alCambiarEscala }) {
  const puntos = datos?.puntos ?? []

  const ejeX = (i) => M.izquierda
    + (puntos.length > 1 ? (i / (puntos.length - 1)) : 0.5)
      * (ANCHO - M.izquierda - M.derecha)
  const ejeY = (pct) => ALTO - M.abajo
    - (Math.min(100, Math.max(0, pct)) / 100) * (ALTO - M.arriba - M.abajo)

  const linea = (campo) => puntos
    .map((p, i) => `${i ? 'L' : 'M'}${ejeX(i).toFixed(1)},${ejeY(p[campo] ?? 0).toFixed(1)}`)
    .join(' ')

  const ultimo = puntos[puntos.length - 1]
  const brecha = ultimo && ultimo.pagado_pct != null
    ? ultimo.pagado_pct - ultimo.avance_pct : null

  return (
    <div className="ob-curvas">
      <div className="ob-toolbar">
        <span className="ob-label">Pagado contra avance</span>
        <span className="ob-toolbar__meta">
          <Escala valor={escala} alCambiar={alCambiarEscala} />
        </span>
      </div>

      {puntos.length === 0 ? (
        <p className="ob-nota" style={{ padding: 'var(--ob-gap-4)' }}>
          Todavía no hay con qué dibujarlas. La curva de plata necesita pagos
          registrados; la de obra, avance cargado en las tareas.
        </p>
      ) : (
        <>
          {brecha != null && (
            <p className="ob-curvas__veredicto">
              {brecha > 1 ? (
                <>Llevás pagado el <b className="ob-num">{num(ultimo.pagado_pct, 1)} %</b> y
                construido el <b className="ob-num">{num(ultimo.avance_pct, 1)} %</b>:
                estás pagando <b className="ob-delta--sube">{num(brecha, 1)} puntos más rápido</b> de
                lo que la obra avanza.</>
              ) : brecha < -1 ? (
                <>Llevás construido el <b className="ob-num">{num(ultimo.avance_pct, 1)} %</b> y
                pagado el <b className="ob-num">{num(ultimo.pagado_pct, 1)} %</b>:
                vas <b className="ob-delta--baja">{num(-brecha, 1)} puntos</b> a favor.</>
              ) : (
                <>Pago y avance van parejos, en el <b className="ob-num">
                  {num(ultimo.avance_pct, 1)} %</b>.</>
              )}
            </p>
          )}

          <div className="ob-curvas__lienzo">
            <svg viewBox={`0 0 ${ANCHO} ${ALTO}`} role="img"
              aria-label="Curva de pagado contra curva de avance">
              {[0, 25, 50, 75, 100].map((t) => (
                <g key={t}>
                  <line x1={M.izquierda} x2={ANCHO - M.derecha} y1={ejeY(t)} y2={ejeY(t)}
                    stroke="var(--ob-line)" strokeWidth="1" />
                  <text x={M.izquierda - 8} y={ejeY(t) + 4} textAnchor="end"
                    fill="var(--ob-ink-3)" fontSize="10">{t}%</text>
                </g>
              ))}

              {/* El area entre las dos lineas es la brecha. Pintarla es lo
                  que hace que se lea sin tener que comparar dos trazos. */}
              <path d={`${linea('pagado_pct')} ${puntos.map((p, i) =>
                `L${ejeX(puntos.length - 1 - i).toFixed(1)},${
                  ejeY(puntos[puntos.length - 1 - i].avance_pct).toFixed(1)}`).join(' ')} Z`}
                fill="var(--ob-bad-soft)" opacity="0.7" />

              <path d={linea('avance_pct')} fill="none"
                stroke="var(--ob-accent)" strokeWidth="2" />
              <path d={linea('pagado_pct')} fill="none"
                stroke="var(--ob-bad)" strokeWidth="2" strokeDasharray="4 3" />

              {puntos.map((p, i) => (
                <g key={String(p.fecha)}>
                  <circle cx={ejeX(i)} cy={ejeY(p.avance_pct)} r="3"
                    fill="var(--ob-accent)" />
                  <circle cx={ejeX(i)} cy={ejeY(p.pagado_pct ?? 0)} r="3"
                    fill="var(--ob-bad)" />
                  {(i === 0 || i === puntos.length - 1
                    || i === Math.floor(puntos.length / 2)) && (
                    <text x={ejeX(i)} y={ALTO - 10} textAnchor="middle"
                      fill="var(--ob-ink-3)" fontSize="10">{fmtFecha(p.fecha)}</text>
                  )}
                </g>
              ))}
            </svg>
          </div>

          <div className="ob-curvas__leyenda">
            <span><i className="ob-curvas__marca ob-curvas__marca--obra" /> Avance de obra</span>
            <span><i className="ob-curvas__marca ob-curvas__marca--plata" /> Pagado
              {datos.hay_comprometido
                ? ` · sobre ${plata(datos.comprometido)} comprometido`
                : ' · sin presupuestos elegidos, no hay % contra qué medirlo'}</span>
            {!datos.ponderado && (
              <span className="ob-curvas__aviso">
                El avance es un promedio simple: ninguna tarea tiene costo cargado
                para poder ponderarlo.
              </span>
            )}
          </div>
        </>
      )}
    </div>
  )
}

export function Escala({ valor, alCambiar }) {
  return (
    <span className="ob-escala">
      {[['dia', 'Día'], ['semana', 'Semana'], ['mes', 'Mes'], ['anio', 'Año']].map(([v, t]) => (
        <button key={v} className="ob-pill" aria-pressed={valor === v}
          onClick={() => alCambiar(v)}>{t}</button>
      ))}
    </span>
  )
}
