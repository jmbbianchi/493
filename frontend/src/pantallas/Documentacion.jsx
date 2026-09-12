import { useEffect, useState } from 'react'
import * as api from '../api'
import { subir } from '../subir'
import Aviso from '../componentes/Aviso'

export default function Documentacion({ obra, alCambiar }) {
  const [docs, setDocs] = useState(null)
  const [error, setError] = useState(null)
  const [subiendo, setSubiendo] = useState(false)
  const cargar = async () => { try { setDocs(await api.get(`/api/obras/${obra.id}/documentos`)) } catch (e) { setError(e) } }
  useEffect(() => { setDocs(null); cargar() }, [obra.id])
  const archivo = async (e) => {
    const f = e.target.files?.[0]; if (!f) return
    setSubiendo(true)
    try { await subir(obra.id, f, { tipo: f.type.startsWith('image/') ? 'foto' : 'otro' }); await cargar(); alCambiar?.() }
    catch (err) { setError(err) } finally { setSubiendo(false); e.target.value = '' }
  }
  if (!docs) return <p className="ob-cargando">Cargando documentación…</p>
  return <>
    <Aviso error={error} alCerrar={() => setError(null)} />
    <div className="ob-toolbar"><span className="ob-label">Documentación de obra</span><label className="ob-btn ob-btn--primario">{subiendo ? 'Subiendo…' : 'Agregar archivo'}<input type="file" hidden accept="image/*,application/pdf" onChange={archivo} disabled={subiendo} /></label></div>
    {docs.length === 0 ? <div className="ob-vacio"><h2>Todavía no hay documentos</h2><p>Subí planos, fotos, presupuestos o la carpeta técnica de esta obra.</p></div> : <div className="ob-tablewrap"><table className="ob-table"><thead><tr><th>Nombre</th><th>Tipo</th><th>Fecha</th><th></th></tr></thead><tbody>{docs.map((d) => <tr key={d.id}><td><a href={d.url} target="_blank" rel="noreferrer">{d.nombre}</a></td><td>{d.tipo}</td><td>{String(d.creado_en).slice(0, 10)}</td><td>{d.bytes ? `${Math.round(d.bytes / 1024)} kB` : ''}</td></tr>)}</tbody></table></div>}
  </>
}
