import { Navigate, Outlet, useParams } from 'react-router-dom'
import Lateral from './componentes/Lateral'
import { num } from './formato'

/**
 * Dos columnas: barra lateral fija y area de contenido.
 *
 * La obra sale de la URL, no del estado. Es lo que hace que un link se pueda
 * pegar en un mensaje y abra exactamente lo que el otro estaba mirando.
 */
export default function Layout({ obras, indices, version, tocado }) {
  const { obraId } = useParams()
  const obra = obras.find((o) => o.id === obraId)

  // La URL apunta a una obra que no existe o que no es de este usuario.
  // Se cae a la primera en vez de romper: un 404 aca no le sirve a nadie.
  if (!obra) return <Navigate to={`/obra/${obras[0].id}/como-viene`} replace />

  const ruta = [obra.nomenclatura,
    obra.sup_cubierta ? `${num(obra.sup_cubierta, 2)} m2 cubiertos` : null,
  ].filter(Boolean).join(' · ')

  return (
    <div className="ob-app">
      <Lateral obras={obras} obra={obra} />

      <div className="ob-contenido">
        <header className="ob-topbar">
          <span className="ob-topbar__marca">{obra.nombre}</span>
          <span className="ob-topbar__ruta">{ruta}</span>
          <span className="ob-topbar__fx ob-num">
            {indices.map((i) => `${i.c === 'UVA' ? 'UVA' : 'USD'} ${num(i.valor, 2)}`).join('  ·  ')}
          </span>
        </header>

        <main className="ob-pantalla">
          <Outlet context={{ obra, version, tocado }} />
        </main>
      </div>
    </div>
  )
}
