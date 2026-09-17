import {useEffect,useState} from 'react'
import {useOutletContext} from 'react-router-dom'
import * as api from '../api'
import CalendarioSemanalPagos from '../componentes/CalendarioSemanalPagos'
import {superficieCalculo} from '../obra'

export default function CronogramaPagos(){
  const {obra,version}=useOutletContext()
  const [datos,setDatos]=useState(null),[error,setError]=useState(''),[intento,setIntento]=useState(0)
  useEffect(()=>{let activo=true;setDatos(null);setError('')
    Promise.all([api.get(`/api/obras/${obra.id}/pagar-destinos`),api.get(`/api/obras/${obra.id}/pagos`)])
      .then(([destinos,pagos])=>{if(activo)setDatos({destinos,pagos})}).catch(e=>{if(activo)setError(e.message)})
    return()=>{activo=false}
  },[obra.id,version,intento])
  if(error)return <p role="alert">{error} <button className="ob-btn" onClick={()=>setIntento(n=>n+1)}>Reintentar</button></p>
  if(!datos)return <p className="ob-cargando">Cargando cronograma…</p>
  return <CalendarioSemanalPagos key={obra.id} obraId={obra.id} superficie={superficieCalculo(obra)} destinos={datos.destinos} pagos={datos.pagos}/>
}
