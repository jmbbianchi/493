import { useEffect, useState } from 'react'
import * as api from '../api'
import Aviso from '../componentes/Aviso'
import { entero, num, numCorto, plata, fecha, porGrupo } from '../formato'

/**
 * La lista de compra. No se tipea: sale del computo.
 *   a_comprar = TECHO( SUM(cantidad x consumo x (1+desperdicio)) / unidades )
 * El redondeo va una sola vez, al final.
 *
 * Agrupada por rubro y con subtotal por rubro: es como se lee un
 * presupuesto de obra y como se negocia con un corralon.
 */
export default function Lista({ obra, version }) {
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
  if (!datos) return <p style={{ padding: 'var(--ob-gap-4)', color: 'var(--ob-ink-3)' }}>Calculando…</p>

  const { filas, total, sin_precio, desperdicio_obra } = datos
  const grupos = porGrupo(filas, 'rubro')
  const subtotal = (g) => g.filas.reduce((a, f) => a + (f.subtotal == null ? 0 : Number(f.subtotal)), 0)

  let n = 0

  return (
    <>
      <div className="ob-toolbar">
        <span className="ob-label">Derivada del computo</span>
        <span className="ob-toolbar__meta">
          Desperdicio de obra {num(desperdicio_obra, 2)} % · el redondeo se aplica al total de cada material, no por tarea
        </span>
      </div>

      {sin_precio.length > 0 && (
        <div style={{
          margin: 'var(--ob-gap-4) var(--ob-gap-4) 0', padding: 'var(--ob-gap-3)',
          background: 'var(--ob-warn-soft)', color: 'var(--ob-warn)',
          border: '1px solid var(--ob-warn)', borderRadius: 'var(--ob-radius)',
          fontSize: 'var(--ob-fs-sm)',
        }}>
          {sin_precio.length === 1
            ? '1 material no tiene precio cargado y no suma al total: '
            : `${sin_precio.length} materiales no tienen precio cargado y no suman al total: `}
          {sin_precio.join(', ')}. Cargalos en Materiales y precios.
        </div>
      )}

      <div className="ob-tablewrap">
        <table className="ob-table">
          <thead>
            <tr>
              <th className="ob-table__gutter"></th>
              <th>Material</th><th>Marca</th>
              <th className="ob-num">Consumo</th>
              <th className="ob-num">Con desperdicio</th>
              <th>Un.</th>
              <th>Presentacion</th>
              <th className="ob-num">A comprar</th>
              <th className="ob-num">Precio unit.</th>
              <th className="ob-num">Subtotal</th>
            </tr>
          </thead>
          {grupos.map((g) => (
            <tbody key={g.nombre}>
              <tr className="ob-grupo">
                <td></td>
                <td colSpan={7}>{g.nombre} · {g.filas.length} {g.filas.length === 1 ? 'material' : 'materiales'}</td>
                <td className="ob-num">subtotal</td>
                <td className="ob-num ob-grupo__monto">{plata(subtotal(g))}</td>
              </tr>
              {g.filas.map((f) => {
                n += 1
                return (
                  <tr key={f.material_id}>
                    <td className="ob-table__gutter">{n}</td>
                    <td>{f.nombre}</td>
                    <td className="ob-table__sec">{f.marca || '—'}</td>
                    <td className="ob-num ob-table__sec">{num(f.consumo_neto, 2)}</td>
                    <td className="ob-num">{num(f.consumo_bruto, 2)}</td>
                    <td className="ob-table__sec">{f.unidad_consumo}</td>
                    <td className="ob-table__sec">{f.presentacion || '—'}</td>
                    <td className="ob-num ob-table__strong">{entero(f.a_comprar)}</td>
                    <td className="ob-num" title={f.precio_desde ? `Precio del ${fecha(f.precio_desde)}` : ''}>
                      {f.precio_unitario == null
                        ? <span className="ob-chip ob-chip--warn">sin precio</span>
                        : plata(f.precio_unitario)}
                    </td>
                    <td className="ob-num ob-table__strong">{f.subtotal == null ? '—' : plata(f.subtotal)}</td>
                  </tr>
                )
              })}
            </tbody>
          ))}
          {filas.length === 0 && (
            <tbody>
              <tr><td colSpan={10} style={{ color: 'var(--ob-ink-3)', padding: 'var(--ob-gap-4)' }}>
                Sin computo no hay lista. Cargá tareas en la pestaña Cómputo.
              </td></tr>
            </tbody>
          )}
          {filas.length > 0 && (
            <tfoot>
              <tr>
                <td className="ob-table__gutter"></td>
                <td colSpan={8}>Total de materiales, {grupos.length} {grupos.length === 1 ? 'rubro' : 'rubros'}</td>
                <td className="ob-num ob-total">{plata(total)}</td>
              </tr>
              {obra.sup_cubierta ? (
                <tr>
                  <td className="ob-table__gutter"></td>
                  <td colSpan={8} className="ob-table__sec">
                    Por m2 cubierto ({numCorto(obra.sup_cubierta, 2)} m2)
                  </td>
                  <td className="ob-num ob-table__sec">{plata(total / Number(obra.sup_cubierta))}</td>
                </tr>
              ) : null}
            </tfoot>
          )}
        </table>
      </div>
    </>
  )
}
