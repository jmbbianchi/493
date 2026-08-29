import * as api from './api'

/**
 * Sube un archivo a Blob Storage en tres pasos.
 *
 *   1. Pedir permiso al backend, que crea la fila y firma un SAS de
 *      escritura para ese blob y por quince minutos.
 *   2. PUT del archivo DIRECTO a Storage. No pasa por el backend: una foto
 *      de 4 MB atravesando un contenedor que tiene que poder dormirse es
 *      trabajo que no hace falta.
 *   3. Confirmar. Recién ahí la fila queda marcada como subida.
 *
 * El paso 3 existe porque el 2 puede fallar. Si el teléfono se queda sin
 * señal a mitad de la subida queda una fila sin archivo, y esa fila no se
 * muestra en ningún lado.
 */
export async function subir(obraId, archivo, { tipo = 'otro', ...colgar } = {}) {
  const permiso = await api.post(`/api/obras/${obraId}/documentos/subida`, {
    tipo,
    nombre: archivo.name,
    mime: archivo.type || null,
    bytes: archivo.size,
    ...colgar,
  })

  const r = await fetch(permiso.url, {
    method: 'PUT',
    // Sin x-ms-blob-type el PUT lo rechaza Storage con un 400 que no dice
    // por qué. Es obligatorio para crear un blob de bloques.
    headers: {
      'x-ms-blob-type': 'BlockBlob',
      ...(archivo.type ? { 'Content-Type': archivo.type } : {}),
    },
    body: archivo,
  })
  if (!r.ok) {
    throw new Error(`No se pudo subir el archivo (${r.status}). Probá de nuevo.`)
  }

  await api.post(`/api/obras/${obraId}/documentos/${permiso.id}/confirmar`, {})
  return permiso.id
}
