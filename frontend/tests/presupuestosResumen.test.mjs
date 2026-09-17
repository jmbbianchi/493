import test from 'node:test'
import assert from 'node:assert/strict'
import { resumenAprobados } from '../src/presupuestosResumen.js'

const presupuestos = [
  {id:'a',estado:'confirmado',moneda:'ARS',monto_base:590000,elegido:false},
  {id:'b',estado:'confirmado',moneda:'ARS',monto_base:620000,elegido:true},
  {id:'c',estado:'borrador',moneda:'ARS',monto_base:900000},
  {id:'d',estado:'confirmado',moneda:'USD',monto_base:100},
]
test('suma ambos acuerdos confirmados sin mezclar monedas ni borradores', () => {
  assert.deepEqual(resumenAprobados(presupuestos), [{moneda:'ARS',valor:1210000},{moneda:'USD',valor:100}])
  const saldos={a:{pagado:380000,saldo:210000},b:{pagado:0,saldo:620000},d:{pagado:0,saldo:100}}
  assert.deepEqual(resumenAprobados(presupuestos,saldos,'saldo'), [{moneda:'ARS',valor:830000},{moneda:'USD',valor:100}])
  assert.deepEqual(resumenAprobados(presupuestos,saldos,'pagado'), [{moneda:'ARS',valor:380000},{moneda:'USD',valor:0}])
})
test('no oculta saldos sin conversión o sin cargar', () => {
  assert.equal(resumenAprobados(presupuestos,{b:{saldo:620000}},'saldo')[0].valor,null)
})
