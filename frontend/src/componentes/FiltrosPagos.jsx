import {useEffect,useRef,useState} from 'react'
import {createPortal} from 'react-dom'
import {filtrosVacios,opcionesPagos} from '../filtrosPagos'
import '../styles/filtros-pagos.css'

const campos=[['rubro','Rubro'],['tipo','Tipo'],['presupuesto','Presupuesto'],['medio','Medio'],['moneda','Moneda'],['adjuntos','Adjuntos'],['estado','Estado'],['periodo','Período']]
export default function FiltrosPagos({pagos,documentos,presupuestos,valor,onChange,cantidad}){
  const [abierto,setAbierto]=useState(null),[pos,setPos]=useState({})
  const panel=useRef(null),boton=useRef(null)
  useEffect(()=>{
    if(!abierto)return
    const cerrar=e=>{if(!panel.current?.contains(e.target)&&!boton.current?.contains(e.target))setAbierto(null)}
    const tecla=e=>{if(e.key==='Escape'){setAbierto(null);boton.current?.focus()}}
    const mover=()=>setAbierto(null)
    document.addEventListener('pointerdown',cerrar);document.addEventListener('keydown',tecla);window.addEventListener('resize',mover)
    return()=>{document.removeEventListener('pointerdown',cerrar);document.removeEventListener('keydown',tecla);window.removeEventListener('resize',mover)}
  },[abierto])
  const abrir=(campo,e)=>{boton.current=e.currentTarget;const r=e.currentTarget.getBoundingClientRect();setPos({left:Math.max(8,Math.min(r.left,window.innerWidth-308)),top:r.bottom+4,maxHeight:Math.max(120,window.innerHeight-r.bottom-16)});setAbierto(abierto===campo?null:campo)}
  const cambiar=(k,v)=>onChange({...valor,[k]:v})
  const opciones=abierto && abierto!=='periodo'?opcionesPagos(pagos,documentos,abierto,presupuestos):[]
  return <div className="fp-barra" role="region" aria-label="Filtros de pagos">
    <input className="ob-input fp-busqueda" type="search" aria-label="Buscar pagos" placeholder="Buscar pagos…" value={valor.busqueda} onChange={e=>cambiar('busqueda',e.target.value)}/>
    {campos.map(([k,t])=><button key={k} type="button" className="ob-btn fp-selector" aria-expanded={abierto===k} aria-controls={abierto===k?'fp-panel':undefined} onClick={e=>abrir(k,e)} title={t}>{t}{k==='periodo' ? (valor.desde||valor.hasta?' •':'') : valor[k].length?` (${valor[k].length})`:''} ▾</button>)}
    <button className="ob-btn" onClick={()=>{onChange(filtrosVacios());setAbierto(null)}}>Limpiar</button>
    <small className="fp-cantidad" role="status">{cantidad}/{pagos.length}</small>
    {abierto && createPortal(<div id="fp-panel" ref={panel} className="fp-panel" style={pos} role="group" aria-label={campos.find(c=>c[0]===abierto)[1]}>
      {abierto==='periodo'?<><label>Desde<input className="ob-input" type="date" value={valor.desde} max={valor.hasta||undefined} onChange={e=>cambiar('desde',e.target.value)}/></label><label>Hasta<input className="ob-input" type="date" value={valor.hasta} min={valor.desde||undefined} onChange={e=>cambiar('hasta',e.target.value)}/></label>{valor.desde && valor.hasta && valor.desde>valor.hasta && <p role="alert">Revisá el período: Desde debe ser anterior a Hasta.</p>}</>:<>
        <button className="ob-btn" onClick={()=>cambiar(abierto,[])}>Todos</button>
        {opciones.map(o=><label className="fp-opcion" key={o.valor}><input type="checkbox" checked={valor[abierto].includes(o.valor)} onChange={e=>cambiar(abierto,e.target.checked?[...valor[abierto],o.valor]:valor[abierto].filter(x=>x!==o.valor))}/><span>{o.etiqueta}</span></label>)}
        {!opciones.length && <p>Sin opciones disponibles.</p>}
      </>}
      <button className="ob-btn fp-listo" onClick={()=>{setAbierto(null);boton.current?.focus()}}>Listo</button>
    </div>,document.body)}
  </div>
}
