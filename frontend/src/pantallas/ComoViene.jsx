import { useEffect, useState } from 'react'
import { useOutletContext, Link } from 'react-router-dom'
import * as api from '../api'
import Aviso from '../componentes/Aviso'
import { plata } from '../formato'

/**
 * El resumen de la obra: los tres numeros que importan, uno al lado del otro.
 *
 * Ninguno se rellena con un cero. Un cero se lee como "no gastaste nada" y
 * casi nunca es eso lo que pasa: es que todavia no se cargo. Una obra
 * recien creada tiene los tres en raya, y abajo dice por donde se empieza
 * en vez de mostrar un tablero de ceros que no significa nada.
 */
export default function ComoViene() {
  const { obra, version } = useOutletContext()
  const [datos, setDatos] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    let vivo = true
    setDatos(null)
    Promise.all([
      api.get(`/api/obras/${obra.id}/lista-materiales`),
      api.get(`/api/obras/${obra.id}/rubros-resumen`),
    ]).then(([lista, resumen]) => { if (vivo) setDatos({ lista, resumen }) })
      .catch((e) => { if (vivo) setError(e) })
    return () => { vivo = false }
  }, [obra.id, version])

  // Sin una sola linea de computo el teorico no vale cero: no existe. La
  // diferencia importa porque cero es una afirmacion y raya es la ausencia
  // de una, y esta pantalla no puede afirmar lo que no sabe.
  const hayComputo = datos ? datos.lista.rubros.length > 0 : false
  const teorico = hayComputo ? datos.lista.total : null

  const presupuestado = datos
    ? datos.resumen.rubros.reduce((a, r) => a + r.proyectado, 0) : 0
  const pagado = datos
    ? datos.resumen.rubros.reduce((a, r) => a + (r.pagado ?? 0), 0) : 0

  const vacia = datos && !hayComputo && !presupuestado && !pagado

  return (
    <>
      <div className="ob-toolbar">
        <span className="ob-label">Como viene</span>
        {datos && <span className="ob-toolbar__meta">{obra.nombre}</span>}
      </div>

      <Aviso error={error} alCerrar={() => setError(null)} />

      <div className="ob-tres">
        <Numero rotulo="Teorico"
          valor={teorico == null ? null : plata(teorico)}
          pie={!datos ? 'Calculando…'
            : teorico == null
              ? 'Lo que dice el computo: m2 por rendimiento por precio, mas la mano de obra. Todavia no hay computo cargado.'
              : `Materiales ${plata(datos.lista.total_materiales)} + mano de obra `
                + `${plata(datos.lista.total_mano_obra)}. `
                + (datos.lista.sin_costo_mano_obra.length
                  ? `${datos.lista.sin_costo_mano_obra.length} tarea(s) sin costo de mano de obra: el numero es de menos.`
                  : 'Todas las tareas computadas tienen su costo cargado.')} />

        <Numero rotulo="Presupuestado"
          valor={presupuestado ? plata(presupuestado) : null}
          pie={presupuestado
            ? 'Proyectado de todos los presupuestos confirmados, con su plan de pago.'
            : 'Lo que te cotizaron, con su plan de pago. Todavia no hay ninguno confirmado.'} />

        <Numero rotulo="Pagado"
          valor={pagado ? plata(pagado) : null}
          pie={pagado
            ? `Salio de la cuenta. Falta pagar ${plata(presupuestado - pagado)}.`
            : 'Lo que salio de la cuenta. Todavia no se registro ningun pago.'} />
      </div>

      {vacia ? (
        <div className="ob-vacio">
          <h2>Esta obra esta en blanco</h2>
          <p>
            Los tres numeros de arriba estan en raya porque no hay nada cargado
            todavia, y no en cero porque cero seria mentir. Por donde se empieza:
          </p>
          <ul>
            <li>
              <b><Link to={`/obra/${obra.id}/computo`}>Computo</Link></b> — que
              tarea, donde y cuanto. De ahi sale solo el teorico y la lista de
              compra: no hay que tipear ningun material.
            </li>
            <li>
              <b><Link to={`/obra/${obra.id}/materiales`}>Materiales y precios</Link></b> —
              el precio de cada material. Sin precio el material no suma, y el
              rubro queda marcado como incompleto en vez de mentir un total.
            </li>
            <li>
              <b><Link to={`/obra/${obra.id}/rubros`}>Rubros</Link></b> — ahi
              adentro se carga cada presupuesto recibido con su plan de pago.
              Es lo que contesta si te cotizaron caro.
            </li>
            <li>
              <b><Link to={`/obra/${obra.id}/pagar`}>Pagar</Link></b> — cada pago
              que hacés, desde el telefono, parado en la obra.
            </li>
          </ul>
        </div>
      ) : (
        <div className="ob-vacio">
          <h2>Falta una de las tres preguntas</h2>
          <p>
            Un rubro de obra no tiene un numero, tiene tres, y ya estan los tres
            al lado. Con eso se contesta si te cotizaron caro y cuanto falta
            pagar. Para la tercera falta:
          </p>
          <ul>
            <li><b>Las fechas.</b> Sin una sola fecha de obra en la base no hay
              forma de saber si estas pagando mas rapido de lo que la obra
              avanza. Es la unica de las tres preguntas que todavia no se puede
              contestar.</li>
          </ul>
          <p>
            El detalle por rubro, con los presupuestos y sus planes de pago,
            esta en <Link to={`/obra/${obra.id}/rubros`}>Rubros</Link>.
          </p>
        </div>
      )}
    </>
  )
}

function Numero({ rotulo, valor, pie }) {
  return (
    <div className="ob-card ob-tres__uno">
      <span className="ob-label">{rotulo}</span>
      <div className={`ob-tres__valor ob-num${valor ? '' : ' ob-tres__valor--falta'}`}>
        {valor ?? '—'}
      </div>
      <p className="ob-tres__pie">{pie}</p>
    </div>
  )
}
