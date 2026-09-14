import {test} from 'node:test'
import assert from 'node:assert/strict'
import {tesoreria, sumar, resumenCelda} from '../src/tesoreria.js'
const hoy='2026-09-14'
const tasas=[{fecha:'2025-06-02',valor:1000},{fecha:hoy,valor:1500}]
const p={id:'b',nombre:'Arquitecto',rubro_id:1,rubro:'Arquitecto',subrubro_id:2,subrubro:'Servicio',moneda:'USD',cuotas:[{id:'c',monto_nominal:33600,monto_proyectado:33600,fecha_prevista:'2026-09-01'}]}
const pago={id:'g',presupuesto_id:'b',rubro_id:1,rubro:'Arquitecto',subrubro_id:2,subrubro:'Servicio',moneda:'ARS',monto:1600000,fecha:'2025-06-02'}
const base={presupuestos:[p],pagos:[pago],tasas,hoy}
test('saldo USD fijo convertido hoy y gasto convertido históricamente',()=>{
  const usd=tesoreria({...base,moneda:'USD'}), ars=tesoreria({...base,moneda:'ARS'})
  assert.equal(usd.pendiente,3200000); assert.equal(usd.pagado,160000)
  assert.equal(ars.pendiente,4800000000); assert.equal(ars.pagado,160000000)
  assert.equal(usd.semanaActual,3200000)
})
test('mover saldo parcial conserva monto, pagos y fecha del acuerdo',()=>{
  const m=tesoreria({...base,moneda:'USD',programaciones:[{cuota_id:'c',fecha:'2026-09-23',version:1}]})
  assert.equal(m.semanaActual,0);assert.equal(m.proxima,3200000);assert.equal(m.pendiente,3200000)
  const q=m.registros.find(r=>r.clase==='cuota');assert.equal(q.original,'2026-09-01');assert.equal(q.estado,'parcial')
  assert.equal(p.cuotas[0].fecha_prevista,'2026-09-01')
})
test('arrastre cambia al lunes nuevo sin duplicar deuda y sin mover pagos',()=>{
  const m=tesoreria({...base,moneda:'USD',hoy:'2026-09-21'})
  assert.equal(m.registros.find(r=>r.clase==='cuota').semana,'2026-09-21')
  assert.equal(m.registros.find(r=>r.clase==='pago').semana,'2025-06-02')
  assert.equal(sumar(m.filas.map(f=>resumenCelda(f.registros).pendiente)),m.pendiente)
})
test('quitar fecha mantiene saldo sin programar y total incluye fuera de horizonte',()=>{
  const m=tesoreria({...base,moneda:'USD',programaciones:[{cuota_id:'c',fecha:null,version:1}]})
  assert.equal(m.sinFecha,3200000);assert.equal(m.semanaActual,0);assert.equal(m.pendiente,3200000)
  const futuro=tesoreria({...base,moneda:'USD',programaciones:[{cuota_id:'c',fecha:'2028-01-01',version:2}]})
  assert.equal(futuro.pendiente,3200000);assert.equal(futuro.semanaActual,0)
})
test('pagos sueltos cuentan en gasto sin crear deuda y anulados no cuentan',()=>{
  const m=tesoreria({...base,presupuestos:[],pagos:[{...pago,presupuesto_id:null},{...pago,id:'a',anulado:true}],moneda:'USD'})
  assert.equal(m.pagado,160000);assert.equal(m.pendiente,0)
})
test('faltante histórico no se sustituye con dólar actual',()=>{
  const m=tesoreria({...base,tasas:tasas.slice(1),moneda:'USD'})
  assert.equal(m.pagado,null);assert.equal(m.pendiente,null)
  assert.equal(tesoreria({...base,pagos:[],tasas:[],moneda:'USD'}).pendiente,3360000)
})
test('cobertura completa no reaparece como vencida',()=>{
  const m=tesoreria({...base,pagos:[{...pago,moneda:'USD',monto:33600}],moneda:'USD'})
  assert.equal(m.pendiente,0);assert.equal(m.semanaActual,0)
  assert.equal(m.registros.find(r=>r.clase==='cuota').estado,'completo')
})
test('la reprogramación no reordena imputación de pagos sin cuota',()=>{
  const presupuesto={...p,cuotas:[{...p.cuotas[0],monto_nominal:100,monto_proyectado:110},{id:'d',fecha_prevista:'2026-09-08',monto_nominal:100,monto_proyectado:110}]}
  const m=tesoreria({...base,presupuestos:[presupuesto],pagos:[{...pago,moneda:'USD',monto:120}],programaciones:[{cuota_id:'c',fecha:'2027-01-01'}],moneda:'USD'})
  assert.equal(m.registros.find(r=>r.id==='c').pendiente,0);assert.equal(m.registros.find(r=>r.id==='d').pendiente,8000)
})
