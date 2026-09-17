import { useEffect, useRef, useState } from 'react'
import { agruparSerie, fechaCotizacion, formatoValor } from '../cotizaciones'

export default function GraficoCotizaciones({series,paso}) {
  const [escala,setEscala]=useState('original'),[activo,setActivo]=useState(null)
  const contenedor=useRef(null),[W,setAncho]=useState(1100)
  useEffect(()=>{
    const nodo=contenedor.current
    if(!nodo)return
    const medir=()=>setAncho(Math.max(660,nodo.clientWidth))
    medir()
    const observador=new ResizeObserver(medir)
    observador.observe(nodo)
    return()=>observador.disconnect()
  },[])
  useEffect(()=>setActivo(null),[series,paso,escala])
  const colores=['#2563a6','#b55b14','#0c826d','#9150a0','#ba3551','#487b25','#547080']
  const preparadas=series.map((s,i)=>({...s,color:colores[i%colores.length],valores:agruparSerie(s.valores,paso)}))
  const fechas=[...new Set(preparadas.flatMap(s=>s.valores.map(v=>v.fecha)))].sort()
  const paneles=escala==='base' ? ['base'] : [...new Set(preparadas.filter(s=>s.valores.length).map(s=>s.unidad))]
  const X=95,ancho=W-X-40,alto=78
  const primero=Date.parse(fechas[0] || '2000-01-01'),ultimo=Date.parse(fechas.at(-1) || '2000-01-01')
  const x=f=>X+(ultimo===primero ? ancho/2 : (Date.parse(f)-primero)/(ultimo-primero)*ancho)
  const etiqueta=f=>paso==='anio' ? f.slice(0,4) : paso==='mes' ? `${f.slice(5,7)}/${f.slice(0,4)}` : fechaCotizacion(f)
  const ayuda='Cada semana, mes o año muestra el último dato disponible del intervalo. El IPC mensual conserva el valor del último mes, no la suma. '+(escala==='base' ? 'Base 100 compara la evolución desde el primer dato de cada serie; una serie que comienza en cero no se normaliza.' : 'Las variables con distintas unidades tienen escalas separadas y comparten las fechas.')
  return <figure className="ct-grafico" ref={contenedor}><div className="ct-grafico-cabecera"><figcaption title={ayuda}>Evolución del período</figcaption><label>Escala <select className="ob-input" value={escala} onChange={e=>setEscala(e.target.value)}><option value="original">Valores originales</option><option value="base">Comparar · base 100</option></select></label></div>
    {!series.length ? <p>Seleccioná una o varias variables para graficar.</p> : !fechas.length ? <p>No hay valores en el período seleccionado.</p> : <>
      <div className="ct-leyenda">{preparadas.map(s=><span key={s.codigo}><i style={{background:s.color}}/>{s.nombre}{!s.valores.length && ' · sin datos'}</span>)}</div>
      <div className="ct-svg"><svg viewBox={`0 0 ${W} ${paneles.length*alto+20}`} role="img" aria-label={`Evolución por ${paso}; ${series.map(s=>s.nombre).join(', ')}`}><desc>{ayuda}</desc>
        {paneles.map((unidad,n)=>{
          const ss=preparadas.filter(s=>s.valores.length && (unidad==='base' || s.unidad===unidad))
          const valor=(s,v)=>unidad==='base' ? (s.valores[0].valor===0 ? null : v.valor/s.valores[0].valor*100) : v.valor
          const vs=ss.flatMap(s=>s.valores.map(v=>valor(s,v))).filter(v=>v!=null)
          if(!vs.length)return null
          const bajo=Math.min(...vs),altoDato=Math.max(...vs),margen=Math.max((altoDato-bajo)*.12,Math.abs(altoDato)*.01,0.01),min=bajo-margen,max=altoDato+margen
          const y=v=>n*alto+24+(max-v)/(max-min)*(alto-30)
          return <g key={unidad}><text x={12} y={n*alto+12} className="ct-eje-titulo">{unidad==='base' ? 'Base 100' : unidad==='ARS' ? 'ARS por U$D 1 / por UVA' : unidad==='%' ? 'Porcentaje (%)' : 'Nivel del índice'}</text>
            {[0,.5,1].map(t=>{const v=min+(max-min)*t;return <g key={t}><line x1={X} x2={X+ancho} y1={y(v)} y2={y(v)} stroke="#e2e8f0"/><text x={X-9} y={y(v)+4} textAnchor="end">{formatoValor(v,unidad==='base' ? '' : unidad)}</text></g>})}
            {ss.map(s=>{const puntos=s.valores.filter(v=>valor(s,v)!=null);return <g key={s.codigo}><polyline fill="none" stroke={s.color} strokeWidth="1.5" points={puntos.map(v=>`${x(v.fecha)},${y(valor(s,v))}`).join(' ')}/>{puntos.map(v=><circle key={v.fecha} cx={x(v.fecha)} cy={y(valor(s,v))} r={4} opacity={puntos.length===1 ? 1 : 0} fill={s.color} onMouseEnter={()=>setActivo({s,v})} onClick={()=>setActivo({s,v})}><title>{s.nombre}: {formatoValor(v.valor,s.unidad)} · {fechaCotizacion(v.fechaDato)}</title></circle>)}</g>})}
          </g>
        })}
        {[...new Set(Array.from({length:Math.min(5,fechas.length)},(_,i)=>fechas[Math.round(i*(fechas.length-1)/Math.max(1,Math.min(5,fechas.length)-1))]))].map(f=><text key={f} x={x(f)} y={paneles.length*alto+13} textAnchor="middle">{etiqueta(f)}</text>)}
      </svg></div>
      <p className="ct-punto" aria-live="polite">{activo ? `${activo.s.nombre}: ${formatoValor(activo.v.valor,activo.s.unidad)} · dato del ${fechaCotizacion(activo.v.fechaDato)}` : 'Pasá el mouse o tocá un punto para ver su valor y fecha.'}</p>
    </>}
  </figure>
}
