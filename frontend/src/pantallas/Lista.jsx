import { useEffect, useState } from 'react'
import * as api from '../api'
import Aviso from '../componentes/Aviso'
import { entero, num, plata, fecha } from '../formato'

/**
 * La lista de compra. No se tipea: sale del computo.
 *   a_comprar = TECHO( SUM(cantidad x consumo x (1+desperdicio)) / unidades )
 * El redondeo va una sola vez, al final.
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

  return (
    <>
      <div className="ob-toolbar">
        <span className="ob-label">Derivada del computo</span>
        <span className="ob-toolbar__meta">
          Desperdicio de obra {num(desperdicio_obra, 2)} % · el redondeo se aplica al total, no por tarea
        </span>
      </div>

      {sin_precio.length > 0 && (
        <div style={{
          margin: 'var(--ob-gap-4) var(--ob-gap-4) 0', padding: 'var(--ob-gap-3)',
          background: 'var(--ob-warn-soft)', color: 'var(--ob-warn)',
          border: '1px solid var(--ob-warn)', borderRadius: 'var(--ob-radius)',
          fontSize: 'var(--ob-fs-sm)',
        }}>
          {sin_precio.length} {sin_precio.length === 1 ? 'material no tiene' : 'materiales no tienen'} precio
          cargado, asi que no suman al total: {sin_precio.join(', ')}. Cargalos en la pestaña Materiales.
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
          <tbody>
            {filas.map((f, i) => (
              <tr key={f.material_id}>
                <td className="ob-table__gutter">{i + 1}</td>
                <td>{f.nombre}<span className="ob-table__sec" style={{ marginLeft: '.5rem', fontSize: 'var(--ob-fs-2xs)' }}>{f.rubro}</span></td>
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
            ))}
            {filas.length === 0 && (
              <tr><td colSpan={10} style={{ color: 'var(--ob-ink-3)', padding: 'var(--ob-gap-4)' }}>
                Sin computo no hay lista. Cargá tareas en la pestaña Cómputo.
              </td></tr>
            )}
          </tbody>
          {filas.length > 0 && (
            <tfoot>
              <tr>
                <td className="ob-table__gutter"></td>
                <td colSpan={8}>Total de materiales con precio cargado</td>
                <td className="ob-num ob-total">{plata(total)}</td>
              </tr>
              {obra.sup_cubierta ? (
                <tr>
                  <td className="ob-table__gutter"></td>
                  <td colSpan={8} className="ob-table__sec">Por m2 cubierto ({num(obra.sup_cubierta, 2)} m2)</td>
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
