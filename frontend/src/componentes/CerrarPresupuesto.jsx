import {useEffect,useState} from 'react'
import * as api from '../api'
import Modal from './Modal'
import {hoyArgentina} from '../fechas'
import {num,fecha} from '../formato'

export default function CerrarPresupuesto({obraId,presupuesto,total,alCerrar,alGuardar}) {
  const [dia,setDia]=useState(hoyArgentina()),[motivo,setMotivo]=useState(''),[reemplazo,setReemplazo]=useState('')
  const [opciones,setOpciones]=useState([]),[error,setError]=useState(''),[guardando,setGuardando]=useState(false)
  useEffect(()=>{api.get(`/api/obras/${obraId}/presupuestos`).then(ps=>setOpciones(ps.filter(p=>p.id!==presupuesto.id && p.estado!=='anulado' && !p.cierre_fecha))).catch(e=>setError(e.message))},[obraId,presupuesto.id])
  const guardar=async e=>{
    e.preventDefault();setGuardando(true);setError('')
    try {
      await api.post(`/api/obras/${obraId}/presupuestos/${presupuesto.id}/cerrar`,{fecha:dia,motivo:motivo.trim(),monto_cancelado:Number(total.saldo.toFixed(2)),reemplazo_id:reemplazo||null})
      alGuardar()
    } catch(e){setError(e.message);setGuardando(false)}
  }
  return <Modal titulo="Cerrar presupuesto con saldo cancelado" alCerrar={guardando ? ()=>{} : alCerrar}>
    <form onSubmit={guardar}>
      <p><b>{presupuesto.nombre}</b></p>
      <p>Saldo a cancelar sin pago: <strong>{presupuesto.moneda} {num(total.saldo,2)}</strong></p>
      <p>El monto original y lo pagado se conservan. Se cierra el saldo completo y deja de figurar como pendiente. El acuerdo y sus pagos quedan como historial.</p>
      {error && <p role="alert">{error}</p>}
      <label className="ob-campo">Fecha de cierre<input className="ob-input" type="date" required max={hoyArgentina()} value={dia} onChange={e=>setDia(e.target.value)}/></label>
      <label className="ob-campo">Motivo del cierre<textarea className="ob-input" required minLength={3} maxLength={1000} value={motivo} onChange={e=>setMotivo(e.target.value)} placeholder="Se reemplaza por un presupuesto actualizado"/></label>
      <label className="ob-campo">Presupuesto reemplazante (opcional)<select className="ob-input" value={reemplazo} onChange={e=>setReemplazo(e.target.value)}><option value="">Sin vínculo</option>{opciones.map(p=><option key={p.id} value={p.id}>{p.nombre} · {fecha(p.fecha_base)} · {p.moneda} {num(p.monto_base,2)}</option>)}</select></label>
      <button className="ob-btn" type="button" disabled={guardando} onClick={alCerrar}>Volver</button>{' '}
      <button className="ob-btn ob-btn--primario" disabled={guardando || motivo.trim().length<3}>{guardando?'Guardando…':'Confirmar cierre sin pago'}</button>
    </form>
  </Modal>
}
