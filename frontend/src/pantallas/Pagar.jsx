import { hoyArgentina } from '../fechas'
import SelectorCategoria from '../componentes/SelectorCategoria'
import { Fragment, useEffect, useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import * as api from '../api'
import Aviso from '../componentes/Aviso'
import Modal from '../componentes/Modal'
import { subir } from '../subir'
import { plata, num, fecha } from '../formato'
import Adjuntos from '../componentes/Adjuntos'
import {tiposDocumento} from '../documentos'
import '../styles/datos-obra.css'
import FiltrosPagos from '../componentes/FiltrosPagos'
import {filtrosVacios,filtrarPagos} from '../filtrosPagos'

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
  const [saldos,setSaldos]=useState({})
  const [filtros,setFiltros]=useState(filtrosVacios)
  useEffect(()=>{setFiltros(filtrosVacios())},[obra.id])

  const cargar = async () => {
    try {
      const [d, g, docs] = await Promise.all([
        api.get(`/api/obras/${obra.id}/pagar-destinos`),
        api.get(`/api/obras/${obra.id}/pagos`),
        api.get(`/api/obras/${obra.id}/documentos`),
      ])
      const resumenes=Object.fromEntries(d.presupuestos.map(p=>[p.id,p]))
      const faltantes=[...new Set(g.map(p=>p.presupuesto_id).filter(id=>id && !resumenes[id]))]
      await Promise.all(faltantes.map(async id=>{const detalle=await api.get(`/api/obras/${obra.id}/presupuestos/${id}`);resumenes[id]={...detalle.total,moneda:detalle.presupuesto.moneda}}))
      setDestinos(d); setPagos(g);setSaldos(resumenes)
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

  const eliminar = async (p) => {
    if (!window.confirm(`¿Eliminar definitivamente el pago de ${p.moneda} ${num(p.monto,2)} del ${fecha(p.fecha)}? Se recalcularán los saldos. Los comprobantes quedarán en Documentación y los avances de obra se conservarán.`)) return
    try {
      await api.borrar(`/api/obras/${obra.id}/pagos/${p.id}`)
      setAbiertoPago(null); setHecho(null); await cargar(); tocado()
    } catch (e) { setError(e) }
  }

  if (error) return <Aviso error={error} alCerrar={() => setError(null)} />
  if (!destinos) return <p className="ob-cargando">Cargando…</p>

  const visibles = filtrarPagos(pagos,documentos,filtros)
  const vivos = visibles.filter((p) => !p.anulado)
  const saldoDe = (p) => p.presupuesto_id ? saldos[p.presupuesto_id] : null
  const importeSaldo = (p, campo='saldo') => saldoDe(p)?.[campo] == null ? 'Sin cotización' : `${saldoDe(p).moneda} ${num(saldoDe(p)[campo],2)}`
  const totalArs = vivos.filter((p) => p.moneda === 'ARS')
    .reduce((a, p) => a + p.monto, 0)
  const totalUsd = vivos.filter((p) => p.moneda === 'USD')
    .reduce((a, p) => a + p.monto, 0)
  const detalle=pagos.find(p=>p.id===abiertoPago)

  return (
    <>
      <div className="ob-toolbar">
        <h2 style={{margin:0}}>Registro de Pagos</h2>
        <span className="ob-toolbar__meta">
          {vivos.length === 0 ? 'Sin pagos vigentes en esta selección' : (
            <>
              {vivos.length} pago(s) visibles · {plata(totalArs)}
              {totalUsd > 0 && ` · u$d ${num(totalUsd, 2)}`}
            </>
          )}
          <button className="ob-btn ob-btn--primario" onClick={() => setAbierto(true)}
            style={{ marginLeft: 'var(--ob-gap-3)' }}>
            Registrar un pago
          </button>
        </span>
      </div>

      <FiltrosPagos pagos={pagos} documentos={documentos} presupuestos={saldos} valor={filtros} onChange={setFiltros} cantidad={visibles.length}/>

      {hecho && (
        <div className="ob-pagar__hecho" style={{ margin: 'var(--ob-gap-4)' }}>
          <div className="ob-pagar__hecho-titulo">
            Pagado {hecho.moneda === 'USD' ? `u$d ${num(hecho.monto, 2)}` : plata(hecho.monto)}
            {' — '}{hecho.destino}
          </div>
          {hecho.saldo ? (
            <div className="ob-pagar__hecho-saldo">
              Queda <b className="ob-num">{hecho.saldo.saldo == null ? 'Sin cotización' : `${hecho.saldo.moneda} ${num(hecho.saldo.saldo,2)}`}</b> de este
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

      {detalle && <Modal titulo="Detalle del pago" alCerrar={()=>{setAbiertoPago(null);setEditando(null)}}>
        <dl className="rp-detalle">
          {[
            ['Fecha de Pago',fecha(detalle.fecha)],['Importe',`${detalle.moneda} ${num(detalle.monto,2)}`],
            ['Rubro',detalle.rubro],['Tipo',detalle.subrubro || 'Sin tipo'],['Medio',detalle.medio],
            ['Presupuesto asociado',detalle.presupuesto || 'Pago sin presupuesto previo'],
            ['Saldo pendiente del presupuesto',detalle.presupuesto_id ? importeSaldo(detalle) : 'No corresponde'],
            ['Pagado del presupuesto',detalle.presupuesto_id ? importeSaldo(detalle,'pagado') : 'No corresponde'],
            ['Total proyectado',detalle.presupuesto_id ? importeSaldo(detalle,'proyectado') : 'No corresponde'],
            ['Equivalente del pago en ARS',detalle.monto_ars==null ? 'Sin cotización' : `ARS ${num(detalle.monto_ars,2)}`],
            ['Aplicado al presupuesto',detalle.presupuesto_id && detalle.monto_presupuesto!=null ? `${saldoDe(detalle)?.moneda || ''} ${num(detalle.monto_presupuesto,2)}` : 'No corresponde'],
            ['Cuota',detalle.cuota_descripcion || (detalle.cuota_id ? 'Cuota asignada' : 'Sin cuota específica')],
            ['Notas',detalle.notas || 'Sin notas'],['Estado',detalle.anulado ? `Anulado: ${detalle.anulado_motivo || ''}` : 'Registrado'],
          ].map(([titulo,valor])=><div key={titulo}><dt>{titulo}</dt><dd>{valor}</dd></div>)}
        </dl>
        {detalle.presupuesto_cierre_fecha ? <p>Presupuesto cerrado el {fecha(detalle.presupuesto_cierre_fecha)}. Este pago se conserva como historial.</p> : <div className="rp-acciones">{!detalle.anulado && <><button className="ob-btn" onClick={()=>setEditando(editando ? null : detalle)}>{editando?'Cerrar edición':'Editar pago'}</button><button className="ob-btn" onClick={()=>anular(detalle)}>Anular</button></>}<button className="ob-btn" onClick={()=>eliminar(detalle)}>Eliminar definitivamente</button></div>}
        {editando && <EditarPago key={detalle.id} pago={detalle} obraId={obra.id} alGuardar={()=>{setEditando(null);setHecho(null);cargar();tocado()}}/>}
        <Adjuntos obra={obra} colgar={{pago_id:detalle.id}} tipo="recibo" titulo="Recibos y comprobantes" clasificar provistos={documentos[detalle.id] ?? []} alCambiar={cargar}/>
      </Modal>}
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
            <colgroup><col className="ob-col-fecha" /><col className="ob-col-nombre" /><col className="ob-col-tipo" /><col className="ob-col-nombre" /><col className="ob-col-tipo" /><col className="ob-col-dinero" /><col className="ob-col-dinero" /><col className="ob-col-tipo" /><col className="ob-col-accion" /></colgroup>
            <thead>
              <tr>
                <th>Fecha de Pago</th>
                <th>Rubro</th>
                <th>Tipo</th>
                <th>Presupuesto asociado</th>
                <th>Medio</th>
                <th className="ob-num">Monto</th>
                <th className="ob-num">Saldo pendiente</th>
                <th>Adjuntos</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {!visibles.length && <tr><td colSpan={9}>No hay pagos que coincidan con los filtros. Probá otra búsqueda o limpiá la selección.</td></tr>}
              {visibles.map((p) => <Fragment key={p.id}>
                <tr key={p.id} className={p.anulado ? 'ob-pago--anulado' : undefined} onClick={() => setAbiertoPago(abiertoPago === p.id ? null : p.id)}>
                  <td>{fecha(p.fecha)}</td>
                  <td>{p.rubro}</td>
                  <td className="ob-table__sec">{p.subrubro || '—'}</td>
                  <td className="ob-table__sec">
                    {p.presupuesto || 'Sin presupuesto previo'}
                    {p.anulado && <span className="ob-chip ob-chip--bad"
                      style={{ marginLeft: '.4rem' }}>anulado</span>}
                  </td>
                  <td className="ob-table__sec">{p.medio}</td>
                  <td className="ob-num">
                    {p.moneda === 'USD' ? <><span className="ob-chip ob-chip--mudo">U$D</span> {num(p.monto,2)}</> : plata(p.monto)}
                  </td>
                  <td className="ob-num">{saldoDe(p) ? importeSaldo(p) : '—'}</td>
                  <td>{documentos[p.id]?.length ? `Sí · ${documentos[p.id].length}` : 'Sin adjuntos'}</td>
                  <td style={{ width: '5rem' }}><button className="ob-btn" onClick={(e) => { e.stopPropagation(); setAbiertoPago(abiertoPago === p.id ? null : p.id) }}>{abiertoPago === p.id ? 'Cerrar' : 'Detalle'}</button></td>
                </tr>
              </Fragment>
              )}
            </tbody>
          </table>
        </div>
      )}
    </>
  )
}

function Formulario({ obra, destinos, alGuardar }) {
  const hoy = hoyArgentina()
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
  const [tiposComprobante,setTiposComprobante]=useState({})
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
    !p.cerrado && String(p.rubro_id) === String(rubroId)
    && (!subrubroId || String(p.subrubro_id) === String(subrubroId)))

  // Cascada: elegir el rubro deja puesto el tipo y el presupuesto
  // cuando no hay nada que decidir. Es lo que sostiene los quince segundos.
  const elegirRubro = (id) => {
    setRubroId(id)
    const suyos = destinos.presupuestos.filter((p) => !p.cerrado && String(p.rubro_id) === String(id))
    const unicos = [...new Set(suyos.map((p) => p.subrubro_id))]
    const sub = unicos.length === 1 ? String(unicos[0]) : ''
    setSubrubroId(sub)
    const posibles = sub ? suyos.filter((p) => String(p.subrubro_id) === sub) : suyos
    setPresupuestoId(posibles.length === 1 ? posibles[0].id : '')
  }

  const elegirSubrubro = (id) => {
    setSubrubroId(id)
    const posibles = destinos.presupuestos.filter((p) =>
      !p.cerrado && String(p.rubro_id) === String(rubroId) && String(p.subrubro_id) === String(id))
    setPresupuestoId(posibles.length === 1 ? posibles[0].id : '')
  }

  const elegido = destinos.presupuestos.find((p) => p.id === presupuestoId)
  const plata = (valor) => valor == null ? 'Sin cotización' : `${elegido?.moneda || moneda} ${num(valor,2)}`

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
      for (const [i,comprobante] of comprobantes.entries()) {
        setPaso('Subiendo ' + comprobante.name + '…')
        try { await subir(obra.id, comprobante, { tipo: tiposComprobante[i] || 'recibo', pago_id: r.id }) }
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
              {p.nombre}{p.fecha_base ? ` · ${fecha(p.fecha_base)}` : ''} · pactado {p.moneda} {num(p.nominal,2)} · queda {p.saldo == null ? 'Sin cotización' : `${p.moneda} ${num(p.saldo,2)}`}
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
              <br />Equivalente actual: {elegido.saldo_equivalente == null ? 'Sin cotización' : `${elegido.equivalente_moneda} ${num(elegido.saldo_equivalente,2)}`} · cotización del {fecha(elegido.cotizacion_actual_fecha)}.
          </span>
        )}
        {!elegido && rubroId && candidatos.length === 0 && (
          <span className="ob-campo__pie">
            Este rubro no tiene ningún presupuesto confirmado. El pago entra igual,
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
              onClick={() => {setComprobantes([]);setTiposComprobante({})}} aria-label="Quitar">×</button>
          )}
        </div>
        <span className="ob-campo__pie">
          {comprobantes.length
            ? comprobantes.map((f) => f.name).join(', ')
            : 'Podés adjuntar recibos y comprobantes de transferencia al mismo pago.'}
        </span>
        {comprobantes.map((f,i)=><label className="ob-campo" key={i}>{f.name}<select className="ob-input" aria-label={`Tipo de ${f.name}`} value={tiposComprobante[i] || 'recibo'} onChange={e=>setTiposComprobante({...tiposComprobante,[i]:e.target.value})}>{Object.entries(tiposDocumento).map(([v,n])=><option key={v} value={v}>{n}</option>)}</select></label>)}
      </div>

      <button className="ob-btn ob-btn--primario ob-pagar__guardar" type="submit"
        disabled={guardando || !rubroId || !monto}>
        {guardando ? (paso || 'Guardando…') : 'Registrar el pago'}
      </button>
    </form>
  )
}

function EditarPago({ pago, obraId, alGuardar }) {
  const [datos, setDatos] = useState({fecha: pago.fecha.slice(0,10), monto: String(pago.monto), moneda: pago.moneda, medio: pago.medio, notas: pago.notas || ''})
  const [error, setError] = useState(null)
  const [ocupado, setOcupado] = useState(false)
  const campo = (nombre) => ({value: datos[nombre], onChange: e => setDatos({...datos, [nombre]: e.target.value})})
  return <form onSubmit={async e => {
    e.preventDefault(); setOcupado(true); setError(null)
    try { await api.patch(`/api/obras/${obraId}/pagos/${pago.id}`, {...datos, monto: datos.monto}); alGuardar() }
    catch (err) { setError(err); setOcupado(false) }
  }}>
    <Aviso error={error} alCerrar={() => setError(null)} />
    <label className="ob-campo">Fecha de Pago<input className="ob-input" type="date" required {...campo('fecha')} /></label>
    <label className="ob-campo">Moneda<select className="ob-input" {...campo('moneda')}><option value="ARS">Pesos (ARS)</option><option value="USD">Dólares (USD)</option></select></label>
    <label className="ob-campo">Monto ({datos.moneda})<input className="ob-input" type="number" min="0.01" step="0.01" required {...campo('monto')} /></label>
    <p>Cambiar la moneda corrige el registro y conserva el número ingresado; no convierte el importe.</p>
    <label className="ob-campo">Medio<select className="ob-input" {...campo('medio')}>{['transferencia','efectivo','cheque','otro'].map(m => <option key={m}>{m}</option>)}</select></label>
    <label className="ob-campo">Notas<input className="ob-input" {...campo('notas')} /></label>
    <button className="ob-btn ob-btn--primario" disabled={ocupado}>{ocupado ? 'Guardando…' : 'Guardar cambios'}</button>
  </form>
}
