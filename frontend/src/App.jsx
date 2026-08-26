import { useEffect, useState } from 'react'
import * as api from './api'
import Computo from './pantallas/Computo'
import Lista from './pantallas/Lista'
import Materiales from './pantallas/Materiales'
import Rendimientos from './pantallas/Rendimientos'
import Aviso from './componentes/Aviso'
import { num } from './formato'

const PESTANIAS = [
  ['computo', 'Computo'],
  ['lista', 'Lista de compra'],
  ['materiales', 'Materiales y precios'],
  ['rendimientos', 'Rendimientos'],
]

export default function App() {
  const [autorizado, setAutorizado] = useState(api.hayClave())
  const [obras, setObras] = useState(null)
  const [obraId, setObraId] = useState(null)
  const [pestania, setPestania] = useState('computo')
  const [error, setError] = useState(null)
  const [indices, setIndices] = useState([])
  // Cambia cada vez que se toca algo que afecta la lista de compra.
  const [version, setVersion] = useState(0)

  const cargarObras = async () => {
    try {
      const o = await api.get('/api/obras')
      setObras(o)
      setObraId((prev) => prev || o[0]?.id || null)
    } catch (e) {
      if (e.clave) { api.olvidarClave(); setAutorizado(false) } else setError(e)
    }
  }

  useEffect(() => { if (autorizado) cargarObras() }, [autorizado])

  useEffect(() => {
    // Los indices del BCRA son publicos: no necesitan clave.
    Promise.all(['USD_MINORISTA', 'UVA'].map((c) =>
      api.get(`/api/indices/ultimo?codigo=${c}`).then((d) => ({ c, ...d })).catch(() => null)
    )).then((r) => setIndices(r.filter((x) => x && x.valor != null)))
  }, [])

  if (!autorizado) return <Puerta alEntrar={() => setAutorizado(true)} />

  const obra = obras?.find((o) => o.id === obraId) || null
  const tocado = () => setVersion((v) => v + 1)

  return (
    <div>
      <header className="ob-topbar">
        <span className="ob-topbar__marca">obra493</span>
        {obras?.length > 1 ? (
          <select className="ob-input" value={obraId ?? ''}
            onChange={(e) => setObraId(e.target.value)}>
            {obras.map((o) => <option key={o.id} value={o.id}>{o.nombre}</option>)}
          </select>
        ) : (
          <span className="ob-topbar__ruta">
            {obra ? [obra.nombre, obra.nomenclatura,
              obra.sup_cubierta ? `${num(obra.sup_cubierta, 2)} m2 cubiertos` : null]
              .filter(Boolean).join(' · ') : ''}
          </span>
        )}
        <span className="ob-topbar__fx ob-num">
          {indices.map((i) => `${i.c === 'UVA' ? 'UVA' : 'USD'} ${num(i.valor, 2)}`).join('  ·  ')}
        </span>
      </header>

      {obras === null ? (
        <p style={{ padding: 'var(--ob-gap-4)', color: 'var(--ob-ink-3)' }}>Despertando la base…</p>
      ) : obras.length === 0 ? (
        <PrimeraObra alCrear={cargarObras} />
      ) : (
        <>
          <nav className="ob-tabs">
            {PESTANIAS.map(([id, texto]) => (
              <button key={id} className="ob-tabs__item"
                aria-current={pestania === id ? 'page' : undefined}
                onClick={() => setPestania(id)}>{texto}</button>
            ))}
          </nav>

          <Aviso error={error} alCerrar={() => setError(null)} />

          {obra && pestania === 'computo' && <Computo obra={obra} alCambiar={tocado} />}
          {obra && pestania === 'lista' && <Lista obra={obra} version={version} />}
          {obra && pestania === 'materiales' && <Materiales obra={obra} alCambiar={tocado} />}
          {obra && pestania === 'rendimientos' && <Rendimientos obra={obra} alCambiar={tocado} />}
        </>
      )}
    </div>
  )
}

/** Candado temporal. Se saca el dia que entre el login con Entra. */
function Puerta({ alEntrar }) {
  const [valor, setValor] = useState('')
  const [error, setError] = useState(null)

  const entrar = async (e) => {
    e.preventDefault()
    api.guardarClave(valor)
    try { await api.get('/api/obras'); alEntrar() }
    catch (err) { api.olvidarClave(); setError(err) }
  }

  return (
    <div style={{ display: 'grid', placeItems: 'center', minHeight: '100vh', padding: 'var(--ob-gap-4)' }}>
      <form onSubmit={entrar} className="ob-card"
        style={{ padding: 'var(--ob-gap-6)', width: 'min(26rem, 100%)' }}>
        <h1 style={{ margin: 0, fontSize: 'var(--ob-fs-2xl)', letterSpacing: '-0.02em' }}>obra493</h1>
        <p style={{ color: 'var(--ob-ink-2)', fontSize: 'var(--ob-fs-sm)', marginTop: '.4rem' }}>
          Escribi la clave de la obra. Queda guardada en este navegador.
        </p>
        <input className="ob-input" type="password" autoFocus
          style={{ width: '100%', marginTop: 'var(--ob-gap-3)' }}
          value={valor} onChange={(e) => setValor(e.target.value)} placeholder="Clave" />
        {error && (
          <p style={{ color: 'var(--ob-bad)', fontSize: 'var(--ob-fs-sm)', marginTop: '.5rem' }}>
            {String(error.message)}
          </p>
        )}
        <button className="ob-btn ob-btn--primario" type="submit"
          style={{ width: '100%', marginTop: 'var(--ob-gap-3)' }}>Entrar</button>
      </form>
    </div>
  )
}

function PrimeraObra({ alCrear }) {
  const [d, setD] = useState({ nombre: '', nomenclatura: '', sup_cubierta: '', desperdicio_pct: 5 })
  const [error, setError] = useState(null)

  const crear = async (e) => {
    e.preventDefault()
    try {
      await api.post('/api/obras', {
        nombre: d.nombre,
        nomenclatura: d.nomenclatura || null,
        sup_cubierta: d.sup_cubierta ? Number(String(d.sup_cubierta).replace(',', '.')) : null,
        desperdicio_pct: Number(d.desperdicio_pct),
      })
      alCrear()
    } catch (err) { setError(err) }
  }

  return (
    <div style={{ padding: 'var(--ob-gap-6)', maxWidth: '34rem' }}>
      <h2 style={{ margin: 0, fontSize: 'var(--ob-fs-xl)' }}>Todavia no hay ninguna obra</h2>
      <p style={{ color: 'var(--ob-ink-2)', fontSize: 'var(--ob-fs-sm)' }}>
        Crea la primera y la biblioteca de tareas y materiales queda disponible al instante.
      </p>
      <Aviso error={error} alCerrar={() => setError(null)} />
      <form onSubmit={crear} className="ob-card"
        style={{ padding: 'var(--ob-gap-4)', display: 'grid', gap: 'var(--ob-gap-3)' }}>
        <label><span className="ob-label">Nombre</span>
          <input className="ob-input" required style={{ width: '100%' }} value={d.nombre}
            placeholder="493 - Acantilados"
            onChange={(e) => setD({ ...d, nombre: e.target.value })} /></label>
        <label><span className="ob-label">Nomenclatura catastral</span>
          <input className="ob-input" style={{ width: '100%' }} value={d.nomenclatura}
            placeholder="Circ / Secc / Manz / Lote"
            onChange={(e) => setD({ ...d, nomenclatura: e.target.value })} /></label>
        <label><span className="ob-label">Superficie cubierta (m2)</span>
          <input className="ob-input ob-num" style={{ width: '100%' }} inputMode="decimal"
            value={d.sup_cubierta} placeholder="231,46"
            onChange={(e) => setD({ ...d, sup_cubierta: e.target.value })} /></label>
        <label><span className="ob-label">Desperdicio por defecto (%)</span>
          <input className="ob-input ob-num" style={{ width: '100%' }} inputMode="decimal"
            value={d.desperdicio_pct}
            onChange={(e) => setD({ ...d, desperdicio_pct: e.target.value })} /></label>
        <button className="ob-btn ob-btn--primario" type="submit">Crear la obra</button>
      </form>
    </div>
  )
}
