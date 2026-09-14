import { useEffect, useMemo, useState } from 'react'
import * as api from '../api'
import { agruparSerie, fechaCotizacion, formatoValor, ipcAcumulado } from '../cotizaciones'
import GraficoCotizaciones from '../componentes/GraficoCotizaciones'
import '../styles/cotizaciones.css'

export default function Cotizaciones() {
  const hoy=new Date().toLocaleDateString('en-CA')
  const [desde,setDesde]=useState(hoy.slice(0,4)+'-01-01'),[hasta,setHasta]=useState(hoy)
  const [seleccion,setSeleccion]=useState(['USD_OFICIAL_VENTA','USD_OFICIAL_COMPRA'])
  const [paso,setPaso]=useState('dia'),[datos,setDatos]=useState(null),[error,setError]=useState(''),[pagina,setPagina]=useState(0),[revision,setRevision]=useState(0)
  const valido=desde && hasta && desde<=hasta
  useEffect(()=>{
    let activo=true;setDatos(null);setError('');setPagina(0)
    if(valido)api.get(`/api/indices/series?desde=${desde}&hasta=${hasta}`).then(d=>{if(activo)setDatos(d)}).catch(e=>{if(activo)setError(e.message)})
    return()=>{activo=false}
  },[desde,hasta,revision,valido])
  const series=(datos?.series || []).filter(s=>seleccion.includes(s.codigo))
  const tabla=useMemo(()=>{
    const filas=new Map()
    for(const s of series)for(const v of agruparSerie(s.valores,paso)){
      if(!filas.has(v.fecha))filas.set(v.fecha,{fecha:v.fecha,valores:{}})
      filas.get(v.fecha).valores[s.codigo]=v
    }
    return [...filas.values()].sort((a,b)=>b.fecha.localeCompare(a.fecha))
  },[datos,seleccion,paso])
  const mensual=datos?.series.find(s=>s.codigo==='IPC_MENSUAL')?.valores || []
  const cierres=agruparSerie(mensual,'mes'),acumulado=ipcAcumulado(mensual,desde.slice(0,7)+'-01'),anual=ipcAcumulado(datos?.ipc_anio || [],hasta.slice(0,4)+'-01-01')
  const alternar=c=>{setSeleccion(ss=>ss.includes(c)?ss.filter(x=>x!==c):[...ss,c]);setPagina(0)}
  const ipcTexto=r=>r.valor==null ? r.meses ? 'Faltan meses' : 'Sin datos' : formatoValor(r.valor,'%')
  return <section className="ct-panel"><h2>Cotizaciones históricas</h2>
    <div className="ct-filtros"><label>Desde<input className="ob-input" type="date" value={desde} onChange={e=>setDesde(e.target.value)}/></label><label>Hasta<input className="ob-input" type="date" value={hasta} onChange={e=>setHasta(e.target.value)}/></label>
      <label>Agrupar fechas<select className="ob-input" value={paso} onChange={e=>{setPaso(e.target.value);setPagina(0)}}><option value="dia">Día</option><option value="semana">Semana</option><option value="mes">Mes</option><option value="anio">Año</option></select></label>
      <button className="ob-btn" onClick={()=>{setDesde(hoy.slice(0,4)+'-01-01');setHasta(hoy)}}>Este año</button>
    </div>
    {!valido ? <p role="alert">Indicá ambas fechas; Desde no puede ser posterior a Hasta.</p> : error ? <p role="alert">{error} <button className="ob-btn" onClick={()=>setRevision(n=>n+1)}>Reintentar</button></p> : !datos ? <p role="status">Cargando cotizaciones del período…</p> : <>
      <fieldset className="ct-variables"><legend>Variables · elegí una o varias</legend>{datos.series.map(s=><label key={s.codigo}><input type="checkbox" checked={seleccion.includes(s.codigo)} onChange={()=>alternar(s.codigo)}/>{s.nombre}</label>)}</fieldset>
      <div className="ct-resumen">{series.map(s=>{const ultimo=s.valores.at(-1);return <div key={s.codigo}><span>{s.nombre}</span><strong>{ultimo ? formatoValor(ultimo.valor,s.unidad) : 'Sin datos en este período'}</strong><small>{ultimo && fechaCotizacion(ultimo.fecha)} · {s.fuente}</small></div>})}</div>
      <div className="ct-ipc"><div><span>Último cierre mensual del período</span><strong>{cierres.length ? `${cierres.at(-1).fecha.slice(0,7)} · ${formatoValor(cierres.at(-1).valor,'%')}` : 'Sin datos'}</strong></div><div><span>IPC acumulado del período</span><strong>{ipcTexto(acumulado)}</strong><small>{acumulado.meses} meses disponibles{acumulado.ultimo && ` · hasta ${acumulado.ultimo.slice(0,7)}`}</small></div><div><span>IPC acumulado {hasta.slice(0,4)}</span><strong>{ipcTexto(anual)}</strong><small>{anual.ultimo ? `Enero a ${anual.ultimo.slice(0,7)}` : 'Sin cierre disponible'}</small></div></div>
      <GraficoCotizaciones series={series} paso={paso}/>
      <div className="ct-tabla-titulo"><h3>Detalle del período</h3><small>{tabla.length} intervalos · los importes se muestran con dos decimales</small></div>
      <div className="ob-tablewrap"><table className="ob-table"><thead><tr><th>{paso==='dia' ? 'Fecha' : 'Inicio del intervalo'}</th>{series.map(s=><th className="ob-num" key={s.codigo}>{s.nombre}</th>)}</tr></thead><tbody>{tabla.slice(pagina*100,(pagina+1)*100).map(f=><tr key={f.fecha}><td>{fechaCotizacion(f.fecha)}</td>{series.map(s=><td className="ob-num" key={s.codigo} title={f.valores[s.codigo] ? 'Dato del '+fechaCotizacion(f.valores[s.codigo].fechaDato) : 'Sin dato en este intervalo'}>{formatoValor(f.valores[s.codigo]?.valor,s.unidad)}</td>)}</tr>)}{!tabla.length && <tr><td colSpan={series.length+1}>{series.length ? 'Sin datos para las variables y el período elegidos.' : 'Seleccioná al menos una variable.'}</td></tr>}</tbody></table></div>
      {tabla.length>100 && <div className="ct-paginacion"><button className="ob-btn" disabled={!pagina} onClick={()=>setPagina(p=>p-1)}>Anterior</button><span>Página {pagina+1} de {Math.ceil(tabla.length/100)}</span><button className="ob-btn" disabled={(pagina+1)*100>=tabla.length} onClick={()=>setPagina(p=>p+1)}>Siguiente</button></div>}
      <details className="ct-cierres"><summary>Cierres mensuales de IPC y acumulado</summary><p>El acumulado compone las variaciones mensuales: (1 + IPC₁) × (1 + IPC₂) … − 1. Los meses sin publicación no se toman como 0 %.</p><div className="ob-tablewrap"><table className="ob-table"><thead><tr><th>Mes de referencia</th><th className="ob-num">Cierre mensual</th><th className="ob-num">Acumulado del período</th></tr></thead><tbody>{cierres.map((v,i)=><tr key={v.fecha}><td>{v.fecha.slice(0,7)}</td><td className="ob-num">{formatoValor(v.valor,'%')}</td><td className="ob-num">{ipcTexto(ipcAcumulado(cierres.slice(0,i+1),desde.slice(0,7)+'-01'))}</td></tr>)}</tbody></table></div></details>
      <p className="ct-ayuda">Compra y venta: <a href="https://argentinadatos.com/docs/operations/get-cotizaciones-dolares" target="_blank" rel="noreferrer">ArgentinaDatos / DolarAPI</a>. Promedio minorista vendedor, UVA e IPC: <a href="https://www.bcra.gob.ar/principales-variables/" target="_blank" rel="noreferrer">BCRA</a>. Los valores del dólar expresan ARS por U$D 1. Las fechas de IPC identifican el mes de referencia, no su fecha de publicación. El nivel de IPC es una serie encadenada de base arbitraria.</p>
    </>}
  </section>
}
