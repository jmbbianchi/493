import { useEffect, useRef, useState } from 'react'
import * as api from '../api'
import { subir } from '../subir'

/**
 * Adjuntos de algo: un pago, un presupuesto, un rubro.
 *
 * Dos botones y no uno: «Sacar foto» abre la cámara de atrás directo —
 * `capture="environment"` — y «Adjuntar» abre el carrete y los archivos.
 * Es un toque de diferencia y es el que importa: parado en la obra con el
 * recibo en la mano, entrar por el carrete y buscar la foto que todavía no
 * sacaste no tiene sentido.
 */
export default function Adjuntos({ obra, colgar, tipo = 'otro', titulo = 'Comprobantes',
                                   provistos, alCambiar }) {
  const [docs, setDocs] = useState(provistos ?? null)
  const [subiendo, setSubiendo] = useState(false)
  const [error, setError] = useState(null)
  const camara = useRef(null)
  const archivo = useRef(null)

  const filtro = new URLSearchParams(colgar).toString()

  // Con `provistos` no pide nada: quien lo monta muchas veces -- la lista
  // de pagos -- trae todos los documentos de la obra en UNA consulta y
  // reparte. Un fetch por fila serian veinte conexiones nuevas contra una
  // base que abre y cierra por operacion.
  const cargar = async () => {
    if (alCambiar) return alCambiar()
    try { setDocs(await api.get(`/api/obras/${obra.id}/documentos?${filtro}`)) }
    catch { setDocs([]) }
  }

  useEffect(() => {
    if (provistos) setDocs(provistos)
    else if (!alCambiar) cargar()
  }, [filtro, provistos])

  const elegido = async (e) => {
    const f = e.target.files?.[0]
    e.target.value = ''
    if (!f) return
    setSubiendo(true); setError(null)
    try {
      await subir(obra.id, f, { ...colgar, tipo })
      await cargar()
    } catch (err) { setError(err) }
    setSubiendo(false)
  }

  const quitar = async (d) => {
    try {
      await api.borrar(`/api/obras/${obra.id}/documentos/${d.id}`)
      await cargar()
    } catch (err) { setError(err) }
  }

  return (
    <div className="ob-adj">
      <span className="ob-label">{titulo}</span>

      <div className="ob-adj__botones">
        <button type="button" className="ob-btn" disabled={subiendo}
          onClick={() => camara.current?.click()}>
          {subiendo ? 'Subiendo…' : 'Sacar foto'}
        </button>
        <button type="button" className="ob-btn" disabled={subiendo}
          onClick={() => archivo.current?.click()}>Adjuntar</button>
        {/* accept + capture: en el teléfono abre la cámara de atrás sin
            pasar por el carrete. En escritorio es un file picker común. */}
        <input ref={camara} type="file" accept="image/*" capture="environment"
          onChange={elegido} hidden />
        <input ref={archivo} type="file" accept="image/*,application/pdf"
          onChange={elegido} hidden />
      </div>

      {error && <p className="ob-adj__error">{String(error.message)}</p>}

      {docs?.length > 0 && (
        <ul className="ob-adj__lista">
          {docs.map((d) => (
            <li key={d.id}>
              <a href={d.url} target="_blank" rel="noreferrer">{d.nombre}</a>
              <span className="ob-adj__peso">
                {d.bytes ? `${Math.round(d.bytes / 1024)} kB` : ''}
              </span>
              <button type="button" className="ob-adj__quitar"
                onClick={() => quitar(d)} aria-label="Quitar">×</button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
