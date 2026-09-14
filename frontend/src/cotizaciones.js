import { semana } from './calendarioPagos.js'
import { num } from './formato.js'

export const periodo = (fecha,paso) => paso==='anio' ? fecha.slice(0,4)+'-01-01' : paso==='mes' ? fecha.slice(0,7)+'-01' : paso==='semana' ? semana(fecha) : fecha.slice(0,10)
export const fechaCotizacion = f => f ? f.slice(0,10).split('-').reverse().join('/') : '—'
export function formatoValor(v,unidad) {
  if(v==null)return '—'
  return unidad==='ARS' || unidad==='USD' ? `${unidad==='USD' ? 'U$D' : 'ARS'} ${num(v,2)}` : `${num(v,2)}${unidad==='%' ? ' %' : ''}`
}
export function agruparSerie(valores,paso) {
  const grupos = new Map()
  for(const v of [...valores].sort((a,b)=>a.fecha.localeCompare(b.fecha))) {
    if(v.valor==null || !Number.isFinite(Number(v.valor)))continue
    grupos.set(periodo(v.fecha,paso),{fecha:periodo(v.fecha,paso),fechaDato:v.fecha,valor:Number(v.valor)})
  }
  return [...grupos.values()]
}
export function ipcAcumulado(valores,desdeMes=null) {
  const meses=agruparSerie(valores,'mes')
  if(!meses.length)return {valor:null,meses:0,ultimo:null,completo:false}
  const ordinal=f=>Number(f.slice(0,4))*12+Number(f.slice(5,7))-1
  const esperado=ordinal(meses.at(-1).fecha)-ordinal(desdeMes || meses[0].fecha)+1
  const completo=esperado===meses.length && (!desdeMes || meses[0].fecha.slice(0,7)===desdeMes.slice(0,7))
  return {valor:completo ? (meses.reduce((n,v)=>n*(1+v.valor/100),1)-1)*100 : null,
    meses:meses.length,ultimo:meses.at(-1).fecha,completo}
}
