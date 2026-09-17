import {useEffect,useState} from 'react'
import {useOutletContext} from 'react-router-dom'
import * as api from '../api'
import Aviso from '../componentes/Aviso'
import Adjuntos from '../componentes/Adjuntos'
import {superficieCalculo} from '../obra'
import {num} from '../formato'
import '../styles/datos-obra.css'

const campos=[['nombre','Nombre de la obra'],['direccion','Dirección'],['nomenclatura','Nomenclatura catastral'],['partida_inmob','Partida inmobiliaria']]
const superficies=[['sup_terreno','Terreno'],['sup_cubierta','Cubierta'],['sup_semicubierta','Semicubierta'],['sup_descubierta','Descubierta']]
export default function Documentacion({obra,alCambiar}){
  const {recargarObras}=useOutletContext()
  const [d,setD]=useState(obra),[error,setError]=useState(null),[ocupado,setOcupado]=useState(false),[aviso,setAviso]=useState('')
  const [docs,setDocs]=useState([]),[filtro,setFiltro]=useState('obra')
  useEffect(()=>setD(obra),[obra])
  const cargar=async()=>{try{setDocs(await api.get(`/api/obras/${obra.id}/documentos`))}catch(e){setError(e)}}
  useEffect(()=>{cargar()},[obra.id])
  const campo=k=>({value:d[k]??'',onChange:e=>{setD({...d,[k]:e.target.value});setAviso('')}})
  const guardar=async e=>{
    e.preventDefault();setOcupado(true);setError(null);setAviso('')
    try{
      const payload=Object.fromEntries(campos.map(([k])=>[k,d[k]?.trim() || null]))
      for(const [k] of superficies)payload[k]=d[k]==null || d[k]==='' ? null : Number(d[k])
      Object.assign(payload,{criterio_m2:d.criterio_m2,desperdicio_pct:Number(d.desperdicio_pct),moneda_base:d.moneda_base,estado:d.estado,fecha_inicio:d.fecha_inicio?.slice(0,10) || null})
      await api.patch(`/api/obras/${obra.id}`,payload)
      await recargarObras();alCambiar?.();setAviso('Datos guardados. La cabecera y el gasto por m² usan estos valores.')
    }catch(err){setError(err)}finally{setOcupado(false)}
  }
  const visibles=docs.filter(x=>filtro==='todos' || (!x.pago_id && !x.presupuesto_id))
  return <section className="do-panel"><h2>Datos y documentación de obra</h2>
    <Aviso error={error} alCerrar={()=>setError(null)}/>
    <form onSubmit={guardar} className="do-ficha">
      <div className="do-campos">{campos.map(([k,n])=><label key={k}>{n}<input className="ob-input" required={k==='nombre'} maxLength={k==='nombre'?160:k==='direccion'?300:k==='nomenclatura'?120:60} {...campo(k)}/></label>)}</div>
      <h3>Superficies · m²</h3><div className="do-campos">{superficies.map(([k,n])=><label key={k}>{n}<input className="ob-input" type="number" min="0" max="9999999999.99" step="0.01" {...campo(k)}/></label>)}</div>
      <div className="do-campos">
        <label>Superficie para Gasto/m²<select className="ob-input" {...campo('criterio_m2')}><option value="cubierta">Cubierta</option><option value="cubierta_mas_medio_semi">Cubierta + 50 % semicubierta</option><option value="total">Cubierta + semicubierta + descubierta</option></select></label>
        <label>Desperdicio de materiales (%)<input className="ob-input" type="number" min="0" max="100" step="0.01" required {...campo('desperdicio_pct')}/></label>
        <label>Moneda base<select className="ob-input" {...campo('moneda_base')}><option value="ARS">Pesos</option><option value="USD">Dólares</option></select></label>
        <label>Fecha de inicio<input className="ob-input" type="date" {...campo('fecha_inicio')} value={d.fecha_inicio?.slice(0,10)||''}/></label>
        <label>Estado<select className="ob-input" {...campo('estado')}><option value="en_curso">En curso</option><option value="cerrada">Cerrada</option><option value="archivada">Archivada</option></select></label>
      </div>
      <p>Superficie de cálculo: <strong>{superficieCalculo(d)==null ? 'Sin definir' : `${num(superficieCalculo(d),2)} m²`}</strong>. Gasto/m² divide los pagos realizados por esta superficie.</p>
      <button className="ob-btn ob-btn--primario" disabled={ocupado}>{ocupado?'Guardando…':'Guardar datos de obra'}</button>
      {aviso && <p role="status">{aviso}</p>}
    </form>
    <h3>Documentación de obra</h3><p>Planos, imágenes y fotos de la obra. Podés tomar una foto o adjuntar varios archivos.</p>
    <label>Mostrar <select className="ob-input" value={filtro} onChange={e=>setFiltro(e.target.value)}><option value="obra">Documentación general de obra</option><option value="todos">Todos, incluidos presupuestos y pagos</option></select></label>
    <Adjuntos obra={obra} colgar={{}} tipo="plano" titulo="Archivos" clasificar provistos={visibles} alCambiar={cargar}/>
    {!visibles.length && <p>No hay archivos en esta selección.</p>}
  </section>
}
