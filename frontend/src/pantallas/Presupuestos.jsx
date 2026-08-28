import { useEffect, useState } from 'react'
import { useOutletContext, Link } from 'react-router-dom'
import * as api from '../api'
import Aviso from '../componentes/Aviso'
import { plata, num, fecha } from '../formato'

/**
 * La comparativa: un renglón por rubro y sub-rubro con todas sus
 * cotizaciones.
 *
 * Es la pantalla que contesta si te cotizaron caro, y la contesta de la
 * única forma que sirve: poniendo las cotizaciones del mismo trabajo una
 * al lado de la otra. La dispersión — cuánto separa a la más cara de la
 * más barata — es el número que dice si valió la pena pedir tres
 * presupuestos.
 *
 * Sólo la elegida suma en la obra. Si sumaran todas, tener tres
 * cotizaciones del mismo trabajo mostraría el triple de lo que va a salir.
 */
export default function Presupuestos() {
  const { obra, version, tocado } = useOutletContext()
  const [datos, setDatos] = useState(null)
  const [rubros, setRubros] = useState([])
  const [subrubros, setSubrubros] = useState([])
  const [error, setError] = useState(null)
  const [alta, setAlta] = useState(false)
  const [abierto, setAbierto] = useState({})

  const cargar = async () => {
    try {
      const [c, r, s] = await Promise.all([
        api.get(`/api/obras/${obra.id}/comparativa`),
        api.get(`/api/obras/${obra.id}/rubros`),
        api.get(`/api/obras/${obra.id}/subrubros`),
      ])
      setDatos(c); setRubros(r); setSubrubros(s)
    } catch (e) { setError(e) }
  }
  useEffect(() => { setDatos(null); cargar() }, [obra.id, version])

  const elegir = async (id) => {
    try {
      await api.post(`/api/obras/${obra.id}/presupuestos/${id}/elegir`, {})
      await cargar(); tocado()
    } catch (e) { setError(e) }
  }

  if (error) return <Aviso error={error} alCerrar={() => setError(null)} />
  if (!datos) return <p className="ob-cargando">Cargando…</p>

  const grupos = datos.grupos
  const totalElegido = grupos.reduce((a, g) => a + (g.elegido_monto ?? 0), 0)
  const sinElegir = grupos.filter((g) => !g.elegido_id).length

  return (
    <>
      <div className="ob-toolbar">
        <span className="ob-label">Presupuestos</span>
        <span className="ob-toolbar__meta">
          {grupos.length === 0 ? 'Ninguno cargado todavía'
            : `${grupos.length} rubro/sub-rubro · elegido ${plata(totalElegido)} nominal`}
          <button className="ob-btn ob-btn--primario" onClick={() => setAlta(!alta)}
            style={{ marginLeft: 'var(--ob-gap-3)' }}>
            {alta ? 'Cancelar' : 'Cargar un presupuesto'}
          </button>
        </span>
      </div>

      {alta && (
        <Alta obra={obra} rubros={rubros} subrubros={subrubros}
          alCrear={() => { setAlta(false); cargar(); tocado() }} />
      )}

      {sinElegir > 0 && (
        <p className="ob-nota">
          {sinElegir} grupo(s) tienen cotizaciones pero ninguna elegida: no suman
          a la obra hasta que marques cuál vas a usar.
        </p>
      )}

      {grupos.length === 0 && !alta && (
        <div className="ob-vacio">
          <h2>Todavía no cargaste ningún presupuesto</h2>
          <p>
            Un presupuesto acá es lo que te pasó un proveedor: el monto o la
            lista de artículos, y sobre todo el plan de pago, que es lo que
            convierte «$85.000.000» en lo que realmente vas a terminar pagando.
          </p>
          <p>
            Cargá varias cotizaciones del mismo rubro y sub-rubro y la app te
            muestra cuánto se separan. Después marcás cuál usás, y sólo ésa
            suma.
          </p>
        </div>
      )}

      {grupos.map((g) => {
        const clave = `${g.rubro_id}-${g.subrubro_id}`
        const abierta = abierto[clave]
        return (
          <div className="ob-comp" key={clave}>
            <button className="ob-comp__cabeza"
              /* Actualizador funcional y no {...abierto}: dos grupos
                 abiertos en el mismo tick leen el mismo estado viejo y el
                 segundo pisa al primero. */
              onClick={() => setAbierto((a) => ({ ...a, [clave]: !a[clave] }))}>
              <span className="ob-comp__flecha">{abierta ? '▾' : '▸'}</span>
              <span className="ob-comp__rubro">
                {g.rubro} <span className="ob-comp__sub">· {g.subrubro}</span>
              </span>
              <span className="ob-comp__cifras">
                <span className="ob-comp__dato">
                  <b className="ob-label">Cotizaciones</b>
                  <b className="ob-num">{g.cantidad}</b>
                </span>
                <span className="ob-comp__dato">
                  <b className="ob-label">Más barato</b>
                  <b className="ob-num">{g.mas_barato == null ? '—' : plata(g.mas_barato)}</b>
                </span>
                <span className="ob-comp__dato">
                  <b className="ob-label">Dispersión</b>
                  <b className={`ob-num${g.dispersion ? ' ob-delta--sube' : ''}`}>
                    {g.dispersion == null ? '—' : plata(g.dispersion)}
                  </b>
                </span>
                <span className="ob-comp__dato">
                  <b className="ob-label">Elegido</b>
                  <b className={`ob-num${g.elegido_monto == null ? ' ob-table__sec' : ''}`}>
                    {g.elegido_monto == null ? 'ninguno' : plata(g.elegido_monto)}
                  </b>
                </span>
              </span>
            </button>

            {abierta && (
              <table className="ob-table ob-comp__tabla">
                <thead>
                  <tr>
                    <th></th>
                    <th>Quién lo pasó</th>
                    <th>Base</th>
                    <th>Cómo</th>
                    <th className="ob-num">Monto</th>
                    <th>Estado</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {g.cotizaciones.map((c) => (
                    <tr key={c.id} className={c.elegido ? 'ob-comp__elegida' : undefined}>
                      <td style={{ width: '2rem' }}>{c.elegido ? '★' : ''}</td>
                      <td>
                        <Link to={`/obra/${obra.id}/rubros/${g.rubro_id}/presupuestos/${c.id}`}>
                          {c.nombre}
                        </Link>
                        {c.proveedor && <span className="ob-table__sec"> · {c.proveedor}</span>}
                      </td>
                      <td className="ob-table__sec">{fecha(c.fecha_base)}</td>
                      <td className="ob-table__sec">
                        {c.origen === 'items' ? 'por artículos' : 'monto único'}
                      </td>
                      <td className="ob-num">
                        {plata(c.monto_base)}
                        {g.mas_barato != null && c.estado === 'confirmado'
                          && c.monto_base > g.mas_barato && (
                          <span className="ob-comp__delta ob-delta--sube">
                            +{num((c.monto_base / g.mas_barato - 1) * 100, 1)} %
                          </span>
                        )}
                      </td>
                      <td>
                        <span className={`ob-chip ob-chip--${
                          c.estado === 'confirmado' ? 'ok' : 'mudo'}`}>{c.estado}</span>
                      </td>
                      <td style={{ width: '7rem' }}>
                        {c.estado === 'confirmado' && !c.elegido && (
                          <button className="ob-btn" onClick={() => elegir(c.id)}>
                            Usar ésta
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )
      })}
    </>
  )
}

/**
 * Alta. El presupuesto se crea en borrador con su plan; los renglones y la
 * confirmación se cargan adentro. Antes el alta confirmaba de una, y eso
 * no deja lugar para cargar los artículos: un presupuesto confirmado no
 * se edita.
 */
function Alta({ obra, rubros, subrubros, alCrear }) {
  const hoy = new Date().toISOString().slice(0, 10)
  const [d, setD] = useState({
    rubro_id: '', subrubro_id: subrubros[0]?.id ?? '', nombre: '',
    origen: 'monto', monto_base: '', moneda: 'ARS', fecha_base: hoy,
    anticipo_pct: 20, anticipo_indexa: false,
    cuotas: 1, frecuencia: 'mensual', fecha_inicio: hoy, cuotas_indexan: true,
  })
  const [error, setError] = useState(null)
  const [guardando, setGuardando] = useState(false)
  const set = (k) => (e) => setD({
    ...d, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value,
  })

  const guardar = async (e) => {
    e.preventDefault()
    setGuardando(true)
    try {
      const { id } = await api.post(`/api/obras/${obra.id}/presupuestos`, {
        rubro_id: Number(d.rubro_id),
        subrubro_id: Number(d.subrubro_id),
        nombre: d.nombre,
        origen: d.origen,
        monto_base: d.origen === 'monto'
          ? Number(String(d.monto_base).replace(/\./g, '').replace(',', '.')) : 0,
        moneda: d.moneda,
        fecha_base: d.fecha_base,
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
      alCrear()
    } catch (err) { setError(err); setGuardando(false) }
  }

  return (
    <form onSubmit={guardar} className="ob-card ob-alta">
      <Aviso error={error} alCerrar={() => setError(null)} />

      <div className="ob-alta__grilla">
        <label><span className="ob-label">Rubro</span>
          <select className="ob-input" required value={d.rubro_id} onChange={set('rubro_id')}>
            <option value="">Elegí…</option>
            {rubros.map((r) => <option key={r.id} value={r.id}>{r.nombre}</option>)}
          </select></label>
        <label><span className="ob-label">Sub-rubro</span>
          <select className="ob-input" value={d.subrubro_id} onChange={set('subrubro_id')}>
            {subrubros.map((s) => <option key={s.id} value={s.id}>{s.nombre}</option>)}
          </select></label>
        <label><span className="ob-label">Quién lo pasó</span>
          <input className="ob-input" required value={d.nombre} onChange={set('nombre')}
            placeholder="Cementista - estructura" /></label>
        <label><span className="ob-label">Cómo viene el precio</span>
          <select className="ob-input" value={d.origen} onChange={set('origen')}>
            <option value="monto">Un monto único</option>
            <option value="items">Lista de artículos</option>
          </select></label>
        {d.origen === 'monto' && (
          <label><span className="ob-label">Monto</span>
            <input className="ob-input ob-num" required inputMode="decimal"
              value={d.monto_base} onChange={set('monto_base')} placeholder="85000000" /></label>
        )}
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
        {guardando ? 'Guardando…' : 'Crear el presupuesto'}
      </button>
      <p className="ob-tres__pie" style={{ marginTop: 'var(--ob-gap-2)' }}>
        Queda en borrador. Adentro cargás los artículos si los tiene, y lo
        confirmás: ahí se generan las cuotas con fecha y empieza a contar.
      </p>
    </form>
  )
}
