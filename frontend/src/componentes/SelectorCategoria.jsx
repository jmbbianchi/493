import { useState } from 'react'
import { useParams } from 'react-router-dom'
import * as api from '../api'

// Conserva el formulario padre y selecciona el registro recién creado.
export default function SelectorCategoria({ tipo, children, onChange, ...props }) {
  const { obraId } = useParams()
  const [extras, setExtras] = useState([])
  const [nombre, setNombre] = useState(null)
  const [error, setError] = useState('')
  const [ocupado, setOcupado] = useState(false)
  const guardar = async () => {
    setOcupado(true); setError('')
    try {
      const item = await api.post(`/api/obras/${obraId}/${tipo}`, { nombre: nombre.trim() })
      setExtras((xs) => [...xs.filter((x) => x.id !== item.id), item])
      onChange({ target: { value: String(item.id), type: 'select-one' } })
      setNombre(null)
    } catch (e) { setError(e.message) } finally { setOcupado(false) }
  }
  return <>
    <select {...props} onChange={(e) => {
      if (e.target.value === '__agregar') { setNombre(''); setError('') }
      else onChange(e)
    }}>
      {children}
      {extras.map((x) => <option key={x.id} value={x.id}>{x.nombre}</option>)}
      <option value="__agregar">+ Agregar</option>
    </select>
    {nombre !== null && <span style={{ display: 'grid', gap: '.4rem', marginTop: '.5rem' }}>
      <input className="ob-input" aria-label="Nombre de la categoría nueva" maxLength={60}
        placeholder={tipo === 'rubros' ? 'Nombre del rubro' : 'Nombre del subrubro'}
        value={nombre} onChange={(e) => setNombre(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); if (nombre.trim() && !ocupado) guardar() } }} />
      <span><button type="button" className="ob-btn" disabled={ocupado || !nombre.trim()} onClick={guardar}>{ocupado ? 'Guardando…' : 'Agregar y seleccionar'}</button>
      <button type="button" className="ob-btn" disabled={ocupado} onClick={() => setNombre(null)}>Cancelar</button></span>
      {error && <span role="alert">{error}</span>}
    </span>}
  </>
}
