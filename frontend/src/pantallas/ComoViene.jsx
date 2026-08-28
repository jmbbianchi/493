import { useEffect, useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import * as api from '../api'
import Aviso from '../componentes/Aviso'
import { plata } from '../formato'

/**
 * El resumen de la obra. Hoy es honesto y esta casi vacio a proposito:
 * de los tres numeros que importan solo existe el teorico. El presupuestado
 * llega con E2 y el pagado con E3.
 *
 * No se rellenan los huecos con un cero ni con un estimado. Un cero se lee
 * como "no gastaste nada", y no es lo que pasa: es que todavia no lo cargaste.
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

  const presupuestado = datos
    ? datos.resumen.rubros.reduce((a, r) => a + r.proyectado, 0) : 0
  const pagado = datos
    ? datos.resumen.rubros.reduce((a, r) => a + (r.pagado ?? 0), 0) : 0

  return (
    <>
      <div className="ob-toolbar">
        <span className="ob-label">Como viene</span>
      </div>

      <Aviso error={error} alCerrar={() => setError(null)} />

      <div className="ob-tres">
        <Numero rotulo="Teorico"
          valor={datos ? plata(datos.lista.total) : null}
          pie={datos
            ? `Materiales ${plata(datos.lista.total_materiales)} + mano de obra `
              + `${plata(datos.lista.total_mano_obra)}. `
              + (datos.lista.sin_costo_mano_obra.length
                ? `${datos.lista.sin_costo_mano_obra.length} tareas sin costo de mano de obra cargado: el numero es de menos.`
                : 'Todas las tareas tienen costo cargado.')
            : 'Calculando…'} />

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
          esta en Rubros.
        </p>
      </div>
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
