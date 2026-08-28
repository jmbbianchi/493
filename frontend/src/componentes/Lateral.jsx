import { NavLink, useNavigate, useLocation } from 'react-router-dom'

/**
 * La barra lateral. Arriba, el selector de obra; abajo, las secciones.
 *
 * El selector se muestra SIEMPRE, aunque haya una sola obra. Antes se
 * escondia con una obra sola, asi que en la practica no se veia nunca y la
 * app no daba ninguna senial de estar parada adentro de un proyecto.
 */

// El orden es el del plan y no es alfabetico: primero como viene la obra,
// despues la plata por rubro, y al final las herramientas de calculo.
const SECCIONES = [
  // Pagar va primero y no ultimo. Es lo unico que se usa parado en la
  // obra con el telefono, y en el telefono la lateral es una tira
  // horizontal: lo que esta al final hay que scrollearlo para llegar.
  ['pagar', 'Pagar'],
  ['como-viene', 'Como viene'],
  ['rubros', 'Rubros'],
  ['computo', 'Computo'],
  ['lista', 'Lista de compra'],
  ['materiales', 'Materiales y precios'],
  ['rendimientos', 'Rendimientos'],
]

// El alta de obra cuelga del mismo selector y no de un boton aparte: es
// donde uno va a buscar "otra obra", tenga o no que crearla todavia.
const NUEVA = '__nueva'

export default function Lateral({ obras, obra }) {
  const navegar = useNavigate()
  const { pathname } = useLocation()

  // Al cambiar de obra se conserva la seccion: si estabas mirando la lista
  // de compra de una obra, queres la lista de compra de la otra.
  const cambiarObra = (id) => {
    if (id === NUEVA) { navegar('/obras/nueva'); return }
    const seccion = pathname.split('/')[3] || 'como-viene'
    navegar(`/obra/${id}/${seccion}`)
  }

  return (
    <aside className="ob-lateral">
      <div className="ob-lateral__marca">obra493</div>

      <div className="ob-lateral__obra">
        <span className="ob-label">Obra</span>
        <select className="ob-input ob-lateral__select" value={obra.id}
          onChange={(e) => cambiarObra(e.target.value)}>
          {obras.map((o) => <option key={o.id} value={o.id}>{o.nombre}</option>)}
          <option value={NUEVA}>+ Obra nueva…</option>
        </select>
      </div>

      <nav className="ob-lateral__nav">
        {SECCIONES.map(([id, texto]) => (
          <NavLink key={id} to={`/obra/${obra.id}/${id}`} className="ob-nav__item">
            {texto}
          </NavLink>
        ))}
      </nav>
    </aside>
  )
}
