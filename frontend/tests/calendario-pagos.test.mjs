import { test } from 'node:test'
import assert from 'node:assert/strict'
import { calendarioPagos, semana } from '../src/calendarioPagos.js'
const presupuesto = { rubro_id: 1, rubro: 'Hormigón', subrubro_id: 2, subrubro: 'Materiales', moneda: 'ARS', cuotas: [{ id: 'c', estado: 'pendiente', fecha_prevista: '2026-09-15', monto_nominal: 100, monto_proyectado: 110 }] }
const pago = { ...presupuesto, id: 'p', presupuesto_id: 'b', cuota_id: 'c', fecha: '2026-09-14', monto: 40 }
test('semana usa lunes incluso al cruzar año', () => assert.equal(semana('2027-01-01'), '2026-12-28'))
test('parcial y pagado se distinguen sin duplicar cuota', () => {
 const c=calendarioPagos([presupuesto],[pago],'2026-09-20')[0].semanas['2026-09-14']
 assert.equal(c.pactado,10000); assert.equal(c.pagado,4000); assert.equal(c.pendiente,6000); assert.equal(c.parciales,1)
})
test('sin presupuesto queda pagado sin generar compromiso', () => {
 const c=calendarioPagos([], [{...pago,presupuesto_id:null,cuota_id:null}],'2026-09-20')[0].semanas['2026-09-14']
 assert.equal(c.pagado,4000); assert.equal(c.pactado,0); assert.equal(c.sinImputar,0)
})
test('no imputa pagos sueltos, anulados ni futuros', () => {
 const c=calendarioPagos([presupuesto],[{...pago,cuota_id:null},{...pago,anulado:true},{...pago,fecha:'2026-09-18'}],'2026-09-16')[0].semanas['2026-09-14']
 assert.equal(c.pagado,4000); assert.equal(c.sinImputar,4000); assert.equal(c.pendiente,10000); assert.equal(c.diferido,4000)
})
test('monedas separadas y no resta dólares a pesos', () => {
 const rows=calendarioPagos([presupuesto],[{...pago,moneda:'USD'}],'2026-09-20')
 assert.equal(rows.length,2); assert.equal(rows.find((r)=>r.moneda==='ARS').semanas['2026-09-14'].pendiente,10000)
})

import { agruparRubros, estadoPago } from '../src/calendarioPagos.js'
test('rubro agrega subrubros sin mezclar monedas y conserva estimacion incompleta', () => {
 const segundo = {...presupuesto, subrubro_id: 3, cuotas: [{...presupuesto.cuotas[0], id:'d', monto_proyectado:null}]}
 const filas = calendarioPagos([presupuesto, segundo], [{...pago, monto:100}, {...pago, moneda:'USD'}], '2026-09-20')
 const grupos = agruparRubros(filas)
 assert.equal(grupos.length,2)
 const ars = grupos.find(g=>g.moneda==='ARS')
 assert.equal(ars.hijos.length,2)
 const c = ars.semanas['2026-09-14']
 assert.equal(c.pactado,20000)
 assert.equal(c.pagado,10000)
 assert.equal(c.pendiente,10000)
 assert.equal(c.sinEstimacion,true)
 assert.equal(estadoPago(c),'parcial')
})
test('colores distinguen cuotas y pagos sin compromiso', () => {
 const celda = (pagos) => calendarioPagos([presupuesto],pagos,'2026-09-20')[0].semanas['2026-09-14']
 assert.equal(estadoPago(celda([])),'pendiente')
 assert.equal(estadoPago(celda([pago])),'parcial')
 assert.equal(estadoPago(celda([{...pago,monto:100}])),'completo')
 assert.equal(estadoPago(celda([{...pago,cuota_id:null}])),'pendiente')
 assert.equal(estadoPago({pagado:4000,cuotas:0}),'completo')
 assert.equal(estadoPago(undefined),'')
})
