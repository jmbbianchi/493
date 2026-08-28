import { useEffect, useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import * as api from '../api'
import Aviso from '../componentes/Aviso'
import { plata, num } from '../formato'

/**
 * Registrar un pago, parado en la obra, con el teléfono en una mano.
 *
 * El criterio de aceptación son quince segundos, así que todo lo que
 * agregue un paso hay que justificarlo contra eso:
 *
 *  - No es una tabla achicada. Los destinos son botones grandes, porque
 *    un <select> en el teléfono abre una rueda y se tarda más.
 *  - La fecha viene en hoy. Un pago se carga el día que se hace; el que
 *    carga uno viejo abre el campo, que es un toque más para el caso raro
 *    y cero para el común.
 *  - Elegir el presupuesto elige el rubro solo. Son dos datos que en la
 *    práctica son uno.
 *  - Después de guardar no se navega a ningún lado: se muestra el saldo
 *    nuevo en la misma pantalla. Ir a la obra a cargar un pago y que la
 *    app te lleve a otra parte es perder el hilo.
 */
export default function Pagar() {
  const { obra, tocado } = useOutletContext()
  const hoy = new Date().toISOString().slice(0, 10)

  const [destinos, setDestinos] = useState(null)
  const [error, setError] = useState(null)
  const [elegido, setElegido] = useState(null)   // presupuesto, o {suelto:rubro}
  const [monto, setMonto] = useState('')
  const [fecha, setFecha] = useState(hoy)
  const [otraFecha, setOtraFecha] = useState(false)
  const [medio, setMedio] = useState('transferencia')
  const [guardando, setGuardando] = useState(false)
  const [hecho, setHecho] = useState(null)
  const [suelto, setSuelto] = useState(false)

  const cargar = () => api.get(`/api/obras/${obra.id}/pagar-destinos`)
    .then(setDestinos).catch(setError)


  useEffect(() => { cargar() }, [obra.id])

  const guardar = async (e) => {
    e.preventDefault()
    if (!elegido || !monto) return
    setGuardando(true)
    try {
      const importe = Number(String(monto).replace(/\./g, '').replace(',', '.'))
      // El saldo nuevo viene en la respuesta del alta. Antes se volvía a
      // pedir la lista de destinos y eso duplicaba la espera: dos requests
      // seguidos contra una base que abre conexión por operación. Medido:
      // 6 s contra 3 s, y el criterio de esta pantalla son quince.
      const r = await api.post(`/api/obras/${obra.id}/pagos`, {
        rubro_id: elegido.rubro_id,
        presupuesto_id: elegido.id ?? null,
        fecha,
        monto: importe,
        medio,
      })
      setHecho({ nombre: elegido.nombre, monto: importe, despues: r.saldo })
      // La lista se refresca en segundo plano: para cargar el pago
      // siguiente hace falta, pero nadie tiene que esperarla.
      cargar()
      setMonto(''); setElegido(null); setOtraFecha(false); setFecha(hoy)
      tocado()
    } catch (err) { setError(err) }
    setGuardando(false)
  }

  if (error) return <Aviso error={error} alCerrar={() => setError(null)} />
  if (!destinos) return <p className="ob-cargando">Cargando…</p>

  return (
    <div className="ob-pagar">
      {hecho && (
        <div className="ob-pagar__hecho">
          <div className="ob-pagar__hecho-titulo">
            Pagado {plata(hecho.monto)} — {hecho.nombre}
          </div>
          {hecho.despues ? (
            <div className="ob-pagar__hecho-saldo">
              Queda <b className="ob-num">{plata(hecho.despues.saldo)}</b> de este
              presupuesto · llevás pagado el{' '}
              <b className="ob-num">{num(hecho.despues.avance_pct, 1)} %</b>
            </div>
          ) : (
            <div className="ob-pagar__hecho-saldo">Pago suelto, sin presupuesto asociado.</div>
          )}
          <button className="ob-btn" onClick={() => setHecho(null)}>Cargar otro</button>
        </div>
      )}

      {!hecho && (
        <form onSubmit={guardar}>
          <p className="ob-label ob-pagar__paso">¿A qué presupuesto?</p>

          {destinos.presupuestos.length === 0 && !suelto && (
            <p className="ob-nota" style={{ padding: 0 }}>
              No hay ningún presupuesto confirmado todavía. Podés registrar un
              pago suelto y asignarlo a un rubro.
            </p>
          )}

          <div className="ob-pagar__destinos">
            {destinos.presupuestos.map((p) => (
              <button type="button" key={p.id}
                className={`ob-destino${elegido?.id === p.id ? ' ob-destino--elegido' : ''}`}
                onClick={() => { setElegido(p); setSuelto(false) }}>
                <span className="ob-destino__nombre">{p.nombre}</span>
                <span className="ob-destino__saldo ob-num">
                  queda {plata(p.saldo)}
                </span>
                <span className="ob-destino__barra">
                  <span style={{ width: `${Math.min(100, p.avance_pct ?? 0)}%` }} />
                </span>
              </button>
            ))}

            <button type="button"
              className={`ob-destino ob-destino--suelto${suelto ? ' ob-destino--elegido' : ''}`}
              onClick={() => { setSuelto(true); setElegido(null) }}>
              <span className="ob-destino__nombre">Pago suelto</span>
              <span className="ob-destino__saldo">Sin presupuesto — elegís el rubro</span>
            </button>
          </div>

          {suelto && (
            <select className="ob-input ob-pagar__campo" value={elegido?.rubro_id ?? ''}
              onChange={(e) => setElegido({
                rubro_id: Number(e.target.value), id: null,
                nombre: destinos.rubros.find((r) => r.id === Number(e.target.value))?.nombre,
              })}>
              <option value="">Elegí el rubro…</option>
              {destinos.rubros.map((r) => (
                <option key={r.id} value={r.id}>{r.nombre}</option>
              ))}
            </select>
          )}

          <p className="ob-label ob-pagar__paso">¿Cuánto?</p>
          <input className="ob-input ob-num ob-pagar__monto" inputMode="decimal"
            value={monto} onChange={(e) => setMonto(e.target.value)}
            placeholder="0" autoFocus />

          <div className="ob-pagar__fila">
            {!otraFecha ? (
              <button type="button" className="ob-pill" onClick={() => setOtraFecha(true)}>
                Hoy · cambiar fecha
              </button>
            ) : (
              <input className="ob-input" type="date" value={fecha}
                onChange={(e) => setFecha(e.target.value)} />
            )}
            <select className="ob-input" value={medio} onChange={(e) => setMedio(e.target.value)}>
              <option value="transferencia">Transferencia</option>
              <option value="efectivo">Efectivo</option>
              <option value="cheque">Cheque</option>
              <option value="otro">Otro</option>
            </select>
          </div>

          <button className="ob-btn ob-btn--primario ob-pagar__guardar" type="submit"
            disabled={guardando || !elegido || !monto}>
            {guardando ? 'Guardando…' : 'Registrar el pago'}
          </button>
        </form>
      )}
    </div>
  )
}
