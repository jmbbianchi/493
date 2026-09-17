import test from 'node:test'
import assert from 'node:assert/strict'
import {fechaArgentina, fechaHoraArgentina, hoyArgentina} from '../src/fechas.js'

test('fechas civiles conservan el día y siempre llevan año completo', () => {
  assert.equal(fechaArgentina('2026-09-16'),'16/09/2026')
  assert.equal(fechaArgentina('2024-02-29'),'29/02/2024')
  assert.equal(fechaArgentina(null),'—')
})
test('hoy y timestamps usan Buenos Aires incluso al cruzar día y año UTC', () => {
  assert.equal(hoyArgentina(new Date('2026-01-01T02:59:59Z')),'2025-12-31')
  assert.equal(hoyArgentina(new Date('2026-01-01T03:00:00Z')),'2026-01-01')
  assert.equal(fechaHoraArgentina('2026-09-17T01:30:00Z'),'16/09/2026 22:30:00')
  assert.equal(fechaHoraArgentina('2026-09-17T01:30:00'),'16/09/2026 22:30:00')
  assert.equal(fechaHoraArgentina('2026-09-16T22:30:00-03:00'),'16/09/2026 22:30:00')
})
