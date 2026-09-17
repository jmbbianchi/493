import test from 'node:test'
import assert from 'node:assert/strict'
import {tesoreria} from '../src/tesoreria.js'

test('el pago de un acuerdo no cubre otro del mismo rubro', () => {
  const comun={rubro_id:1,rubro:'Ing. Civil',subrubro_id:2,subrubro:'Servicio',moneda:'ARS'}
  const presupuestos=[
    {...comun,id:'a',nominal:590000,cuotas:[{id:'ca',monto_nominal:590000,monto_proyectado:590000}]},
    {...comun,id:'b',nominal:620000,cuotas:[{id:'cb',monto_nominal:620000,monto_proyectado:620000}]},
  ]
  const m=tesoreria({presupuestos,pagos:[{...comun,id:'p',presupuesto_id:'a',fecha:'2025-07-22',monto:380000}],hoy:'2026-09-16'})
  assert.equal(m.pendiente,83000000)
  assert.equal(m.registros.find(r=>r.id==='ca').cubierto,38000000)
  assert.equal(m.registros.find(r=>r.id==='cb').cubierto,0)
})
