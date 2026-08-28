import { useEffect, useState } from 'react'
import { useOutletContext, Link } from 'react-router-dom'
import * as api from '../api'
import Aviso from '../componentes/Aviso'
import { plata, num } from '../formato'

/**
 * La columna vertebral de la app: un renglón por rubro con los tres números
 * al lado y las diferencias entre ellos.
 *
 * Las columnas que todavía no tienen datos se dejan a la vista igual, y no
 * ocultas: la forma de la tabla es el argumento del producto. Quien la mira
 * tiene que ver que faltan números, no creer que hay uno solo.
 */
export default function Rubros() {
  const { obra, version } = useOutletContext()
  const [datos, setDatos] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    let vivo = true
    setDatos(null)
    Promise.all([
      api.get(`/api/obras/${obra.id}/lista-materiales`),
      api.get(`/api/obras/${obra.id}/rubros`),
      api.get(`/api/obras/${obra.id}/rubros-resumen`),
    ]).then(([lista, rubros, resumen]) => { if (vivo) setDatos({ lista, rubros, resumen }) })
      .catch((e) => { if (vivo) setError(e) })
    return () => { vivo = false }
  }, [obra.id, version])

  if (error) return <Aviso error={error} alCerrar={() => setError(null)} />
  if (!datos) return <p className="ob-cargando">Calculando…</p>

  const { lista, rubros, resumen } = datos

  // El teorico por rubro lo calcula el backend: materiales mas mano de
  // obra, con la marca de si el numero esta completo. Antes cada pantalla
  // lo reagrupaba por su cuenta y hacian tres cuentas distintas para lo
  // mismo. Un rubro sin ningun dato conocido va con raya y no con cero:
  // no es que no cueste nada, es que no se sabe.
  const porNombre = new Map(lista.rubros.map((r) => [r.rubro, r]))
  const porId = new Map(resumen.rubros.map((r) => [String(r.rubro_id), r]))

  // Solo los rubros que tienen algo. Listar los trece siempre convierte la
  // tabla en un formulario vacio y esconde los cuatro que importan.
  const filas = rubros
    .map((r) => ({ ...r, t: porNombre.get(r.nombre), p: porId.get(String(r.id)) }))
    .filter((r) => r.t || r.p)

  const totalT = filas.reduce((a, r) => a + (r.t?.hay ? r.t.total : 0), 0)
  const totalP = filas.reduce((a, r) => a + (r.p ? r.p.proyectado : 0), 0)
  const hayPresupuestos = filas.some((r) => r.p)

  // La diferencia del total SOLO suma los rubros que tienen los dos numeros.
  // Restar el total presupuestado del total teorico cuando cada uno cubre
  // rubros distintos da una cifra enorme que no significa nada, y es
  // exactamente el tipo de numero que esta app existe para no mostrar.
  const totalPagado = filas.reduce((a, r) => a + (r.p?.pagado ?? 0), 0)
  const totalSaldo = filas.reduce((a, r) => a + (r.p?.saldo ?? 0), 0)
  const hayPagos = filas.some((r) => r.p?.pagado != null)

  const comparables = filas.filter((r) => r.t?.hay && r.p)
  const difTotal = comparables.length
    ? comparables.reduce((a, r) => a + (r.p.proyectado - r.t.total), 0) : null

  return (
    <>
      <div className="ob-toolbar">
        <span className="ob-label">Rubros</span>
        <span className="ob-toolbar__meta">
          {`Teórico = materiales ${plata(lista.total_materiales)} + mano de obra ${plata(lista.total_mano_obra)}`}
          {hayPresupuestos
            ? ` · presupuestado con IPC de ${num(resumen.proyeccion.variacion_mensual_usada, 1)} % mensual donde el índice no salió`
            : ' · todavía no hay ningún presupuesto cargado'}
        </span>
      </div>

      <div className="ob-tablewrap">
        <table className="ob-table">
          <thead>
            <tr>
              <th className="ob-table__gutter">#</th>
              <th>Rubro</th>
              <th className="ob-num">Teórico</th>
              <th className="ob-num">Presupuestado</th>
              <th className="ob-num">Diferencia</th>
              <th className="ob-num">Pagado</th>
              <th className="ob-num">Falta pagar</th>
            </tr>
          </thead>
          <tbody>
            {filas.map((r, i) => {
              const t = r.t?.hay ? r.t.total : null
              const p = r.p ? r.p.proyectado : null
              const dif = t != null && p != null ? p - t : null
              return (
                <tr key={r.id}>
                  <td className="ob-table__gutter">{i + 1}</td>
                  <td className="ob-table__strong">
                    <Link to={`/obra/${obra.id}/rubros/${r.id}`}>{r.nombre}</Link>
                    {r.t && !r.t.completo && (
                      <span className="ob-chip ob-chip--warn" style={{ marginLeft: '.4rem' }}
                        title={[r.t.falta_precio && `${r.t.falta_precio} sin precio`,
                          r.t.falta_costo_mo && `${r.t.falta_costo_mo} sin costo de mano de obra`]
                          .filter(Boolean).join(' · ')}>
                        {r.t.hay ? 'de menos' : 'sin datos'}
                      </span>
                    )}
                  </td>
                  <td className={`ob-num${t == null ? ' ob-table__sec' : ''}`}>
                    {t == null ? '—' : plata(t)}
                  </td>
                  <td className={`ob-num${p == null ? ' ob-table__sec' : ''}`}>
                    {p == null ? '—' : plata(p)}
                  </td>
                  <td className={`ob-num ${dif == null ? 'ob-table__sec'
                    : `ob-delta--${dif > 0 ? 'sube' : 'baja'}`}`}>
                    {dif == null ? '—' : `${dif > 0 ? '+' : ''}${plata(dif)}`}
                  </td>
                  <td className={`ob-num${r.p?.pagado == null ? ' ob-table__sec' : ''}`}>
                    {r.p?.pagado == null ? '—' : plata(r.p.pagado)}
                  </td>
                  <td className={`ob-num${r.p?.saldo == null ? ' ob-table__sec' : ''}`}>
                    {r.p?.saldo == null ? '—' : plata(r.p.saldo)}
                  </td>
                </tr>
              )
            })}
          </tbody>
          <tfoot>
            <tr>
              <td className="ob-table__gutter" />
              <td>Total</td>
              <td className="ob-num ob-total">{plata(totalT)}</td>
              <td className={`ob-num${hayPresupuestos ? ' ob-total' : ' ob-table__sec'}`}>
                {hayPresupuestos ? plata(totalP) : '—'}
              </td>
              <td className={`ob-num ${difTotal == null ? 'ob-table__sec'
                : `ob-delta--${difTotal > 0 ? 'sube' : 'baja'}`}`}
                title={difTotal == null ? 'Ningun rubro tiene el teorico y el presupuestado a la vez'
                  : `Solo sobre ${comparables.length} rubro(s) con los dos numeros`}>
                {difTotal == null ? '—' : `${difTotal > 0 ? '+' : ''}${plata(difTotal)}`}
              </td>
              <td className={`ob-num${hayPagos ? ' ob-total' : ' ob-table__sec'}`}>
                {hayPagos ? plata(totalPagado) : '—'}
              </td>
              <td className={`ob-num${hayPagos ? '' : ' ob-table__sec'}`}>
                {hayPagos ? plata(totalSaldo) : '—'}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>

      {lista.sin_precio.length > 0 && (
        <p className="ob-nota">
          {lista.sin_precio.length} material(es) sin precio no suman al teórico.
          Cargalos en Materiales y precios.
        </p>
      )}
    </>
  )
}
