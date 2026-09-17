import test from 'node:test'
import assert from 'node:assert/strict'
import {filtrosVacios,filtrarPagos,opcionesPagos} from '../src/filtrosPagos.js'
const pagos=[{id:'a',rubro_id:1,rubro:'Arquitecto',subrubro_id:2,subrubro:'Servicio',presupuesto_id:'p1',presupuesto:'Tomás',medio:'efectivo',moneda:'USD',fecha:'2026-09-01',monto:100}, {id:'b',rubro_id:2,rubro:'Hormigón',presupuesto_id:null,medio:'transferencia',moneda:'ARS',fecha:'2026-09-16',monto:200},{id:'c',rubro_id:1,rubro:'Arquitecto',presupuesto_id:'p2',presupuesto:'Tomás',medio:'transferencia',moneda:'ARS',fecha:'2026-09-17',monto:300,anulado:true}]
const docs={a:[{nombre:'Recibo.pdf'}]}
test('combina múltiples valores con búsqueda sin acentos y fechas inclusivas',()=>{
 const f={...filtrosVacios(),rubro:['1','2'],medio:['efectivo','transferencia'],busqueda:'hormigon',desde:'2026-09-16',hasta:'2026-09-16'}
 assert.deepEqual(filtrarPagos(pagos,docs,f).map(p=>p.id),['b'])
 assert.deepEqual(filtrarPagos(pagos,docs,{...filtrosVacios(),busqueda:'tomas recibo'}).map(p=>p.id),['a'])
})
test('distingue presupuestos del mismo nombre, pagos sueltos, adjuntos y anulados',()=>{
 assert.deepEqual(filtrarPagos(pagos,docs,{...filtrosVacios(),presupuesto:['p2'],estado:['anulado']}).map(p=>p.id),['c'])
 assert.deepEqual(filtrarPagos(pagos,docs,{...filtrosVacios(),presupuesto:[''],adjuntos:['sin']}).map(p=>p.id),['b'])
 assert.equal(opcionesPagos(pagos,docs,'presupuesto').length,3)
 assert.equal(filtrarPagos(pagos,docs,filtrosVacios()).length,3)
})
