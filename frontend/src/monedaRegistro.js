import {convertirCentavos,tasaEn,sumar} from './tesoreria.js'
export const convertirRegistro=(monto,origen,moneda,tasa)=>convertirCentavos(monto==null?null:Math.round(Number(monto)*100),origen,moneda,tasa)
export const importePago=(p,moneda,tasas)=>convertirRegistro(p.monto,p.moneda,moneda,tasaEn(tasas,p.fecha.slice(0,10)))
export function resumenRegistro(visibles,saldos,moneda,tasas,hoy){
  const vigentes=visibles.filter(p=>!p.anulado)
  const ids=[...new Set(vigentes.map(p=>p.presupuesto_id).filter(Boolean))]
  const actual=tasaEn(tasas,hoy)
  return {total:sumar(vigentes.map(p=>importePago(p,moneda,tasas))),
    pendiente:sumar(ids.map(id=>convertirRegistro(saldos[id]?.saldo,saldos[id]?.moneda,moneda,actual))),
    cantidad:vigentes.length,presupuestos:ids.length,actual}
}
