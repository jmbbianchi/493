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
    api.get(`/api/obras/${obra.id}/lista-materiales`)
      .then((d) => { if (vivo) setDatos(d) })
      .catch((e) => { if (vivo) setError(e) })
    return () => { vivo = false }
  }, [obra.id, version])

  return (
    <>
      <div className="ob-toolbar">
        <span className="ob-label">Como viene</span>
      </div>

      <Aviso error={error} alCerrar={() => setError(null)} />

      <div className="ob-tres">
        <Numero rotulo="Teorico"
          valor={datos ? plata(datos.total) : null}
          pie={datos
            ? 'Computo por precio vigente. Solo materiales: la mano de obra todavia no se computa.'
            : 'Calculando…'} />

        <Numero rotulo="Presupuestado" valor={null}
          pie="Lo que te cotizaron, con su plan de pago. Todavia no hay donde cargarlo." />

        <Numero rotulo="Pagado" valor={null}
          pie="Lo que salio de la cuenta, con el coeficiente del mes en que se pago. Todavia no hay donde cargarlo." />
      </div>

      <div className="ob-vacio">
        <h2>Esta pantalla todavia no puede responder las preguntas que importa</h2>
        <p>
          Un rubro de obra no tiene un numero, tiene tres, y aca van a estar los
          tres al lado con sus diferencias. Para que aparezcan falta:
        </p>
        <ul>
          <li><b>Los presupuestos y sus planes de pago.</b> Sin eso no se puede
            contestar si te cotizaron caro.</li>
          <li><b>Los pagos.</b> Sin eso no se puede contestar cuanto falta pagar.</li>
          <li><b>Las fechas.</b> Sin una sola fecha en la base no hay forma de
            saber si estas pagando mas rapido de lo que la obra avanza.</li>
        </ul>
        <p>
          Mientras tanto, lo que ya funciona vive en las otras secciones: el
          computo, la lista de compra que sale de el, y los precios.
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
