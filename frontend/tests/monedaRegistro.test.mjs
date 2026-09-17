import test from 'node:test'
import assert from 'node:assert/strict'
import {importePago,resumenRegistro} from '../src/monedaRegistro.js'
const tasas=[{fecha:'2025-01-01',valor:1000},{fecha:'2026-09-17',valor:1500}]
const pagos=[{id:'a',presupuesto_id:'p',fecha:'2025-01-02',monto:100,moneda:'USD'},{id:'b',presupuesto_id:'p',fecha:'2025-01-02',monto:200000,moneda:'ARS'},{id:'c',fecha:'2025-01-02',monto:999,moneda:'USD',anulado:true}]
test('convierte pagos al histórico y cuenta el saldo una sola vez al actual',()=>{
 const saldos={p:{saldo:500,moneda:'USD'}}
 const ars=resumenRegistro(pagos,saldos,'ARS',tasas,'2026-09-17')
 assert.equal(ars.total,30000000);assert.equal(ars.pendiente,75000000);assert.equal(ars.presupuestos,1)
 const usd=resumenRegistro(pagos,saldos,'USD',tasas,'2026-09-17')
 assert.equal(usd.total,30000);assert.equal(usd.pendiente,50000)
 assert.equal(resumenRegistro(pagos.slice(0,1),saldos,'USD',tasas,'2026-09-17').total,10000)
 assert.equal(resumenRegistro([],saldos,'ARS',tasas,'2026-09-17').pendiente,0)
})
test('una cotización faltante no se reemplaza con la actual',()=>{
 assert.equal(importePago({...pagos[0],fecha:'2024-01-01'},'ARS',tasas),null)
 assert.equal(importePago({...pagos[0],fecha:'2024-01-01'},'USD',tasas),10000)
})
