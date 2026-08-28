import { useEffect, useState } from 'react'
import { useParams, useNavigate, useOutletContext, Link } from 'react-router-dom'
import * as api from '../api'
import Aviso from '../componentes/Aviso'
import { plata, num, fecha } from '../formato'

/**
 * Un rubro abierto: los tres números arriba y los presupuestos abajo.
 *
 * Es la pantalla donde la app deja de ser una calculadora. El teórico sale
 * del cómputo, el presupuestado de acá, y el pagado va a salir de E3.
 */
export default function RubroDetalle() {
  const { obra } = useOutletContext()
  const { rubroId } = useParams()
  const [rubro, setRubro] = useState(null)
  const [presupuestos, setPresupuestos] = useState(null)
  const [resumen, setResumen] = useState(null)
  const [teorico, setTeorico] = useState(null)
  const [error, setError] = useState(null)
  const [alta, setAlta] = useState(false)

  const cargar = async () => {
    try {
      const [rubros, pres, res, lista] = await Promise.all([
        api.get(`/api/obras/${obra.id}/rubros`),
        api.get(`/api/obras/${obra.id}/presupuestos?rubro_id=${rubroId}`),
        api.get(`/api/obras/${obra.id}/rubros-resumen`),
        api.get(`/api/obras/${obra.id}/lista-materiales`),
      ])
      setRubro(rubros.find((r) => String(r.id) === String(rubroId)) || null)
      setPresupuestos(pres)
      setResumen(res.rubros.find((r) => String(r.rubro_id) === String(rubroId)) || null)
      const nombre = rubros.find((r) => String(r.id) === String(rubroId))?.nombre
      setTeorico(lista.rubros.find((r) => r.rubro === nombre) || null)
    } catch (e) { setError(e) }
  }

  useEffect(() => { cargar() }, [obra.id, rubroId])

  if (error) return <Aviso error={error} alCerrar={() => setError(null)} />
  if (!rubro) return <p className="ob-cargando">Cargando…</p>

  const presupuestado = resumen ? resumen.proyectado : null

  return (
    <>
      <div className="ob-toolbar">
        <Link className="ob-btn" to={`/obra/${obra.id}/rubros`}>← Rubros</Link>
        <span className="ob-label" style={{ marginLeft: 'var(--ob-gap-3)' }}>{rubro.nombre}</span>
      </div>

      <div className="ob-tres">
        <Numero rotulo="Teórico" valor={teorico?.hay ? plata(teorico.total) : null}
          pie={!teorico?.hay
            ? 'Nada de este rubro tiene precio ni costo de mano de obra cargado.'
            : `Materiales ${plata(teorico.materiales)} + mano de obra ${plata(teorico.mano_obra)}.`
              + (teorico.completo ? '' :
                ` Faltan ${teorico.falta_precio + teorico.falta_costo_mo} datos: el número es de menos.`)} />
        <Numero rotulo="Presupuestado" valor={presupuestado == null ? null : plata(presupuestado)}
          pie={presupuestado == null
            ? 'Todavía no hay ningún presupuesto confirmado en este rubro.'
            : `Proyectado sobre ${resumen.cuotas} cuotas. Nominal ${plata(resumen.nominal)}.`} />
        <Numero rotulo="Pagado" valor={resumen?.pagado == null ? null : plata(resumen.pagado)}
          pie={resumen?.pagado == null
            ? 'Todavía no se registró ningún pago en este rubro.'
            : `Falta pagar ${plata(resumen.saldo)} · ${resumen.pagos} pago(s).`} />
      </div>

      {teorico?.hay && presupuestado != null && (
        <p className="ob-nota">
          Te cotizaron{' '}
          <b className={`ob-delta--${presupuestado > teorico.total ? 'sube' : 'baja'}`}>
            {presupuestado > teorico.total ? 'más caro' : 'más barato'} que el cómputo
            por {plata(Math.abs(presupuestado - teorico.total))}
            {' '}({num((presupuestado / teorico.total - 1) * 100, 1)} %)
          </b>.
        </p>
      )}

      <div className="ob-toolbar" style={{ borderTop: 'var(--ob-border)', marginTop: 'var(--ob-gap-4)' }}>
        <span className="ob-label">Presupuestos</span>
        <span className="ob-toolbar__meta">
          <button className="ob-btn ob-btn--primario" onClick={() => setAlta(!alta)}>
            {alta ? 'Cancelar' : 'Cargar un presupuesto'}
          </button>
        </span>
      </div>

      {alta && <Alta obra={obra} rubroId={rubroId}
        alCrear={() => { setAlta(false); cargar() }} />}

      {presupuestos?.length === 0 && !alta && (
        <p className="ob-nota" style={{ padding: 'var(--ob-gap-4)' }}>
          Ninguno todavía. Un presupuesto acá es lo que permite contestar si te
          cotizaron caro y cuánto falta pagar.
        </p>
      )}

      {presupuestos?.length > 0 && (
        <div className="ob-tablewrap">
          <table className="ob-table">
            <thead>
              <tr>
                <th>Presupuesto</th>
                <th>Proveedor</th>
                <th>Base</th>
                <th className="ob-num">Monto</th>
                <th className="ob-num">Cuotas</th>
                <th>Estado</th>
              </tr>
            </thead>
            <tbody>
              {presupuestos.map((p) => (
                <tr key={p.id}>
                  <td>
                    <Link to={`/obra/${obra.id}/rubros/${rubroId}/presupuestos/${p.id}`}>
                      {p.nombre}
                    </Link>
                  </td>
                  <td className="ob-table__sec">{p.proveedor || '—'}</td>
                  <td className="ob-table__sec">{fecha(p.fecha_base)}</td>
                  <td className="ob-num">{plata(p.monto_base)}</td>
                  <td className="ob-num">{p.cuotas || '—'}</td>
                  <td>
                    <span className={`ob-chip ob-chip--${
                      p.estado === 'confirmado' ? 'ok' : p.estado === 'anulado' ? 'bad' : 'mudo'}`}>
                      {p.estado}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  )
}

function Numero({ rotulo, valor, pie }) {
  return (
    <div className="ob-card ob-tres__uno">
      <span className="ob-label">{rotulo}</span>
      <div className={`ob-tres__valor ob-num${valor ? '' : ' ob-tres__valor--falta'}`}>
        {valor ?? '—'}
      </div>
      <p className="ob-tres__pie">{pie}</p>
    </div>
  )
}

/** El alta: el presupuesto y su plan en un solo paso, como se habla. */
function Alta({ obra, rubroId, alCrear }) {
  const hoy = new Date().toISOString().slice(0, 10)
  const [d, setD] = useState({
    nombre: '', tipo: 'materiales', monto_base: '', moneda: 'ARS',
    fecha_base: hoy, notas: '',
    anticipo_pct: 20, anticipo_indexa: false,
    cuotas: 14, frecuencia: 'semanal', fecha_inicio: hoy, cuotas_indexan: true,
  })
  const [error, setError] = useState(null)
  const [guardando, setGuardando] = useState(false)

  const guardar = async (e) => {
    e.preventDefault()
    setGuardando(true)
    try {
      const { id } = await api.post(`/api/obras/${obra.id}/presupuestos`, {
        rubro_id: Number(rubroId),
        tipo: d.tipo,
        nombre: d.nombre,
        monto_base: Number(String(d.monto_base).replace(/\./g, '').replace(',', '.')),
        moneda: d.moneda,
        fecha_base: d.fecha_base,
        notas: d.notas || null,
      })
      await api.put(`/api/obras/${obra.id}/presupuestos/${id}/plan`, {
        anticipo_pct: Number(d.anticipo_pct),
        anticipo_fecha: d.fecha_base,
        anticipo_indexa: d.anticipo_indexa,
        cuotas: Number(d.cuotas),
        frecuencia: d.frecuencia,
        fecha_inicio: d.fecha_inicio,
        cuotas_indexan: d.cuotas_indexan,
      })
      await api.post(`/api/obras/${obra.id}/presupuestos/${id}/confirmar`, {})
      alCrear()
    } catch (err) { setError(err); setGuardando(false) }
  }

  const set = (k) => (e) => setD({
    ...d, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value,
  })

  return (
    <form onSubmit={guardar} className="ob-card ob-alta">
      <Aviso error={error} alCerrar={() => setError(null)} />

      <div className="ob-alta__grilla">
        <label><span className="ob-label">Quién lo pasó</span>
          <input className="ob-input" required value={d.nombre} onChange={set('nombre')}
            placeholder="Cementista - estructura" /></label>
        <label><span className="ob-label">Tipo</span>
          <select className="ob-input" value={d.tipo} onChange={set('tipo')}>
            <option value="materiales">Materiales</option>
            <option value="mano_obra">Mano de obra</option>
          </select></label>
        <label><span className="ob-label">Monto</span>
          <input className="ob-input ob-num" required inputMode="decimal"
            value={d.monto_base} onChange={set('monto_base')} placeholder="85000000" /></label>
        <label><span className="ob-label">Moneda</span>
          <select className="ob-input" value={d.moneda} onChange={set('moneda')}>
            <option value="ARS">Pesos</option>
            <option value="USD">Dólar oficial</option>
          </select></label>
        <label><span className="ob-label">Fecha del precio</span>
          <input className="ob-input" type="date" required value={d.fecha_base}
            onChange={set('fecha_base')} /></label>
      </div>

      <p className="ob-alta__titulo">
        El plan de pago — es lo que convierte el monto en el número real
      </p>

      <div className="ob-alta__grilla">
        <label><span className="ob-label">Anticipo (%)</span>
          <input className="ob-input ob-num" inputMode="decimal" value={d.anticipo_pct}
            onChange={set('anticipo_pct')} /></label>
        <label className="ob-alta__check">
          <input type="checkbox" checked={d.anticipo_indexa} onChange={set('anticipo_indexa')} />
          <span>El anticipo indexa</span></label>
        <label><span className="ob-label">Cantidad de cuotas</span>
          <input className="ob-input ob-num" inputMode="numeric" value={d.cuotas}
            onChange={set('cuotas')} /></label>
        <label><span className="ob-label">Frecuencia</span>
          <select className="ob-input" value={d.frecuencia} onChange={set('frecuencia')}>
            <option value="semanal">Semanal</option>
            <option value="quincenal">Quincenal</option>
            <option value="mensual">Mensual</option>
          </select></label>
        <label><span className="ob-label">Primera cuota</span>
          <input className="ob-input" type="date" required value={d.fecha_inicio}
            onChange={set('fecha_inicio')} /></label>
        <label className="ob-alta__check">
          <input type="checkbox" checked={d.cuotas_indexan} onChange={set('cuotas_indexan')} />
          <span>Las cuotas indexan por IPC</span></label>
      </div>

      <button className="ob-btn ob-btn--primario" type="submit" disabled={guardando}>
        {guardando ? 'Guardando…' : 'Cargar y confirmar'}
      </button>
      <p className="ob-tres__pie" style={{ marginTop: 'var(--ob-gap-2)' }}>
        Confirmar genera las cuotas con fecha. El presupuesto se puede anular
        después, pero no editar: un plan confirmado que cambia de monto deja de
        sumar el total.
      </p>
    </form>
  )
}
