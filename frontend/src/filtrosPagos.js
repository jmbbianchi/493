import {fechaArgentina} from './fechas.js'
import {num} from './formato.js'
export const filtrosVacios = () => ({busqueda:'',desde:'',hasta:'',rubro:[],tipo:[],presupuesto:[],medio:[],moneda:[],adjuntos:[],estado:[]})
const texto = v => String(v ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase()
export function valorFiltro(p,campo,docs) {
  return String(({rubro:p.rubro_id ?? '',tipo:p.subrubro_id ?? '',presupuesto:p.presupuesto_id ?? '',medio:p.medio,moneda:p.moneda,adjuntos:docs[p.id]?.length?'con':'sin',estado:p.anulado?'anulado':'registrado'})[campo])
}
export function filtrarPagos(pagos,docs,f) {
  const palabras=texto(f.busqueda).trim().split(/\s+/).filter(Boolean)
  return pagos.filter(p=>{
    const dia=p.fecha.slice(0,10)
    if(f.desde && dia<f.desde || f.hasta && dia>f.hasta)return false
    if(['rubro','tipo','presupuesto','medio','moneda','adjuntos','estado'].some(k=>f[k].length && !f[k].includes(valorFiltro(p,k,docs))))return false
    const contenido=texto([p.rubro,p.subrubro,p.presupuesto || 'Sin presupuesto previo',p.medio,p.moneda,p.notas,p.monto,fechaArgentina(dia),...(docs[p.id]||[]).map(d=>d.nombre)].join(' '))
    return palabras.every(palabra=>contenido.includes(palabra))
  })
}
export function opcionesPagos(pagos,docs,campo,presupuestos={}) {
  const opciones=new Map()
  for(const p of pagos){
    const valor=valorFiltro(p,campo,docs)
    const acuerdo=presupuestos[p.presupuesto_id]
    const etiqueta=({rubro:p.rubro || 'Sin rubro',tipo:p.subrubro || 'Sin tipo',presupuesto:p.presupuesto ? `${p.presupuesto}${acuerdo?.fecha_base?` · ${fechaArgentina(acuerdo.fecha_base)}`:''}${acuerdo?.nominal!=null?` · ${acuerdo.moneda} ${num(acuerdo.nominal,2)}`:''}` : 'Sin presupuesto previo',medio:p.medio,moneda:p.moneda,adjuntos:valor==='con'?'Con adjuntos':'Sin adjuntos',estado:p.anulado?'Anulado':'Registrado'})[campo]
    opciones.set(valor,{valor,etiqueta})
  }
  return [...opciones.values()].sort((a,b)=>a.etiqueta.localeCompare(b.etiqueta,'es'))
}
