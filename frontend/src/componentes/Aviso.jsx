/** Franja de error. Dice que paso y que hacer, sin pedir disculpas. */
export default function Aviso({ error, alCerrar }) {
  if (!error) return null
  return (
    <div style={{
      background: 'var(--ob-bad-soft)', color: 'var(--ob-bad)',
      border: '1px solid var(--ob-bad)', borderRadius: 'var(--ob-radius)',
      padding: 'var(--ob-gap-3) var(--ob-gap-4)', margin: 'var(--ob-gap-4)',
      display: 'flex', gap: 'var(--ob-gap-3)', alignItems: 'baseline',
      fontSize: 'var(--ob-fs-sm)',
    }}>
      <span style={{ flex: 1 }}>{String(error.message || error)}</span>
      {alCerrar && (
        <button className="ob-btn" onClick={alCerrar} style={{ padding: '.1rem .5rem' }}>
          Cerrar
        </button>
      )}
    </div>
  )
}
