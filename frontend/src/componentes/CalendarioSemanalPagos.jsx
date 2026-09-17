import { useCallback, useEffect, useMemo, useState } from 'react'
import * as api from '../api'
import { semana } from '../calendarioPagos'
import { tesoreria, resumenCelda, sumar, sumarDias } from '../tesoreria'
import { num, fecha } from '../formato'
import Modal from './Modal'
import '../styles/calendario-pagos.css'

export default function CalendarioSemanalPagos({ obraId, superficie, destinos, pagos }) {
  const hoy = new Date().toLocaleDateString('en-CA')
  const [inicio,setInicio] = useState(semana(hoy)), [moneda,setMoneda] = useState('ARS'), [modo,setModo] = useState('semanas')
  const [datos,setDatos] = useState(null), [programaciones,setProgramaciones] = useState([]), [tasas,setTasas] = useState([])
  const [error,setError] = useState(''), [recarga,setRecarga] = useState(0), [aviso,setAviso] = useState('')
  const [cerrados,setCerrados] = useState({}), [seleccion,setSeleccion] = useState(null)
  const cerrar = useCallback(()=>setSeleccion(null),[])
  useEffect(()=>{
    let activo = true; setError(''); setDatos(null)
    Promise.all([
      Promise.all(destinos.presupuestos.map(async p=>({...p,cuotas:(await api.get(`/api/obras/${obraId}/presupuestos/${p.id}`)).cuotas}))),
      api.get(`/api/obras/${obraId}/calendario`), api.get('/api/indices/dolar-calendario'),
    ]).then(([ps,fs,ts])=>{if(activo){setDatos(ps);setProgramaciones(fs);setTasas(ts)}}).catch(e=>{if(activo)setError(e.message)})
    return ()=>{activo=false}
  },[obraId,destinos,recarga])
  const modelo = useMemo(()=>tesoreria({presupuestos:datos || [],pagos,programaciones,tasas,hoy,moneda}),[datos,pagos,programaciones,tasas,hoy,moneda])
  const grupos = useMemo(()=>{
    const gs = new Map()
    for(const f of modelo.filas){
      if(!gs.has(f.tipo_id))gs.set(f.tipo_id,{key:String(f.tipo_id),tipo_id:f.tipo_id,nombre:f.tipo,hijos:[],registros:[]})
      gs.get(f.tipo_id).hijos.push(f);gs.get(f.tipo_id).registros.push(...f.registros)
    }
    return [...gs.values()]
  },[modelo])
  const semanas = [...Array.from({length:12},(_,i)=>sumarDias(inicio,i*7)),'sin_fecha']
  const importe = v=>v==null ? 'Sin cotización' : num(v/100,2)
  const dinero = v=>`${moneda} ${importe(v)}`
  const detalles = seleccion ? modelo.registros.filter(r=>(seleccion.tipo==null || r.tipo_id===seleccion.tipo) &&
    (!seleccion.rubro || `${r.tipo_id}/${r.rubro_id}`===seleccion.rubro) && (!seleccion.semana || r.semana===seleccion.semana)) : []
  const abrir = (nombre,g,s=null)=>setSeleccion({nombre,tipo:g.tipo_id,rubro:g.key?.includes('/') ? g.key : null,semana:s})
  const tooltip = rs=>{
    const c=resumenCelda(rs)
    return `Restante a pagar: ${dinero(c.pendiente)}\nPagos realizados: ${dinero(c.pagado)}${c.vencidos ? `\nIncluye ${c.vencidos} vencido(s)` : ''}\nAbrir detalle y reprogramar`
  }
  const celdas = g=>[...semanas,null].map(s=>{
    const rs=g.registros.filter(r=>!s || r.semana===s), c=resumenCelda(rs)
    const soloPagado=rs.length && rs.every(r=>r.clase==='pago')
    return <td key={s || 'total'} className={`${s ? c.estado : 'cp-total'} ${s===semana(hoy) ? 'cp-actual' : ''}`}>
      {rs.length ? <button className="cp-celda" title={tooltip(rs)} onClick={()=>abrir(g.nombre || g.rubro,g,s)}>
        {importe(c.pendiente)}{c.vencidos>0 && <span className="cp-arrastre" aria-label="Incluye vencidos"> ↪</span>}
        {soloPagado && <span aria-label="Pagado"> ✓</span>}
      </button> : '—'}
    </td>
  })
  const guardar=async(q,nueva)=>{
    const resultado=await api.put(`/api/obras/${obraId}/calendario/${q.id}`,{fecha:nueva || null,version:q.version})
    setProgramaciones(ps=>[...ps.filter(p=>p.cuota_id!==q.id),resultado])
    setAviso(`${q.descripcion}: ${nueva ? 'programado para el '+fecha(nueva) : 'sin fecha programada'}.`);cerrar()
  }
  return <section className="cp-panel">
    <div className="cp-cabecera"><div><h2>Cronograma de Pagos</h2><p>Planificá cuánto necesitás y cuándo.</p></div>
      <div className="cp-switch" role="group" aria-label="Moneda de la vista">{['ARS','USD'].map(m=><button key={m} aria-pressed={moneda===m} onClick={()=>setMoneda(m)}>{m==='ARS' ? 'Pesos' : 'Dólares'}</button>)}</div>
    </div>
    {error ? <p role="alert">{error} <button className="ob-btn" onClick={()=>setRecarga(n=>n+1)}>Reintentar</button></p> : datos===null ? <p role="status">Cargando gastos y cotizaciones…</p> : <>
      <div className="cp-kpis" aria-label="Indicadores de gastos">{[
        ['Esta semana',modelo.semanaActual,'Incluye el saldo vencido de semanas anteriores'],
        ['Próxima semana',modelo.proxima,`${fecha(sumarDias(semana(hoy),7))} al ${fecha(sumarDias(semana(hoy),13))}`],
        ['Semana siguiente',modelo.siguiente,`${fecha(sumarDias(semana(hoy),14))} al ${fecha(sumarDias(semana(hoy),20))}`],
        ['Presupuestos aprobados',modelo.aprobado,'Total pactado de presupuestos elegidos, convertido a la cotización actual; sin proyección IPC'],
        ['Gasto acumulado',modelo.pagado,'Pagos realizados hasta hoy, incluidos los pagos sin presupuesto; convertidos a su cotización histórica'],
        ['Saldo pendiente',modelo.pendiente,'Todas las fechas, incluso sin programar y fuera del período visible'],
        ['Gasto / m²',Number(superficie)>0 && modelo.pagado!=null ? Math.round(modelo.pagado/Number(superficie)) : null,`Pagado / ${num(superficie || 0,2)} m² según Datos de obra`],
      ].map(([label,value,title])=><div key={label} title={title}><span>{label}</span><strong>{label==='Gasto / m²' && !(Number(superficie)>0) ? 'Sin superficie' : dinero(value)}</strong></div>)}</div>
      <div className="cp-controles">
        <div className="cp-switch" role="group" aria-label="Vista de gastos"><button aria-pressed={modo==='semanas'} onClick={()=>setModo('semanas')}>Por semana</button><button aria-pressed={modo==='rubros'} onClick={()=>setModo('rubros')}>Por rubro</button></div>
        {modo==='semanas' && <><button className="ob-btn" aria-label="12 semanas anteriores" onClick={()=>setInicio(sumarDias(inicio,-84))}>←</button>
          <label>Desde <input type="date" className="ob-input" value={inicio} onChange={e=>{if(e.target.value)setInicio(semana(e.target.value))}} /></label>
          <button className="ob-btn" onClick={()=>setInicio(semana(hoy))}>Hoy</button><button className="ob-btn" aria-label="12 semanas siguientes" onClick={()=>setInicio(sumarDias(inicio,84))}>→</button></>}
        <small className="cp-tasa">{modelo.actual ? `1 USD = ARS ${num(modelo.actual.valor,2)} · ${fecha(modelo.actual.fecha)}` : 'No hay cotización de dólar disponible'}</small>
      </div>
      {aviso && <p role="status" className="cp-aviso">{aviso}</p>}
      {modo==='semanas' ? <div className="cp-scroll"><table className="cp-tabla"><thead><tr><th scope="col">Tipo / Rubro</th>{semanas.map(s=><th scope="col" key={s} className={s===semana(hoy) ? 'cp-actual' : ''}>{s==='sin_fecha' ? 'Sin programar' : fecha(s)}{s===semana(hoy) && <small> · actual</small>}</th>)}<th scope="col">Total general¹</th></tr></thead>
        <tbody>{grupos.flatMap(g=>[
          <tr key={'tipo-'+g.key} className="cp-rubro"><th scope="row"><button className="cp-grupo" aria-expanded={!cerrados[g.key]} onClick={()=>setCerrados(v=>({...v,[g.key]:!v[g.key]}))}>{cerrados[g.key] ? '▸' : '▾'} {g.nombre}</button></th>{celdas(g)}</tr>,
          ...(!cerrados[g.key] ? g.hijos.map(h=><tr key={h.key}><th scope="row" className="cp-subrubro">{h.rubro}</th>{celdas(h)}</tr>) : [])
        ])}{!grupos.length && <tr><td colSpan={15}>Todavía no hay gastos ni presupuestos elegidos.</td></tr>}</tbody>
        <tfoot><tr><th scope="row">Restante a pagar · {moneda}</th>{[...semanas,null].map(s=><td key={s || 'total'}>{importe(sumar(modelo.registros.filter(r=>!s || r.semana===s).map(r=>r.pendiente)))}</td>)}</tr></tfoot>
      </table></div> : <div className="cp-scroll"><table className="cp-tabla cp-resumen"><thead><tr><th>Tipo / Rubro</th><th>Gasto acumulado</th><th>Saldo pendiente</th><th>Pagado + pendiente</th><th>% pagado</th></tr></thead>
        <tbody>{modelo.filas.map(f=>{
          const c=resumenCelda(f.registros), total=sumar([c.pagado,c.pendiente])
          return <tr key={f.key}><th scope="row"><button className="cp-grupo" onClick={()=>abrir(f.rubro,f)}>{f.rubro}</button><small>{f.tipo}</small></th><td>{dinero(c.pagado)}</td><td><button className="cp-celda" onClick={()=>abrir(f.rubro,f)}>{dinero(c.pendiente)}</button></td><td>{dinero(total)}</td><td>{total && c.pagado!=null ? num(c.pagado/total*100,1)+' %' : '—'}</td></tr>
        })}</tbody><tfoot><tr><th>Restante a pagar · {moneda}</th><td></td><td>{importe(modelo.pendiente)}</td><td></td><td></td></tr></tfoot>
      </table></div>}
      <div className="cp-notas"><span className="cp-leyenda pendiente">Impago</span><span className="cp-leyenda parcial">Parcial</span><span className="cp-leyenda completo">Pagado</span><span>↪ Vencidos acumulados en la semana actual. Clic en un importe para reprogramar.</span></div>
      <p className="cp-metodo">¹ Total general: todas las fechas. Los saldos sin fecha quedan en «Sin programar». Pagos convertidos a su cotización histórica; pendientes al dólar indicado arriba. Las cuotas impagas incluyen la proyección disponible; las parciales muestran el saldo nominal restante. Reprogramar no modifica el acuerdo ni su ajuste.</p>
      {seleccion && <Modal titulo={seleccion.nombre} bajada={seleccion.semana==='sin_fecha' ? 'Saldos sin fecha programada' : seleccion.semana ? 'Semana del '+fecha(seleccion.semana) : 'Todos los pagos y compromisos'} alCerrar={cerrar}>
        <div className="cp-detalle-resumen"><strong>Restante: {dinero(resumenCelda(detalles).pendiente)}</strong><span>{seleccion.semana ? 'Pagado en esta semana' : 'Pagado acumulado'}: {dinero(resumenCelda(detalles).pagado)}</span></div>
        {detalles.map(r=><div className="cp-partida" key={r.id}>
          <div className="cp-partida-titulo"><strong>{r.descripcion}</strong><span>{r.moneda} {num(r.nominal/100,2)}</span></div>
          <p>{r.nombre} · {r.rubro} / {r.tipo}</p>
          {r.clase==='cuota' ? <>
            <dl><div><dt>Pagado aplicado</dt><dd>{r.moneda} {num(r.cubierto/100,2)}</dd></div><div><dt>Saldo a desembolsar</dt><dd>{dinero(r.pendiente)}</dd></div><div><dt>Fecha del acuerdo</dt><dd>{r.original ? fecha(r.original) : 'Sin fecha'}</dd></div></dl>
            {r.vencido && <p>Vencido: se acumula en la semana actual hasta que lo pagues o reprogrames.</p>}
            {(r.pendiente==null || r.pendiente>0) && <Programar key={`${r.id}-${r.version}`} cuota={r} guardar={guardar} hoy={hoy} />}
          </> : <p>{r.clase==='pago' ? 'Pagado el ' : 'Previsto el '}{fecha(r.fecha)} · {dinero(r.clase==='pago' ? r.pagado : r.pendiente)}{r.tasa && r.moneda!==moneda ? ` · dólar ARS ${num(r.tasa.valor,2)} del ${fecha(r.tasa.fecha)}` : ''}</p>}
        </div>)}
      </Modal>}
    </>}
  </section>
}

function Programar({cuota,guardar,hoy}) {
  const [dia,setDia]=useState(cuota.fecha || ''), [ocupado,setOcupado]=useState(false), [error,setError]=useState('')
  const enviar=async e=>{e.preventDefault();setOcupado(true);setError('');try{await guardar(cuota,dia)}catch(e){setError(e.message)}finally{setOcupado(false)}}
  return <form className="cp-programar" onSubmit={enviar}>
    <label>Fecha de desembolso <input className="ob-input" type="date" value={dia} onChange={e=>setDia(e.target.value)} /></label>
    <button type="button" className="ob-btn" disabled={ocupado} onClick={()=>setDia(sumarDias(semana(cuota.fecha && cuota.fecha>hoy ? cuota.fecha : hoy),7))}>Semana siguiente</button>
    <button type="button" className="ob-btn" disabled={ocupado} onClick={()=>setDia('')}>Sin fecha</button>
    <button className="ob-btn ob-btn--primario" disabled={ocupado}>{ocupado ? 'Guardando…' : 'Guardar fecha'}</button>
    {error && <p role="alert">{error}</p>}
  </form>
}
