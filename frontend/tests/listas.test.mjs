import test from 'node:test'
import assert from 'node:assert/strict'
import { visibles, estaActivo } from '../src/listas.js'

const lista = [
  { id: 1, nombre: 'Mamposteria', activo: 1 },
  { id: 2, nombre: 'Cementista', activo: 0 },
  { id: 3, nombre: 'Revoques', activo: true },
]

test('un rubro oculto sale del desplegable', () => {
  assert.deepEqual(visibles(lista).map((x) => x.id), [1, 3])
})

test('pero sigue a la vista en el registro que lo usa', () => {
  // Si no apareciera, abrir ese pago para corregirle el monto le cambiaria
  // el rubro al primero de la lista sin que nadie lo pida.
  assert.deepEqual(visibles(lista, 2).map((x) => x.id), [1, 2, 3])
  assert.deepEqual(visibles(lista, '2').map((x) => x.id), [1, 2, 3])
})

test('una lista vieja sin la columna se trata como activa', () => {
  assert.equal(estaActivo({ id: 9, nombre: 'Otros' }), true)
  assert.deepEqual(visibles([{ id: 9 }]).map((x) => x.id), [9])
})

test('sin lista no explota', () => {
  assert.deepEqual(visibles(undefined, 1), [])
})
