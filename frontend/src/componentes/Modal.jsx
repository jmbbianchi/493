import { useEffect, useRef } from 'react'

/**
 * Modal del sistema Obra.
 *
 * Cierra con Escape y con clic afuera, y devuelve el foco a donde estaba
 * al abrirse. Nada de eso es adorno: sin el foco de vuelta, quien navega
 * con teclado queda tirado al principio de la página cada vez que cierra
 * uno.
 *
 * El scroll del body se bloquea mientras está abierto porque en el
 * teléfono, si no, se scrollea la página de atrás en vez del formulario.
 */
export default function Modal({ titulo, bajada, alCerrar, children }) {
  const caja = useRef(null)
  const antes = useRef(null)

  useEffect(() => {
    antes.current = document.activeElement
    const overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    const tecla = (e) => { if (e.key === 'Escape') alCerrar() }
    document.addEventListener('keydown', tecla)

    // El foco entra al modal: si se queda afuera, el lector de pantalla
    // sigue leyendo la página de atrás como si nada hubiera pasado.
    const primero = caja.current?.querySelector(
      'input, select, textarea, button')
    primero?.focus()

    return () => {
      document.removeEventListener('keydown', tecla)
      document.body.style.overflow = overflow
      antes.current?.focus?.()
    }
  }, [alCerrar])

  return (
    <div className="ob-modal" role="dialog" aria-modal="true" aria-label={titulo}
      onMouseDown={(e) => { if (e.target === e.currentTarget) alCerrar() }}>
      <div className="ob-modal__caja" ref={caja}>
        <div className="ob-modal__cabeza">
          <div>
            <h2 className="ob-modal__titulo">{titulo}</h2>
            {bajada && <p className="ob-modal__bajada">{bajada}</p>}
          </div>
          <button className="ob-modal__cerrar" onClick={alCerrar} aria-label="Cerrar">×</button>
        </div>
        <div className="ob-modal__cuerpo">{children}</div>
      </div>
    </div>
  )
}
