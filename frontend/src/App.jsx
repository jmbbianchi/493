import { useEffect, useState } from 'react'

const API = import.meta.env.VITE_API_URL ?? ''

// Prueba de humo de punta a punta: front -> API -> SQL -> datos del BCRA.
// Si estos tres numeros aparecen, toda la cadena esta andando.
const INDICES = [
  { codigo: 'USD_MINORISTA', label: 'Dolar minorista', prefijo: '$' },
  { codigo: 'UVA',           label: 'UVA',             prefijo: '$' },
  { codigo: 'ICL',           label: 'ICL',             prefijo: '' },
]

// OJO: un solo fetch al montar. Nada de setInterval ni polling —
// mantendria despierto al backend y a la base. Ver README.md, regla 1.
export default function App() {
  const [datos, setDatos] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    Promise.all(
      INDICES.map((i) =>
        fetch(`${API}/api/indices/ultimo?codigo=${i.codigo}`)
          .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
          .then((d) => ({ ...i, ...d }))
          .catch(() => ({ ...i, valor: null }))
      )
    )
      .then(setDatos)
      .catch((e) => setError(String(e)))
  }, [])

  return (
    <main style={S.main}>
      <header style={S.header}>
        <p style={S.eyebrow}>Obra 493 · Manzana 18 · Lote 1</p>
        <h1 style={S.h1}>493</h1>
        <p style={S.lede}>
          Cómputo, presupuesto y avance. Todavía no hay nada cargado — esto
          confirma que el front, el API y la base se están hablando.
        </p>
      </header>

      {error && <p style={S.error}>No responde el API: {error}</p>}

      {!datos && !error && <p style={S.muted}>Cargando…</p>}

      {datos && (
        <section style={S.grid}>
          {datos.map((d) => (
            <article key={d.codigo} style={S.card}>
              <div style={S.label}>{d.label}</div>
              <div style={S.valor}>
                {d.valor == null
                  ? '—'
                  : `${d.prefijo}${Number(d.valor).toLocaleString('es-AR', {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })}`}
              </div>
              <div style={S.fecha}>{d.fecha ?? 'sin datos todavía'}</div>
            </article>
          ))}
        </section>
      )}

      <footer style={S.footer}>
        Los valores los trae el job <code>obra493-indices</code> del BCRA, todos
        los días a las 06:00. Si dicen “sin datos”, todavía no corrió.
      </footer>
    </main>
  )
}

const S = {
  main: {
    fontFamily: 'system-ui, -apple-system, Segoe UI, sans-serif',
    maxWidth: 720, margin: '0 auto', padding: '48px 24px 80px',
    color: '#14181b',
  },
  header: { borderBottom: '1px solid #d6dad7', paddingBottom: 24, marginBottom: 28 },
  eyebrow: {
    fontFamily: 'ui-monospace, monospace', fontSize: 11, letterSpacing: '.14em',
    textTransform: 'uppercase', color: '#0f4c5c', margin: '0 0 10px',
  },
  h1: { fontSize: 56, fontWeight: 800, letterSpacing: '-.03em', margin: '0 0 12px', lineHeight: 1 },
  lede: { color: '#58615f', margin: 0, maxWidth: '54ch', lineHeight: 1.6 },
  grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(190px,1fr))', gap: 12 },
  card: { border: '1px solid #d6dad7', padding: '16px 18px', background: '#fff' },
  label: { fontSize: 12.5, color: '#58615f', marginBottom: 6 },
  valor: {
    fontFamily: 'ui-monospace, monospace', fontSize: 26, fontWeight: 600,
    fontVariantNumeric: 'tabular-nums', color: '#0f4c5c', lineHeight: 1.1,
  },
  fecha: { fontFamily: 'ui-monospace, monospace', fontSize: 11, color: '#828b88', marginTop: 6 },
  muted: { color: '#828b88' },
  error: { color: '#a0342a' },
  footer: {
    marginTop: 40, paddingTop: 18, borderTop: '1px solid #d6dad7',
    fontSize: 13, color: '#828b88', lineHeight: 1.6,
  },
}
