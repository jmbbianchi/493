import { useEffect, useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import * as api from '../api'
import Aviso from '../componentes/Aviso'
import { plata, porGrupo } from '../formato'

/**
 * La columna vertebral de la app: un renglon por rubro con los tres numeros
 * al lado. Hoy solo esta poblada la primera columna.
 *
 * Las columnas vacias se dejan a la vista igual, y no ocultas hasta que haya
 * datos: la forma de la tabla es el argumento del producto. Quien la mira
 * tiene que ver que faltan dos numeros, no creer que hay uno solo.
 */
export default function Rubros() {
  const { obra, version } = useOutletContext()
  const [datos, setDatos] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    let vivo = true
    setDatos(null)
    api.get(`/api/obras/${obra.id}/lista-materiales`)
      .then((d) => { if (vivo) setDatos(d) })
      .catch((e) => { if (vivo) setError(e) })
    return () => { vivo = false }
  }, [obra.id, version])

  if (error) return <Aviso error={error} />
  if (!datos) return <p className="ob-cargando">Calculando…</p>

  const grupos = porGrupo(datos.filas, 'rubro')
  const teorico = (g) => g.filas.reduce((a, f) => a + (f.subtotal == null ? 0 : Number(f.subtotal)), 0)

  return (
    <>
      <div className="ob-toolbar">
        <span className="ob-label">Rubros</span>
        <span className="ob-toolbar__meta">
          El teorico sale del computo · el presupuestado y el pagado todavia no se cargan
        </span>
      </div>

      <div className="ob-tablewrap">
        <table className="ob-table">
          <thead>
            <tr>
              <th className="ob-table__gutter">#</th>
              <th>Rubro</th>
              <th className="ob-num">Teorico</th>
              <th className="ob-num">Presupuestado</th>
              <th className="ob-num">Pagado</th>
              <th className="ob-num">Falta pagar</th>
            </tr>
          </thead>
          <tbody>
            {grupos.map((g, i) => (
              <tr key={g.nombre}>
                <td className="ob-table__gutter">{i + 1}</td>
                <td className="ob-table__strong">{g.nombre}</td>
                <td className="ob-num">{plata(teorico(g))}</td>
                <td className="ob-num ob-table__sec">—</td>
                <td className="ob-num ob-table__sec">—</td>
                <td className="ob-num ob-table__sec">—</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td className="ob-table__gutter" />
              <td>Total</td>
              <td className="ob-num ob-total">{plata(datos.total)}</td>
              <td className="ob-num ob-table__sec">—</td>
              <td className="ob-num ob-table__sec">—</td>
              <td className="ob-num ob-table__sec">—</td>
            </tr>
          </tfoot>
        </table>
      </div>

      {datos.sin_precio.length > 0 && (
        <p className="ob-nota">
          {datos.sin_precio.length} material(es) sin precio no suman al teorico.
          Cargalos en Materiales y precios.
        </p>
      )}
    </>
  )
}
