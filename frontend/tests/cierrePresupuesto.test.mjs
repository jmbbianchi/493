import test from 'node:test'
import assert from 'node:assert/strict'
import {tesoreria} from '../src/tesoreria.js'
test('saldo cancelado no aparece como desembolso ni aumenta gasto',()=>{
  const p={id:'a',cerrado:true,nominal:590000,moneda:'ARS',rubro_id:1,cuotas:[{id:'q',monto_nominal:590000,monto_proyectado:900000,fecha_prevista:'2026-01-01'}]}
  const m=tesoreria({presupuestos:[p],pagos:[{id:'g',presupuesto_id:'a',rubro_id:1,moneda:'ARS',monto:490000,fecha:'2026-01-01'}],hoy:'2026-09-16'})
  assert.equal(m.pendiente,0)
  assert.equal(m.pagado,49000000)
  assert.equal(m.aprobado,59000000)
  assert.equal(m.registros.some(r=>r.clase==='cuota'),false)
})
