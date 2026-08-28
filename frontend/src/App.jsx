import { useEffect, useState } from 'react'
import { Navigate, Route, Routes, useOutletContext } from 'react-router-dom'
import * as api from './api'
import Layout from './Layout'
import ComoViene from './pantallas/ComoViene'
import Rubros from './pantallas/Rubros'
import Presupuestos from './pantallas/Presupuestos'
import Pagar from './pantallas/Pagar'
import RubroDetalle from './pantallas/RubroDetalle'
import Presupuesto from './pantallas/Presupuesto'
import Computo from './pantallas/Computo'
import Lista from './pantallas/Lista'
import Materiales from './pantallas/Materiales'
import Rendimientos from './pantallas/Rendimientos'
import ObraNueva from './pantallas/ObraNueva'
import Aviso from './componentes/Aviso'

export default function App() {
  const [autorizado, setAutorizado] = useState(api.hayClave())
  const [obras, setObras] = useState(null)
  const [error, setError] = useState(null)
  const [indices, setIndices] = useState([])
  // Cambia cada vez que se toca algo que afecta la lista de compra.
  const [version, setVersion] = useState(0)

  const cargarObras = async () => {
    try {
      setObras(await api.get('/api/obras'))
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
  if (error && obras === null) return <Aviso error={error} />
  // La primera consulta despues del auto-pause tarda unos 40 segundos.
  if (obras === null) return <p className="ob-cargando">Despertando la base…</p>
  if (obras.length === 0) return <ObraNueva primera alCrear={cargarObras} />

  const inicio = `/obra/${obras[0].id}/como-viene`
  const tocado = () => setVersion((v) => v + 1)

  return (
    <Routes>
      <Route path="/obra/:obraId"
        element={<Layout obras={obras} indices={indices} version={version} tocado={tocado} />}>
        <Route index element={<Navigate to="como-viene" replace />} />
        <Route path="como-viene" element={<ComoViene />} />
        <Route path="pagar" element={<Pagar />} />
        <Route path="presupuestos" element={<Presupuestos />} />
        <Route path="rubros" element={<Rubros />} />
        <Route path="rubros/:rubroId" element={<RubroDetalle />} />
        <Route path="rubros/:rubroId/presupuestos/:presupuestoId" element={<Presupuesto />} />
        <Route path="computo" element={<ConObra Pantalla={Computo} />} />
        <Route path="lista" element={<ConObra Pantalla={Lista} />} />
        <Route path="materiales" element={<ConObra Pantalla={Materiales} />} />
        <Route path="rendimientos" element={<ConObra Pantalla={Rendimientos} />} />
      </Route>
      <Route path="/obras/nueva" element={<ObraNueva alCrear={cargarObras} />} />
      <Route path="*" element={<Navigate to={inicio} replace />} />
    </Routes>
  )
}

/**
 * Adaptador para las cuatro pantallas que ya existian: siguen recibiendo
 * `obra`, `version` y `alCambiar` por props, sin enterarse del router.
 * Cuando cambia la obra se remonta la pantalla (key), asi ninguna se queda
 * mostrando los datos de la obra anterior mientras carga los nuevos.
 */
function ConObra({ Pantalla }) {
  const { obra, version, tocado } = useOutletContext()
  return <Pantalla key={obra.id} obra={obra} version={version} alCambiar={tocado} />
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
    <div className="ob-centrado">
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
