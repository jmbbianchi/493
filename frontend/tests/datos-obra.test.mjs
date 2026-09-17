import test from 'node:test'
import assert from 'node:assert/strict'
import {superficieCalculo} from '../src/obra.js'
import {tesoreria} from '../src/tesoreria.js'
test('superficie para gasto respeta criterio y falta de dato',()=>{
  const obra={sup_cubierta:231.46,sup_semicubierta:35.13,sup_descubierta:10}
  assert.equal(superficieCalculo(obra),231.46)
  assert.equal(superficieCalculo({...obra,criterio_m2:'cubierta_mas_medio_semi'}),249.025)
  assert.ok(Math.abs(superficieCalculo({...obra,criterio_m2:'total'})-276.59)<1e-9)
  assert.equal(superficieCalculo({}),null)
})
test('aprobado es nominal y gasto incluye pagos sueltos sin duplicarlos',()=>{
  const m=tesoreria({presupuestos:[{id:'p',nominal:100,moneda:'USD',cuotas:[]}],pagos:[{id:'g',fecha:'2026-09-01',moneda:'ARS',monto:10}],tasas:[{fecha:'2026-09-01',valor:1500}],hoy:'2026-09-16'})
  assert.equal(m.aprobado,15000000)
  assert.equal(m.pagado,1000)
  assert.equal(m.pendiente,0)
})
