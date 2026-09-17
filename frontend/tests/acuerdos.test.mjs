import test from 'node:test'
import assert from 'node:assert/strict'
import {totalAcuerdo,repartirAcuerdo} from '../src/acuerdos.js'

test('renegocia un desembolso y actualiza el total exacto',()=>{
  assert.equal(totalAcuerdo(repartirAcuerdo([{monto_nominal:12340578.73}],12340000)),12340000)
  assert.equal(totalAcuerdo([{monto_nominal:'0.10'},{monto_nominal:'0.20'}]),.3)
})
test('conserva cuotas con pagos y reparte centavos sin perder total',()=>{
  const cuotas=[{con_pagos:true,monto_nominal:'20'},...Array.from({length:3},()=>({monto_nominal:'30'}))]
  const nuevas=repartirAcuerdo(cuotas,'99.99')
  assert.equal(nuevas[0],cuotas[0])
  assert.equal(totalAcuerdo(nuevas),99.99)
  assert.throws(()=>repartirAcuerdo(cuotas,19))
})
