import { useEffect, useState } from 'react'
import * as api from '../api'
import { num, fecha } from '../formato'

export default function Cotizaciones() {
  const [codigo,setCodigo] = useState('USD_MINORISTA')
  const [hasta,setHasta] = useState(new Date().toLocaleDateString('en-CA'))
  const [datos,setDatos] = useState(null)
  const [error,setError] = useState('')
  useEffect(()=>{
    let activo=true; setDatos(null); setError('')
    if(hasta) api.get(`/api/indices/historia?codigo=${codigo}&hasta=${hasta}`).then(d=>{if(activo)setDatos(d)}).catch(e=>{if(activo)setError(e.message)})
    return ()=>{activo=false}
  },[codigo,hasta])
  return <section style={{padding:'1rem'}}><h2>Cotizaciones históricas</h2>
    <div className="cp-controles"><select className="ob-input" value={codigo} onChange={e=>setCodigo(e.target.value)}><option value="USD_MINORISTA">Dólar oficial minorista (ARS/USD)</option><option value="UVA">UVA (ARS)</option><option value="IPC_NIVEL">IPC · nivel</option><option value="IPC_MENSUAL">IPC · variación mensual (%)</option></select><label>Consultar al <input className="ob-input" type="date" value={hasta} onChange={e=>setHasta(e.target.value)}/></label></div>
    <p>Se muestran hasta 120 registros anteriores a la fecha elegida. Para convertir pagos se utiliza la última cotización disponible en su fecha o antes; la fecha publicada se muestra para poder verificarla.</p>
    {error ? <p role="alert">{error}</p> : datos===null ? <p>Cargando…</p> : !datos.length ? <p>No hay datos para esta fecha.</p> : <><p>Valor disponible al {fecha(hasta)}: <b>{num(datos[0].valor,4)}</b> · publicado el {fecha(datos[0].fecha)}</p><table className="ob-table"><thead><tr><th>Fecha publicada</th><th>Valor</th></tr></thead><tbody>{datos.map(d=><tr key={d.fecha}><td>{fecha(d.fecha)}</td><td>{num(d.valor,4)}</td></tr>)}</tbody></table></>}
  </section>
}
