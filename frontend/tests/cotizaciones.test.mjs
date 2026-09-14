import {test} from 'node:test'
import assert from 'node:assert/strict'
import {agruparSerie,ipcAcumulado,formatoValor} from '../src/cotizaciones.js'
test('cierre de intervalo toma último dato sin promediar ni sumar',()=>{
 const vs=[{fecha:'2026-01-02',valor:100},{fecha:'2026-01-05',valor:102},{fecha:'2026-01-30',valor:110}]
 assert.equal(agruparSerie(vs,'mes')[0].valor,110)
 assert.equal(agruparSerie(vs,'anio')[0].fechaDato,'2026-01-30')
 assert.equal(agruparSerie(vs,'semana')[0].fecha,'2025-12-29')
})
test('IPC se compone y no se suma; los huecos no son cero',()=>{
 const meses=[{fecha:'2026-01-01',valor:10},{fecha:'2026-02-01',valor:20}]
 assert.ok(Math.abs(ipcAcumulado(meses,'2026-01-01').valor-32)<1e-9)
 assert.equal(ipcAcumulado([meses[1]],'2026-01-01').valor,null)
 assert.equal(ipcAcumulado([meses[0],{fecha:'2026-03-01',valor:5}]).completo,false)
 assert.equal(ipcAcumulado([]).valor,null)
})
test('importes en ARS y USD usan dos decimales',()=>{
 assert.equal(formatoValor(1531.73002,'ARS'),'ARS 1.531,73')
 assert.equal(formatoValor(10,'USD'),'U$D 10,00')
 assert.equal(formatoValor(null,'ARS'),'—')
})
