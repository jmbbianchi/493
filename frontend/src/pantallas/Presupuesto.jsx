import { useEffect, useState } from 'react'
import { useParams, useNavigate, useOutletContext } from 'react-router-dom'
import * as api from '../api'
import Aviso from '../componentes/Aviso'
import Adjuntos from '../componentes/Adjuntos'
import ItemsPresupuesto from '../componentes/ItemsPresupuesto'
import Modal from '../componentes/Modal'
import SelectorCategoria from '../componentes/SelectorCategoria'
import { totalAcuerdo, repartirAcuerdo } from '../acuerdos'
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

  const [items, setItems] = useState([])
  const [guardandoItems, setGuardandoItems] = useState(false)
  const [editando, setEditando] = useState(null)

  const cargar = () => {
    setD(null)
    api.get(`/api/obras/${obra.id}/presupuestos/${presupuestoId}`)
      .then(setD).catch(setError)
    api.get(`/api/obras/${obra.id}/presupuestos/${presupuestoId}/items`)
      .then(setItems).catch(() => setItems([]))
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
  const plata = (valor) => valor == null ? 'Sin cotización' : `${p.moneda} ${num(valor, 2)}`
  const t = d.total
  const borrador = p.estado === 'borrador'

  const abrirEdicion = async () => {
    try {
      const acuerdo = await api.get(`/api/obras/${obra.id}/presupuestos/${presupuestoId}/acuerdo`)
      const proyecto = await api.get(`/api/obras/${obra.id}/proyecto`).catch(() => ({ tareas: [] }))
      const [rubros,subrubros] = await Promise.all([api.get(`/api/obras/${obra.id}/rubros`),api.get(`/api/obras/${obra.id}/subrubros`)])
      setEditando({ ...acuerdo, proyecto, rubros, subrubros, cuotas: acuerdo.cuotas.map((c) => ({ ...c, monto_nominal: String(c.monto_nominal), fecha_prevista: c.fecha_prevista ? String(c.fecha_prevista).slice(0, 10) : '' })) })
    } catch (e) { setError(e) }
  }

  return (
    <>
      <div className="ob-toolbar">
        <button className="ob-btn" onClick={() => navegar(`/obra/${obra.id}/rubros/${p.rubro_id}`)}>
          ← Volver al rubro
        </button>
        <span className="ob-label" style={{ marginLeft: 'var(--ob-gap-3)' }}>{p.nombre}</span>
        <span className={`ob-chip ob-chip--${borrador ? 'mudo' : 'ok'}`}
          style={{ marginLeft: 'var(--ob-gap-2)' }}>{p.estado}</span>
        {p.estado === 'confirmado' ? (
          <span className="ob-chip ob-chip--ok" style={{ marginLeft: 'var(--ob-gap-2)' }}>
            Aprobado para pagos
          </span>
        ) : null}
        <span className="ob-toolbar__meta">
          Base {fecha(p.fecha_base)} · {p.moneda}
          {p.origen === 'items' ? ' · por artículos' : ' · monto único'}
        </span>
        <button className="ob-btn" onClick={abrirEdicion} style={{ marginLeft: 'var(--ob-gap-2)' }}>Editar acuerdo</button>
      </div>

      {borrador && (
        <div className="ob-nota" style={{ padding: 'var(--ob-gap-4)' }}>
          Todavía es un borrador: no tiene cuotas. Confirmalo para que el plan
          se convierta en obligaciones con fecha.
          <button className="ob-btn ob-btn--primario" onClick={confirmar}
            style={{ marginLeft: 'var(--ob-gap-3)' }}>Confirmar el presupuesto</button>
        </div>
      )}

      {editando && <EditorAcuerdo datos={editando} obraId={obra.id} presupuestoId={presupuestoId}
        alCerrar={() => setEditando(null)} alGuardar={() => { setEditando(null); cargar() }} />}

      {!borrador && (
        <div className="ob-tres">
          <Numero rotulo="Proyectado" valor={plata(t.proyectado)}
            resalta={t.diferencia > 0}
            pie={`Nominal ${plata(t.nominal)}, o sea ${plata(t.diferencia)} más. `
              + (t.cuotas_proyectadas > 0
                ? `${t.cuotas_proyectadas} de ${t.cuotas} cuotas estimadas con IPC de ${num(d.proyeccion.variacion_mensual_usada, 1)} % mensual, la última publicada (${fecha(d.proyeccion.ultimo_mes_publicado)}).`
                : 'Todas las cuotas tienen coeficiente publicado.')} />
          <Numero rotulo="Pagado" valor={plata(t.pagado)}
            pie={t.avance_pago_pct
              ? `Llevás pagado el ${num(t.avance_pago_pct, 1)} % de lo proyectado.`
              : 'Todavía no se registró ningún pago contra este presupuesto.'} />
          <Numero rotulo="Falta pagar" valor={plata(t.saldo)}
            pie="Contra el proyectado, no contra el nominal: lo que falta de verdad incluye el ajuste." />
        </div>
      )}

      {!borrador && <p style={{padding:'0 1rem'}}>Saldo en {p.moneda}: {plata(t.saldo)} · Equivalente actual: {t.saldo_equivalente == null ? 'Sin cotización disponible' : `${t.equivalente_moneda} ${num(t.saldo_equivalente,2)}`} · Cotización del {fecha(t.cotizacion_actual_fecha)}. Los pagos se convierten a la fecha en que se realizaron.</p>}

      {borrador && p.origen === 'items' && <form className="ob-card" style={{ padding: '1rem' }} onSubmit={async (e) => {
        e.preventDefault(); setGuardandoItems(true)
        try {
          if (!items.length) throw new Error('Agregá al menos un artículo.')
          await api.put(`/api/obras/${obra.id}/presupuestos/${presupuestoId}/items`, items.map((x) => ({ descripcion: x.descripcion, unidad: x.unidad || null, cantidad: Number(x.cantidad), precio_unitario: Number(x.precio_unitario) })))
          cargar()
        } catch (err) { setError(err) } finally { setGuardandoItems(false) }
      }}><ItemsPresupuesto items={items} onChange={setItems} /><button className="ob-btn ob-btn--primario" disabled={guardandoItems}>Guardar artículos</button></form>}
      {items.length > 0 && !borrador && (
        <>
          <div className="ob-toolbar" style={{ borderTop: 'var(--ob-border)' }}>
            <span className="ob-label">Artículos cotizados</span>
            <span className="ob-toolbar__meta">
              Cotización original por artículos · el total pactado puede incluir una negociación posterior
            </span>
          </div>
          <div className="ob-tablewrap">
            <table className="ob-table">
              <thead>
                <tr>
                  <th className="ob-table__gutter">#</th>
                  <th>Artículo</th>
                  <th className="ob-num">Cantidad</th>
                  <th>Un.</th>
                  <th className="ob-num">Precio unit.</th>
                  <th className="ob-num">Subtotal</th>
                </tr>
              </thead>
              <tbody>
                {items.map((i) => (
                  <tr key={i.id}>
                    <td className="ob-table__gutter">{i.orden}</td>
                    <td>{i.descripcion}</td>
                    <td className="ob-num">{num(i.cantidad, 2)}</td>
                    <td className="ob-table__sec">{i.unidad || '—'}</td>
                    <td className="ob-num">{plata(i.precio_unitario)}</td>
                    <td className="ob-num">{plata(i.subtotal)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td className="ob-table__gutter" />
                  <td colSpan={4}>{items.length} artículos</td>
                  <td className="ob-num ob-total">
                    {plata(items.reduce((a, i) => a + i.subtotal, 0))}
                  </td>
                </tr>
                {Math.abs(items.reduce((a,i)=>a+Number(i.subtotal),0)-Number(p.monto_base)) > .005 && <>
                  <tr><td /><td colSpan={4}>Ajuste negociado sobre artículos</td><td className="ob-num">{plata(Number(p.monto_base)-items.reduce((a,i)=>a+Number(i.subtotal),0))}</td></tr>
                  <tr><td /><td colSpan={4}>Total pactado</td><td className="ob-num ob-total">{plata(p.monto_base)}</td></tr>
                </>}
              </tfoot>
            </table>
          </div>
        </>
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

      {d.pagos?.length > 0 && (
        <>
          <div className="ob-toolbar" style={{ borderTop: 'var(--ob-border)' }}>
            <span className="ob-label">Pagos contra este presupuesto</span>
          </div>
          <div className="ob-tablewrap">
            <table className="ob-table">
              <thead>
                <tr>
                  <th>Fecha</th><th>Medio</th><th>Notas</th><th>% completado</th>
                  <th className="ob-num">Pagado</th>
                  <th className="ob-num">En pesos</th>
                </tr>
              </thead>
              <tbody>
                {d.pagos.map((g) => (
                  <tr key={g.id} style={g.anulado ? { opacity: .5 } : undefined}>
                    <td>{fecha(g.fecha)}</td>
                    <td className="ob-table__sec">{g.medio}</td>
                    <td className="ob-table__sec">
                      {g.anulado ? `anulado: ${g.anulado_motivo}` : (g.notas || '—')}
                    </td>
                    <td className="ob-num">{t.nominal && !t.pagos_sin_convertir ? `${num(d.pagos.filter((x) => !x.anulado && x.fecha <= g.fecha).reduce((a, x) => a + Number(x.monto_presupuesto || 0), 0) / t.nominal * 100, 1)} %` : '—'}</td>
                    <td className="ob-num">
                      {g.moneda} {num(g.monto, 2)}
                    </td>
                    {/* Lo que se resta del saldo es esto, no el monto de
                        arriba. Con la cotizacion a la vista el numero se
                        puede auditar; sin ella hay que creerle. */}
                    <td className={`ob-num${g.monto_ars == null ? ' ob-table__sec' : ''}`}
                      title={g.cotizacion_usada
                        ? `Oficial minorista ${num(g.cotizacion_usada, 2)} del día del pago` : undefined}>
                      {g.monto_ars == null ? 'sin cotización' : `ARS ${num(g.monto_ars,2)}`}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      <div style={{ padding: 'var(--ob-gap-4)' }}>
        <Adjuntos obra={obra} colgar={{ presupuesto_id: presupuestoId }}
          tipo="presupuesto" titulo="El presupuesto en papel" />
      </div>

      <div style={{ padding: '0 var(--ob-gap-4) var(--ob-gap-4)' }}>
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

function EditorAcuerdo({ datos: inicial, obraId, presupuestoId, alCerrar, alGuardar }) {
  const [d, setD] = useState(inicial)
  const [error, setError] = useState(null)
  const [guardando, setGuardando] = useState(false)
  const [nuevoTotal, setNuevoTotal] = useState(String(inicial.monto_base))
  const [totalPendiente, setTotalPendiente] = useState(false)
  const cambiar = (i, k, v) => setD((x) => ({ ...x, cuotas: x.cuotas.map((c, n) => n === i ? { ...c, [k]: v } : c) }))
  const guardar = async () => {
    setGuardando(true); setError(null)
    try {
      const cuotas = totalPendiente ? repartirAcuerdo(d.cuotas,nuevoTotal) : d.cuotas
      await api.put(`/api/obras/${obraId}/presupuestos/${presupuestoId}/acuerdo`, {
        huella: d.huella, nombre: d.nombre, monto_base: totalAcuerdo(cuotas), elegido: true,
        rubro_id: Number(d.rubro_id), subrubro_id: Number(d.subrubro_id),
        base_ipc: d.base_ipc, tarea_id: d.tarea_id || null, cuotas: cuotas.map((c) => ({
          id: c.id, tipo: c.tipo, descripcion: c.descripcion, fecha_prevista: c.fecha_prevista || null,
          monto_nominal: Number(String(c.monto_nominal).replace(',', '.')), indexa: Boolean(c.indexa),
        })),
      })
      alGuardar()
    } catch (e) { setError(e); setGuardando(false) }
  }
  return <Modal titulo="Editar acuerdo" bajada="Los pagos ya registrados se conservan. Las cuotas pagadas no se pueden alterar." alCerrar={alCerrar}>
    <Aviso error={error} alCerrar={() => setError(null)} />
    <label className="ob-campo"><span className="ob-label">Nombre / proveedor</span><input className="ob-input" value={d.nombre} onChange={(e) => setD({ ...d, nombre: e.target.value })} /></label>
    <label className="ob-campo"><span className="ob-label">Rubro</span><SelectorCategoria tipo="rubros" className="ob-input" value={d.rubro_id} onChange={e=>setD({...d,rubro_id:e.target.value})}>{d.rubros.map(r=><option key={r.id} value={r.id}>{r.nombre}</option>)}</SelectorCategoria></label>
    <label className="ob-campo"><span className="ob-label">Tipo</span><SelectorCategoria tipo="subrubros" className="ob-input" value={d.subrubro_id} onChange={e=>setD({...d,subrubro_id:e.target.value})}>{d.subrubros.map(r=><option key={r.id} value={r.id}>{r.nombre}</option>)}</SelectorCategoria></label>
    <label className="ob-campo"><span className="ob-label">Nuevo total negociado · {d.moneda}</span><input className="ob-input ob-num" type="number" min="0.01" step="0.01" value={nuevoTotal} onChange={e=>{setNuevoTotal(e.target.value);setTotalPendiente(true)}} /></label>
    <button className="ob-btn" onClick={()=>{try{setD({...d,cuotas:repartirAcuerdo(d.cuotas,nuevoTotal)});setTotalPendiente(false);setError(null)}catch(e){setError(e)}}}>Aplicar total a los desembolsos</button>
    <p className="ob-nota">Se reparte entre los desembolsos sin pagos. También podés editar sus importes individualmente. Total a guardar: <strong>{d.moneda} {num(totalAcuerdo(d.cuotas),2)}</strong>.</p>
    <p>Este acuerdo confirmado se incluye en la obra y admite pagos independientes.</p>
    <label className="ob-campo"><span className="ob-label">Base para el ajuste IPC</span><select className="ob-input" value={d.base_ipc} onChange={(e) => setD({ ...d, base_ipc: e.target.value })}><option value="primera_cuota">Inicio de la primera cuota</option><option value="cotizacion">Fecha de cotización</option></select></label>
    <label className="ob-campo"><span className="ob-label">Tarea vinculada</span><select className="ob-input" value={d.tarea_id || ''} onChange={(e) => setD({ ...d, tarea_id: e.target.value || null })}><option value="">Sin tarea vinculada</option>{d.proyecto.tareas.filter((t) => t.tipo === 'tarea').map((t) => <option key={t.id} value={t.id}>{t.nombre}</option>)}</select></label>
    <div className="ob-tablewrap"><table className="ob-table"><thead><tr><th>Concepto</th><th>Fecha estimada (opcional)</th><th>Monto pactado</th><th>IPC</th></tr></thead><tbody>{d.cuotas.map((c, i) => <tr key={c.id || i}><td>{c.descripcion}{c.con_pagos && ' · con pagos'}</td><td><input className="ob-input" disabled={c.con_pagos} type="date" value={c.fecha_prevista} onChange={(e) => cambiar(i, 'fecha_prevista', e.target.value)} /></td><td><input className="ob-input ob-num" disabled={c.con_pagos || totalPendiente} aria-label={`Monto ${c.descripcion}`} value={c.monto_nominal} onChange={(e) => cambiar(i, 'monto_nominal', e.target.value)} /></td><td><input type="checkbox" disabled={c.con_pagos} checked={Boolean(c.indexa)} onChange={(e) => cambiar(i, 'indexa', e.target.checked)} /></td></tr>)}</tbody></table></div>
    <footer className="pr-editor__acciones"><button className="ob-btn" onClick={alCerrar}>Cancelar</button><button className="ob-btn ob-btn--primario" disabled={guardando} onClick={guardar}>{guardando ? 'Guardando…' : 'Guardar cambios'}</button></footer>
  </Modal>
}
