import { useEffect, useState } from 'react'
import { useParams, useNavigate, useOutletContext } from 'react-router-dom'
import * as api from '../api'
import Aviso from '../componentes/Aviso'
import { plata, num, fecha } from '../formato'

/**
 * Un presupuesto con su plan de pago abierto cuota por cuota.
 *
 * Las tres columnas son el argumento entero: nominal es lo que dice el
 * papel, proyectado es lo que va a salir, real es lo que ya se puede
 * afirmar. La diferencia de abajo es el número que no está escrito en
 * ningún lado y que la app existe para mostrar.
 */
export default function Presupuesto() {
  const { obra } = useOutletContext()
  const { rubroId, presupuestoId } = useParams()
  const navegar = useNavigate()
  const [d, setD] = useState(null)
  const [error, setError] = useState(null)

  const cargar = () => {
    setD(null)
    api.get(`/api/obras/${obra.id}/presupuestos/${presupuestoId}`)
      .then(setD).catch(setError)
  }
  useEffect(cargar, [obra.id, presupuestoId])

  const confirmar = async () => {
    try {
      await api.post(`/api/obras/${obra.id}/presupuestos/${presupuestoId}/confirmar`, {})
      cargar()
    } catch (e) { setError(e) }
  }

  const anular = async () => {
    const motivo = window.prompt('¿Por qué se anula? Queda escrito.')
    if (!motivo) return
    try {
      await api.post(`/api/obras/${obra.id}/presupuestos/${presupuestoId}/anular`, { motivo })
      navegar(`/obra/${obra.id}/rubros/${rubroId}`)
    } catch (e) { setError(e) }
  }

  if (error) return <Aviso error={error} alCerrar={() => setError(null)} />
  if (!d) return <p className="ob-cargando">Cargando…</p>

  const p = d.presupuesto
  const t = d.total
  const borrador = p.estado === 'borrador'

  return (
    <>
      <div className="ob-toolbar">
        <button className="ob-btn" onClick={() => navegar(`/obra/${obra.id}/rubros/${rubroId}`)}>
          ← Volver al rubro
        </button>
        <span className="ob-label" style={{ marginLeft: 'var(--ob-gap-3)' }}>{p.nombre}</span>
        <span className={`ob-chip ob-chip--${borrador ? 'mudo' : 'ok'}`}
          style={{ marginLeft: 'var(--ob-gap-2)' }}>{p.estado}</span>
        <span className="ob-toolbar__meta">
          Base {fecha(p.fecha_base)} · {p.moneda} · {p.tipo === 'mano_obra' ? 'mano de obra' : 'materiales'}
        </span>
      </div>

      {borrador && (
        <div className="ob-nota" style={{ padding: 'var(--ob-gap-4)' }}>
          Todavía es un borrador: no tiene cuotas. Confirmalo para que el plan
          se convierta en obligaciones con fecha.
          <button className="ob-btn ob-btn--primario" onClick={confirmar}
            style={{ marginLeft: 'var(--ob-gap-3)' }}>Confirmar el presupuesto</button>
        </div>
      )}

      {!borrador && (
        <div className="ob-tres">
          <Numero rotulo="Nominal" valor={plata(t.nominal)}
            pie="Lo que dice el papel del proveedor." />
          <Numero rotulo="Proyectado" valor={plata(t.proyectado)}
            resalta={t.diferencia > 0}
            pie={t.cuotas_proyectadas > 0
              ? `${t.cuotas_proyectadas} de ${t.cuotas} cuotas estimadas con IPC de ${num(d.proyeccion.variacion_mensual_usada, 1)} % mensual, la última variación publicada (${fecha(d.proyeccion.ultimo_mes_publicado)}).`
              : 'Todas las cuotas tienen coeficiente publicado: no hay estimación.'} />
          <Numero rotulo="Pagable hoy" valor={plata(t.real)}
            pie="Solo las cuotas cuyo índice ya salió. Las demás no se suman: su coeficiente todavía no existe." />
        </div>
      )}

      {!borrador && (
        <div className="ob-tablewrap">
          <table className="ob-table">
            <thead>
              <tr>
                <th className="ob-table__gutter">#</th>
                <th>Concepto</th>
                <th>Fecha</th>
                <th className="ob-num">Nominal</th>
                <th className="ob-num">Coeficiente</th>
                <th className="ob-num">Proyectado</th>
                <th className="ob-num">Real</th>
              </tr>
            </thead>
            <tbody>
              {d.cuotas.map((c) => (
                <tr key={c.id}>
                  <td className="ob-table__gutter">{c.orden}</td>
                  <td>
                    {c.descripcion}
                    {!c.indexa && <span className="ob-chip ob-chip--mudo"
                      style={{ marginLeft: '.4rem' }}>no indexa</span>}
                    {c.estado_coef === 'proyectado' && <span className="ob-chip ob-chip--warn"
                      style={{ marginLeft: '.4rem' }}>provisoria</span>}
                    {c.estado_coef === 'sin_datos' && <span className="ob-chip ob-chip--bad"
                      style={{ marginLeft: '.4rem' }}>sin índice</span>}
                  </td>
                  <td className="ob-table__sec">{fecha(c.fecha_prevista)}</td>
                  <td className="ob-num">{plata(c.monto_nominal)}</td>
                  <td className="ob-num ob-table__sec">
                    {c.coeficiente == null ? '—' : num(c.coeficiente, 6)}
                  </td>
                  <td className="ob-num">{plata(c.monto_proyectado)}</td>
                  <td className={`ob-num${c.monto_real == null ? ' ob-table__sec' : ''}`}>
                    {c.monto_real == null ? '—' : plata(c.monto_real)}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td className="ob-table__gutter" />
                <td className="ob-table__strong">Total</td>
                <td />
                <td className="ob-num ob-total">{plata(t.nominal)}</td>
                <td />
                <td className="ob-num ob-total">{plata(t.proyectado)}</td>
                <td className="ob-num">{plata(t.real)}</td>
              </tr>
              <tr>
                <td className="ob-table__gutter" />
                <td colSpan={4} className="ob-table__sec">
                  Diferencia contra el nominal — esto es lo que no está en el papel
                </td>
                <td className={`ob-num ob-delta--${t.diferencia > 0 ? 'sube' : 'baja'}`}
                  style={{ fontWeight: 'var(--ob-fw-semi)' }}>
                  {t.diferencia > 0 ? '+' : ''}{plata(t.diferencia)}
                </td>
                <td className={`ob-num ob-delta--${t.diferencia > 0 ? 'sube' : 'baja'}`}>
                  {t.diferencia_pct == null ? '—' : `${num(t.diferencia_pct, 2)} %`}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      <div style={{ padding: 'var(--ob-gap-4)' }}>
        <button className="ob-btn" onClick={anular}>Anular este presupuesto</button>
        <span className="ob-nota" style={{ marginLeft: 'var(--ob-gap-3)', padding: 0 }}>
          No se borra: queda con el motivo, porque con quién negociaste es historia.
        </span>
      </div>
    </>
  )
}

function Numero({ rotulo, valor, pie, resalta }) {
  return (
    <div className="ob-card ob-tres__uno">
      <span className="ob-label">{rotulo}</span>
      <div className={`ob-tres__valor ob-num${resalta ? ' ob-delta--sube' : ''}`}>{valor}</div>
      <p className="ob-tres__pie">{pie}</p>
    </div>
  )
}
