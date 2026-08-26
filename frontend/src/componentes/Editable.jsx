import { useEffect, useRef, useState } from 'react'
import { num, plata } from '../formato'

/**
 * Celda que se edita en el lugar. Un clic abre el campo, Enter guarda,
 * Escape cancela, salir del campo guarda.
 *
 * `formato` define como se ve cuando NO se esta editando:
 *   'texto' | 'numero' | 'plata'
 */
export default function Editable({
  valor, alGuardar, formato = 'texto', decimales = 2,
  vacio = '—', sufijo = '', deshabilitado = false, titulo,
}) {
  const [editando, setEditando] = useState(false)
  const [borrador, setBorrador] = useState('')
  const [guardando, setGuardando] = useState(false)
  const campo = useRef(null)

  useEffect(() => { if (editando && campo.current) campo.current.select() }, [editando])

  const abrir = () => {
    if (deshabilitado) return
    setBorrador(valor === null || valor === undefined ? '' : String(valor))
    setEditando(true)
  }

  const cerrar = async () => {
    if (guardando) return
    const crudo = borrador.trim()
    const nuevo = formato === 'texto'
      ? (crudo === '' ? null : crudo)
      : (crudo === '' ? null : Number(crudo.replace(',', '.')))
    setEditando(false)
    if (String(nuevo ?? '') === String(valor ?? '')) return
    if (formato !== 'texto' && nuevo !== null && Number.isNaN(nuevo)) return
    setGuardando(true)
    try { await alGuardar(nuevo) } finally { setGuardando(false) }
  }

  if (editando) {
    return (
      <input
        ref={campo}
        className="ob-input"
        style={{ width: '100%', textAlign: formato === 'texto' ? 'left' : 'right' }}
        value={borrador}
        inputMode={formato === 'texto' ? 'text' : 'decimal'}
        onChange={(e) => setBorrador(e.target.value)}
        onBlur={cerrar}
        onKeyDown={(e) => {
          if (e.key === 'Enter') cerrar()
          if (e.key === 'Escape') setEditando(false)
        }}
      />
    )
  }

  const texto =
    valor === null || valor === undefined || valor === ''
      ? vacio
      : formato === 'plata' ? plata(valor)
      : formato === 'numero' ? num(valor, decimales)
      : String(valor)

  return (
    <button
      type="button"
      onClick={abrir}
      title={titulo || (deshabilitado ? '' : 'Clic para editar')}
      disabled={deshabilitado}
      style={{
        all: 'unset',
        cursor: deshabilitado ? 'default' : 'text',
        display: 'block',
        width: '100%',
        textAlign: formato === 'texto' ? 'left' : 'right',
        opacity: guardando ? 0.45 : 1,
        color: valor === null || valor === undefined ? 'var(--ob-ink-3)' : 'inherit',
      }}
    >
      {texto}{valor !== null && valor !== undefined && sufijo ? ' ' + sufijo : ''}
    </button>
  )
}
