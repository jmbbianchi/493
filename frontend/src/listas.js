// Rubros y tipos ocultos.
//
// Ocultar saca el elemento de los desplegables, no de los datos. Por eso
// el que está puesto en el registro que estoy editando se muestra igual
// aunque esté oculto: si no apareciera, abrir un pago viejo para
// corregirle el monto le cambiaría también el rubro, sin que nadie lo
// pida y sin que se note.
//
// `activo` llega de SQL como bit: 1 / 0. Una lista vieja que no lo traiga
// se trata como activa, que es lo que era antes de que esto existiera.
export const estaActivo = (x) => x.activo === undefined || x.activo === null
  || !(x.activo === 0 || x.activo === false)

export function visibles(lista, seleccionado) {
  return (lista || []).filter(
    (x) => estaActivo(x) || (seleccionado != null && String(x.id) === String(seleccionado)))
}
