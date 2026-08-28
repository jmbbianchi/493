import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import * as api from '../api'
import Aviso from '../componentes/Aviso'

/**
 * Alta de obra.
 *
 * Sirve para las dos veces que hace falta: cuando no hay ninguna obra
 * todavía, y cuando ya hay una y querés empezar otra. Antes solo existía
 * el primer caso, así que el selector de obra de la barra lateral no tenía
 * forma de llegar a tener una segunda opción.
 *
 * La obra nace vacía a propósito: sin cómputo, sin precios y sin
 * presupuestos. Lo único que trae puesto es la biblioteca de rubros,
 * materiales, tareas y rendimientos, que es el punto de partida y no un
 * catálogo cerrado — todo eso se edita después dentro de la obra sin
 * tocarle la biblioteca a nadie.
 */
export default function ObraNueva({ primera = false, alCrear }) {
  const navegar = useNavigate()
  const [d, setD] = useState({
    nombre: '', nomenclatura: '', direccion: '',
    sup_cubierta: '', desperdicio_pct: 5,
  })
  const [error, setError] = useState(null)
  const [guardando, setGuardando] = useState(false)

  const numero = (v) => (v === '' || v == null
    ? null : Number(String(v).replace(/\./g, '').replace(',', '.')))

  const crear = async (e) => {
    e.preventDefault()
    setGuardando(true)
    try {
      const obra = await api.post('/api/obras', {
        nombre: d.nombre,
        nomenclatura: d.nomenclatura || null,
        direccion: d.direccion || null,
        sup_cubierta: numero(d.sup_cubierta),
        desperdicio_pct: Number(d.desperdicio_pct),
      })
      if (alCrear) await alCrear()
      // Se entra directo a la obra recién creada: crearla y quedarse
      // afuera mirando la lista obliga a un clic que no le sirve a nadie.
      if (obra?.id) navegar(`/obra/${obra.id}/computo`)
    } catch (err) { setError(err); setGuardando(false) }
  }

  return (
    <div className="ob-obranueva">
      {!primera && (
        <Link className="ob-btn" to="/">← Volver</Link>
      )}

      <h1 className="ob-obranueva__titulo">
        {primera ? 'Todavía no hay ninguna obra' : 'Una obra nueva'}
      </h1>
      <p className="ob-obranueva__bajada">
        Nace vacía: sin cómputo, sin precios y sin presupuestos. La biblioteca
        de rubros, materiales, tareas y rendimientos queda disponible al
        instante, y todo eso se ajusta adentro de la obra sin tocar la de nadie.
      </p>

      <Aviso error={error} alCerrar={() => setError(null)} />

      <form onSubmit={crear} className="ob-card ob-obranueva__form">
        <label><span className="ob-label">Nombre</span>
          <input className="ob-input" required autoFocus value={d.nombre}
            placeholder="493 - Acantilados"
            onChange={(e) => setD({ ...d, nombre: e.target.value })} /></label>

        <label><span className="ob-label">Dirección</span>
          <input className="ob-input" value={d.direccion}
            placeholder="Calle y número"
            onChange={(e) => setD({ ...d, direccion: e.target.value })} /></label>

        <label><span className="ob-label">Nomenclatura catastral</span>
          <input className="ob-input" value={d.nomenclatura}
            placeholder="Circ / Secc / Manz / Lote"
            onChange={(e) => setD({ ...d, nomenclatura: e.target.value })} /></label>

        <label><span className="ob-label">Superficie cubierta (m2)</span>
          <input className="ob-input ob-num" inputMode="decimal"
            value={d.sup_cubierta} placeholder="231,46"
            onChange={(e) => setD({ ...d, sup_cubierta: e.target.value })} /></label>

        <label><span className="ob-label">Desperdicio por defecto (%)</span>
          <input className="ob-input ob-num" inputMode="decimal"
            value={d.desperdicio_pct}
            onChange={(e) => setD({ ...d, desperdicio_pct: e.target.value })} /></label>

        <button className="ob-btn ob-btn--primario" type="submit" disabled={guardando}>
          {guardando ? 'Creando…' : 'Crear la obra'}
        </button>
      </form>
    </div>
  )
}
