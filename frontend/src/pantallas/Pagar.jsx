import SelectorCategoria from '../componentes/SelectorCategoria'
import { useEffect, useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import * as api from '../api'
import Aviso from '../componentes/Aviso'
import Modal from '../componentes/Modal'
import { subir } from '../subir'
import { plata, num, fecha } from '../formato'
import Adjuntos from '../componentes/Adjuntos'
import CalendarioSemanalPagos from '../componentes/CalendarioSemanalPagos'

/**
 * Registrar Pago: lo que se pagó, y el botón para cargar uno nuevo.
 *
 * El criterio sigue siendo quince segundos parado en la obra. El modal lo
 * respeta porque las tres listas se encadenan y se saltean solas:
 *
 *  - Elegir el rubro filtra los tipos que ese rubro tiene cargados.
 *  - Si sólo hay uno, queda puesto y no hay nada que elegir.
 *  - Si esa combinación tiene un solo presupuesto en uso, queda puesto.
 *
 * Con un presupuesto por rubro — que es lo normal — son dos toques y el
 * monto. Los desplegables aparecen cuando de verdad hay algo que decidir.
 */
export default function Pagar() {
  const { obra, version, tocado } = useOutletContext()
  const [destinos, setDestinos] = useState(null)
  const [pagos, setPagos] = useState([])
  const [documentos, setDocumentos] = useState({})
  const [error, setError] = useState(null)
  const [abierto, setAbierto] = useState(false)
  const [editando, setEditando] = useState(null)
  const [abiertoPago, setAbiertoPago] = useState(null)
  const [hecho, setHecho] = useState(null)

  const cargar = async () => {
    try {
      const [d, g, docs] = await Promise.all([
        api.get(`/api/obras/${obra.id}/pagar-destinos`),
        api.get(`/api/obras/${obra.id}/pagos`),
        api.get(`/api/obras/${obra.id}/documentos`),
      ])
      setDestinos(d); setPagos(g)
      const porPago = {}
      for (const x of docs) if (x.pago_id) (porPago[x.pago_id] ??= []).push(x)
      setDocumentos(porPago)
    } catch (e) { setError(e) }
  }
  useEffect(() => { cargar() }, [obra.id, version])

  const anular = async (p) => {
    const motivo = window.prompt('¿Por qué se anula? Queda escrito.')
    if (!motivo) return
    try {
      await api.post(`/api/obras/${obra.id}/pagos/${p.id}/anular`, { motivo })
      await cargar(); tocado()
    } catch (e) { setError(e) }
  }

  if (error) return <Aviso error={error} alCerrar={() => setError(null)} />
  if (!destinos) return <p className="ob-cargando">Cargando…</p>

  const vivos = pagos.filter((p) => !p.anulado)
  const saldoDe = (p) => p.presupuesto_id ? destinos.presupuestos.find((x) => x.id === p.presupuesto_id) : null
  const totalArs = vivos.filter((p) => p.moneda === 'ARS')
    .reduce((a, p) => a + p.monto, 0)
  const totalUsd = vivos.filter((p) => p.moneda === 'USD')
    .reduce((a, p) => a + p.monto, 0)

  return (
    <>
      <CalendarioSemanalPagos key={obra.id} obraId={obra.id} destinos={destinos} pagos={pagos} />
      <div className="ob-toolbar">
        <span className="ob-label">Registrar Pago</span>
        <span className="ob-toolbar__meta">
          {vivos.length === 0 ? 'Ningún pago registrado todavía' : (
            <>
              {vivos.length} pago(s) · {plata(totalArs)}
              {totalUsd > 0 && ` · u$d ${num(totalUsd, 2)}`}
            </>
          )}
          <button className="ob-btn ob-btn--primario" onClick={() => setAbierto(true)}
            style={{ marginLeft: 'var(--ob-gap-3)' }}>
            Registrar un pago
          </button>
        </span>
      </div>

      {hecho && (
        <div className="ob-pagar__hecho" style={{ margin: 'var(--ob-gap-4)' }}>
          <div className="ob-pagar__hecho-titulo">
            Pagado {hecho.moneda === 'USD' ? `u$d ${num(hecho.monto, 2)}` : plata(hecho.monto)}
            {' — '}{hecho.destino}
          </div>
          {hecho.saldo ? (
            <div className="ob-pagar__hecho-saldo">
              Queda <b className="ob-num">{plata(hecho.saldo.saldo)}</b> de este
              presupuesto · llevás pagado el{' '}
              <b className="ob-num">{num(hecho.saldo.avance_pct, 1)} %</b>
            </div>
          ) : (
            <div className="ob-pagar__hecho-saldo">Pago suelto, sin presupuesto asociado.</div>
          )}
          {hecho.aviso && (
            <div className="ob-pagar__hecho-saldo" style={{ color: 'var(--ob-warn)' }}>
              {hecho.aviso} Podés adjuntarlo desde la lista.
            </div>
          )}
          <button className="ob-btn" onClick={() => setHecho(null)}>Entendido</button>
        </div>
      )}

      {editando && <Modal titulo="Editar pago" bajada="Corregí los datos del pago. Los comprobantes y su asignación se conservan; los avances de obra mantienen su fecha." alCerrar={() => setEditando(null)}><EditarPago pago={editando} obraId={obra.id} alGuardar={() => { setEditando(null); setHecho(null); cargar(); tocado() }} /></Modal>}
      {abierto && (
        <Modal titulo="Registrar un pago"
          bajada="Lo que acabás de pagar. La fecha viene en hoy y se puede diferir."
          alCerrar={() => setAbierto(false)}>
          <Formulario obra={obra} destinos={destinos}
            alGuardar={(r) => {
              setAbierto(false); setHecho(r); cargar(); tocado()
            }} />
        </Modal>
      )}

      {pagos.length === 0 ? (
        <div className="ob-vacio">
          <h2>Todavía no registraste ningún pago</h2>
          <p>
            Cada pago que hacés va acá, y lo que suma es lo que llena la tercera
            columna de la obra: cuánto salió de verdad de la cuenta, contra lo
            que te habían cotizado.
          </p>
          <p>
            Se carga parado en la obra, con el teléfono en una mano, en menos de
            quince segundos.
          </p>
        </div>
      ) : (
        <div className="ob-tablewrap">
          <table className="ob-table">
            <thead>
              <tr>
                <th>Fecha</th>
                <th>Rubro</th>
                <th>Tipo</th>
                <th>Presupuesto</th>
                <th>Medio</th>
                <th className="ob-num">Monto</th>
                <th className="ob-num">Saldo pendiente</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {pagos.map((p) => <>
                <tr key={p.id} className={p.anulado ? 'ob-pago--anulado' : undefined} onClick={() => setAbiertoPago(abiertoPago === p.id ? null : p.id)}>
                  <td>{fecha(p.fecha)}</td>
                  <td>{p.rubro}</td>
                  <td className="ob-table__sec">{p.subrubro || '—'}</td>
                  <td className="ob-table__sec">
                    {p.presupuesto || 'suelto'}
                    {p.anulado && <span className="ob-chip ob-chip--bad"
                      style={{ marginLeft: '.4rem' }}>anulado</span>}
                  </td>
                  <td className="ob-table__sec">{p.medio}</td>
                  <td className="ob-num">
                    {p.moneda === 'USD' ? `u$d ${num(p.monto, 2)}` : plata(p.monto)}
                  </td>
                  <td className="ob-num">{saldoDe(p) ? plata(saldoDe(p).saldo) : '—'}</td>
                  <td style={{ width: '5rem' }}><button className="ob-btn" onClick={(e) => { e.stopPropagation(); setAbiertoPago(abiertoPago === p.id ? null : p.id) }}>{abiertoPago === p.id ? 'Cerrar' : 'Detalle'}</button></td>
                </tr>
                {abiertoPago === p.id && <tr key={`${p.id}-detalle`}><td colSpan={9}><div className="ob-pago-detalle">
                  <b>{p.presupuesto || 'Pago suelto'}</b> · {p.rubro} / {p.subrubro || 'Sin tipo'}<br />
                  {saldoDe(p) && <><br /><span>Saldo pendiente actual: <b>{plata(saldoDe(p).saldo)}</b> · pagado: {plata(saldoDe(p).pagado)} · proyectado: {plata(saldoDe(p).proyectado)}</span></>}
                  {p.cuota_id && <><br />Cuota asignada: {p.cuota_id}</>}
                  {p.notas && <><br />Notas: {p.notas}</>}
                  {p.anulado && <><br />Motivo de anulación: {p.anulado_motivo}</>}
                  {!p.anulado && <div className="ob-pago-detalle__acciones"><button className="ob-btn" onClick={(e) => { e.stopPropagation(); setEditando(p) }}>Editar</button><button className="ob-btn" onClick={(e) => { e.stopPropagation(); anular(p) }}>Anular</button><Adjuntos obra={obra} colgar={{ pago_id: p.id }} tipo="factura" titulo="Comprobantes" provistos={documentos[p.id] ?? []} alCambiar={cargar} /></div>}
                </div></td></tr>}
              </>
              )}
            </tbody>
          </table>
        </div>
      )}
    </>
  )
}

function Formulario({ obra, destinos, alGuardar }) {
  const hoy = new Date().toISOString().slice(0, 10)
  const [rubroId, setRubroId] = useState('')
  const [subrubroId, setSubrubroId] = useState('')
  const [presupuestoId, setPresupuestoId] = useState('')
  const [monto, setMonto] = useState('')
  const [moneda, setMoneda] = useState('ARS')
  const [f, setF] = useState(hoy)
  const [medio, setMedio] = useState('transferencia')
  const [notas, setNotas] = useState('')
  // El comprobante se elige antes de guardar pero se sube despues: hasta
  // que el pago no existe no hay pago_id del que colgarlo.
  const [comprobantes, setComprobantes] = useState([])
  const [proyecto, setProyecto] = useState(null)
  const [vinculos, setVinculos] = useState([])
  const [avances, setAvances] = useState({})
  const [cuotas, setCuotas] = useState([])
  const [cuotaId, setCuotaId] = useState('')
  useEffect(() => {
    let vivo = true
    setError(null); setAvances({}); setCuotaId(''); setCuotas([]); setProyecto(null); setVinculos([])
    if (presupuestoId) Promise.all([
      api.get(`/api/obras/${obra.id}/proyecto`),
      api.get(`/api/obras/${obra.id}/proyecto/presupuestos`),
      api.get(`/api/obras/${obra.id}/presupuestos/${presupuestoId}`)
    ]).then(([pr, vs, detalle]) => { if (vivo) { setProyecto(pr); setVinculos(vs.presupuestos.find((p) => p.id === presupuestoId)?.tarea_ids || []); setCuotas(detalle.cuotas.filter((c) => c.estado !== 'anulada')) } }).catch((e) => { if (vivo) setError(e) })
    return () => { vivo = false }
  }, [presupuestoId, obra.id])
  const [error, setError] = useState(null)
  const [guardando, setGuardando] = useState(false)
  const [paso, setPaso] = useState('')

  // Los rubros que se ofrecen primero son los que tienen un presupuesto en
  // uso: es donde va a caer casi todo pago. Los trece siempre disponibles
  // convierten el desplegable en una lista para buscar.
  const conPresupuesto = [...new Map(
    destinos.presupuestos.map((p) => [p.rubro_id, { id: p.rubro_id, nombre: p.rubro }])
  ).values()]
  const rubros = destinos.rubros

  const subrubrosDelRubro = destinos.presupuestos
    .filter((p) => String(p.rubro_id) === String(rubroId))
    .map((p) => ({ id: p.subrubro_id, nombre: p.subrubro }))
  const subrubros = subrubrosDelRubro.length
    ? [...new Map(subrubrosDelRubro.map((s) => [s.id, s])).values()]
    : destinos.subrubros

  const candidatos = destinos.presupuestos.filter((p) =>
    String(p.rubro_id) === String(rubroId)
    && (!subrubroId || String(p.subrubro_id) === String(subrubroId)))

  // Cascada: elegir el rubro deja puesto el tipo y el presupuesto
  // cuando no hay nada que decidir. Es lo que sostiene los quince segundos.
  const elegirRubro = (id) => {
    setRubroId(id)
    const suyos = destinos.presupuestos.filter((p) => String(p.rubro_id) === String(id))
    const unicos = [...new Set(suyos.map((p) => p.subrubro_id))]
    const sub = unicos.length === 1 ? String(unicos[0]) : ''
    setSubrubroId(sub)
    const posibles = sub ? suyos.filter((p) => String(p.subrubro_id) === sub) : suyos
    setPresupuestoId(posibles.length === 1 ? posibles[0].id : '')
  }

  const elegirSubrubro = (id) => {
    setSubrubroId(id)
    const posibles = destinos.presupuestos.filter((p) =>
      String(p.rubro_id) === String(rubroId) && String(p.subrubro_id) === String(id))
    setPresupuestoId(posibles.length === 1 ? posibles[0].id : '')
  }

  const elegido = destinos.presupuestos.find((p) => p.id === presupuestoId)

  const guardar = async (e) => {
    e.preventDefault()
    if (!rubroId || !monto) return
    setGuardando(true)
    try {
      const importe = Number(String(monto).replace(/\./g, '').replace(',', '.'))
      setPaso('Guardando el pago…')
      const r = await api.post(`/api/obras/${obra.id}/pagos`, {
        rubro_id: Number(rubroId),
        subrubro_id: subrubroId ? Number(subrubroId) : null,
        presupuesto_id: presupuestoId || null,
        cuota_id: cuotaId || null,
        proyecto_version: proyecto?.version ?? null,
        avances: Object.entries(avances).filter(([, v]) => v !== '').map(([tarea_id, v]) => ({ tarea_id, avance_pct: Number(v) })),
        fecha: f,
        monto: importe,
        moneda,
        medio,
        notas: notas || null,
      })

      // El pago ya esta guardado. Si la foto falla ahora -- se corto la
      // señal, se acabaron los datos -- el pago NO se pierde: se avisa y
      // el comprobante se adjunta despues desde la lista.
      const fallidos = []
      for (const comprobante of comprobantes) {
        setPaso('Subiendo ' + comprobante.name + '…')
        try { await subir(obra.id, comprobante, { tipo: 'factura', pago_id: r.id }) }
        catch { fallidos.push(comprobante.name) }
      }
      const aviso = [r.aviso, fallidos.length ? 'No se subieron: ' + fallidos.join(', ') : null].filter(Boolean).join(' ')

      alGuardar({
        monto: importe, moneda, saldo: r.saldo, aviso,
        destino: elegido?.nombre
          ?? rubros.find((x) => String(x.id) === String(rubroId))?.nombre,
      })
    } catch (err) { setError(err); setGuardando(false) }
  }

  return (
    <form onSubmit={guardar}>
      <Aviso error={error} alCerrar={() => setError(null)} />

      <label className="ob-campo"><span className="ob-label">Rubro</span>
        <SelectorCategoria tipo="rubros" className="ob-input" required value={rubroId}
          onChange={(e) => elegirRubro(e.target.value)}>
          <option value="">Elegí…</option>
          {rubros.map((r) => <option key={r.id} value={r.id}>{r.nombre}</option>)}
        </SelectorCategoria>
      </label>

      <label className="ob-campo"><span className="ob-label">Tipo</span>
        <SelectorCategoria tipo="subrubros" className="ob-input" value={subrubroId}
          onChange={(e) => elegirSubrubro(e.target.value)}>
          <option value="">Sin especificar</option>
          {subrubros.map((s) => <option key={s.id} value={s.id}>{s.nombre}</option>)}
        </SelectorCategoria>
      </label>

      <label className="ob-campo"><span className="ob-label">Presupuesto</span>
        <select className="ob-input" value={presupuestoId}
          onChange={(e) => setPresupuestoId(e.target.value)}>
          <option value="">Pago suelto — sin presupuesto</option>
          {candidatos.map((p) => (
            <option key={p.id} value={p.id}>
              {p.nombre} · queda {plata(p.saldo)}
            </option>
          ))}
        </select>
        {elegido && (
          <span className="ob-campo__pie">
            Precio original: <b>{plata(elegido.nominal)}</b>.<br />
            Pagado: <b>{plata(elegido.pagado)}</b> · {num(elegido.avance_nominal_pct, 2)} % del precio original.<br />
            Saldo nominal: <b>{plata(elegido.saldo_nominal)}</b>.<br />
            Total estimado con ajuste IPC: {plata(elegido.proyectado)}.<br />
            Saldo proyectado: <b>{plata(elegido.saldo)}</b>. Puede variar con los índices.
          </span>
        )}
        {!elegido && rubroId && candidatos.length === 0 && (
          <span className="ob-campo__pie">
            Este rubro no tiene ningún presupuesto en uso. El pago entra igual,
            como suelto.
          </span>
        )}
      </label>

      {presupuestoId && <label className="ob-campo"><span className="ob-label">Cuota o anticipo</span>
        <select className="ob-input" value={cuotaId} onChange={(e) => setCuotaId(e.target.value)}>
          <option value="">Pago parcial sin cuota específica</option>
          {cuotas.map((c) => <option key={c.id} value={c.id}>{c.descripcion} · {fecha(c.fecha_prevista)}</option>)}
        </select></label>}
      {proyecto && vinculos.length > 0 && <fieldset>
        <legend>Avance físico acumulado (opcional)</legend>
        <p>Dejá vacío para no modificar el avance. El porcentaje pagado se calcula por separado.</p>
        {proyecto.tareas.filter((t) => vinculos.includes(t.id)).map((t) => <label className="ob-campo" key={t.id}>
          <span className="ob-label">{t.nombre} · actual {t.avance_pct ?? 0} %</span>
          <input className="ob-input" type="number" min="0" max="100" step={t.tipo === 'hito' ? '100' : '0.01'}
            value={avances[t.id] ?? ''} onChange={(e) => setAvances({ ...avances, [t.id]: e.target.value })} />
        </label>)}
      </fieldset>}

      <div className="ob-pagar__monto-fila">
        <label className="ob-campo" style={{ flex: 3 }}>
          <span className="ob-label">Monto</span>
          <input className="ob-input ob-num ob-pagar__monto" inputMode="decimal"
            required value={monto} onChange={(e) => setMonto(e.target.value)}
            placeholder="0" />
        </label>
        <label className="ob-campo" style={{ flex: 1 }}>
          <span className="ob-label">Moneda</span>
          <select className="ob-input" value={moneda} onChange={(e) => setMoneda(e.target.value)}>
            <option value="ARS">Pesos</option>
            <option value="USD">Dólar</option>
          </select>
        </label>
      </div>

      <div className="ob-pagar__monto-fila">
        <label className="ob-campo" style={{ flex: 1 }}>
          <span className="ob-label">Fecha</span>
          <input className="ob-input" type="date" value={f}
            onChange={(e) => setF(e.target.value)} />
          <span className="ob-campo__pie">
            {f > hoy ? 'Diferido: todavía no salió de la cuenta.'
              : f < hoy ? 'Pago viejo, cargado hoy.' : 'Hoy.'}
          </span>
        </label>
        <label className="ob-campo" style={{ flex: 1 }}>
          <span className="ob-label">Medio</span>
          <select className="ob-input" value={medio} onChange={(e) => setMedio(e.target.value)}>
            <option value="transferencia">Transferencia</option>
            <option value="efectivo">Efectivo</option>
            <option value="cheque">Cheque</option>
            <option value="otro">Otro</option>
          </select>
        </label>
      </div>

      <label className="ob-campo"><span className="ob-label">Notas</span>
        <input className="ob-input" value={notas} onChange={(e) => setNotas(e.target.value)}
          placeholder="Opcional" />
      </label>

      <div className="ob-campo">
        <span className="ob-label">Comprobante</span>
        <div className="ob-adj__botones">
          <label className="ob-btn ob-btn--archivo">
            Sacar foto
            <input type="file" accept="image/*" capture="environment" hidden
              onChange={(e) => { setComprobantes((xs) => [...xs, ...Array.from(e.target.files || [])]); e.target.value = '' }} />
          </label>
          <label className="ob-btn ob-btn--archivo">
            Adjuntar
            <input type="file" accept="image/*,application/pdf" multiple hidden
              onChange={(e) => { setComprobantes((xs) => [...xs, ...Array.from(e.target.files || [])]); e.target.value = '' }} />
          </label>
          {comprobantes.length > 0 && (
            <button type="button" className="ob-adj__quitar"
              onClick={() => setComprobantes([])} aria-label="Quitar">×</button>
          )}
        </div>
        <span className="ob-campo__pie">
          {comprobantes.length
            ? comprobantes.map((f) => f.name).join(', ')
            : 'Opcional. Un pago sin comprobante es tu palabra contra la del otro tres meses después.'}
        </span>
      </div>

      <button className="ob-btn ob-btn--primario ob-pagar__guardar" type="submit"
        disabled={guardando || !rubroId || !monto}>
        {guardando ? (paso || 'Guardando…') : 'Registrar el pago'}
      </button>
    </form>
  )
}

function EditarPago({ pago, obraId, alGuardar }) {
  const [datos, setDatos] = useState({fecha: pago.fecha.slice(0,10), monto: String(pago.monto), medio: pago.medio, notas: pago.notas || ''})
  const [error, setError] = useState(null)
  const [ocupado, setOcupado] = useState(false)
  const campo = (nombre) => ({value: datos[nombre], onChange: e => setDatos({...datos, [nombre]: e.target.value})})
  return <form onSubmit={async e => {
    e.preventDefault(); setOcupado(true); setError(null)
    try { await api.patch(`/api/obras/${obraId}/pagos/${pago.id}`, {...datos, monto: datos.monto}); alGuardar() }
    catch (err) { setError(err); setOcupado(false) }
  }}>
    <Aviso error={error} alCerrar={() => setError(null)} />
    <label className="ob-campo">Fecha<input className="ob-input" type="date" required {...campo('fecha')} /></label>
    <label className="ob-campo">Monto ({pago.moneda})<input className="ob-input" type="number" min="0.01" step="0.01" required {...campo('monto')} /></label>
    <label className="ob-campo">Medio<select className="ob-input" {...campo('medio')}>{['transferencia','efectivo','cheque','otro'].map(m => <option key={m}>{m}</option>)}</select></label>
    <label className="ob-campo">Notas<input className="ob-input" {...campo('notas')} /></label>
    <button className="ob-btn ob-btn--primario" disabled={ocupado}>{ocupado ? 'Guardando…' : 'Guardar cambios'}</button>
  </form>
}
