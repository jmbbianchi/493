import { useEffect, useState } from 'react'
import { useOutletContext, Link } from 'react-router-dom'
import * as api from '../api'
import Aviso from '../componentes/Aviso'
import Modal from '../componentes/Modal'
import Curvas from '../componentes/Curvas'
import Gantt from '../componentes/Gantt'
import { plata, num, fecha as fmtFecha } from '../formato'

/**
 * Proyecto: la vista de entrada de la obra.
 *
 * Arriba los tres números que la app existe para poner uno al lado del
 * otro. Abajo las dos curvas cruzadas, que contestan la tercera pregunta
 * — la única que no se puede contestar con una tabla —, y el cronograma.
 *
 * Ningún número se rellena con un cero. Una obra recién creada tiene los
 * tres en raya y abajo dice por dónde se empieza, porque cero es una
 * afirmación y raya es la ausencia de una.
 */
export default function Proyecto() {
  const { obra, version, tocado } = useOutletContext()
  const [d, setD] = useState(null)
  const [error, setError] = useState(null)
  const [escala, setEscala] = useState('semana')
  const [editando, setEditando] = useState(null)

  const cargar = async () => {
    try {
      const [lista, resumen, crono, curvas] = await Promise.all([
        api.get(`/api/obras/${obra.id}/lista-materiales`),
        api.get(`/api/obras/${obra.id}/rubros-resumen`),
        api.get(`/api/obras/${obra.id}/cronograma`),
        api.get(`/api/obras/${obra.id}/curvas?escala=${escala}`),
      ])
      setD({ lista, resumen, crono, curvas })
    } catch (e) { setError(e) }
  }
  useEffect(() => { setD(null); cargar() }, [obra.id, version, escala])

  if (error) return <Aviso error={error} alCerrar={() => setError(null)} />
  if (!d) return <p className="ob-cargando">Cargando…</p>

  const hayComputo = d.lista.rubros.length > 0
  const teorico = hayComputo ? d.lista.total : null
  const presupuestado = d.resumen.rubros.reduce((a, r) => a + r.proyectado, 0)
  const pagado = d.resumen.rubros.reduce((a, r) => a + (r.pagado ?? 0), 0)
  const avance = d.crono.avance_obra_pct
  const conFecha = d.crono.tareas.filter((t) => t.fecha_inicio).length
  const vacia = !hayComputo && !presupuestado && !pagado

  return (
    <>
      <div className="ob-toolbar">
        <span className="ob-label">Proyecto</span>
        <span className="ob-toolbar__meta">
          {obra.nombre}
          {obra.sup_cubierta ? ` · ${num(obra.sup_cubierta, 2)} m2 cubiertos` : ''}
        </span>
      </div>

      <div className="ob-tres">
        <Numero rotulo="Teorico" valor={teorico == null ? null : plata(teorico)}
          pie={teorico == null
            ? 'Lo que dice el cómputo. Todavía no hay cómputo cargado.'
            : `Materiales ${plata(d.lista.total_materiales)} + mano de obra ${plata(d.lista.total_mano_obra)}.`} />
        <Numero rotulo="Presupuestado" valor={presupuestado ? plata(presupuestado) : null}
          pie={presupuestado
            ? 'Proyectado de los presupuestos elegidos, con su plan de pago.'
            : 'Lo que te cotizaron. Todavía no hay ninguno elegido.'} />
        <Numero rotulo="Pagado" valor={pagado ? plata(pagado) : null}
          pie={pagado
            ? `Falta pagar ${plata(presupuestado - pagado)}.`
            : 'Lo que salió de la cuenta. Todavía no se registró ningún pago.'} />
        <Numero rotulo="Avance de obra"
          valor={d.crono.tareas.some((t) => t.tiene_avance) ? `${num(avance, 1)} %` : null}
          pie={d.crono.tareas.some((t) => t.tiene_avance)
            ? (d.crono.ponderado
              ? 'Ponderado por lo que cuesta cada tarea.'
              : 'Promedio simple: no hay costos cargados para ponderar.')
            : `Sin avance cargado. ${conFecha} de ${d.crono.tareas.length} tareas tienen fecha.`} />
      </div>

      {vacia ? (
        <div className="ob-vacio">
          <h2>Esta obra está en blanco</h2>
          <p>
            Los números de arriba están en raya porque no hay nada cargado
            todavía, y no en cero porque cero sería mentir. Por dónde se empieza:
          </p>
          <ul>
            <li><b><Link to={`/obra/${obra.id}/presupuestos`}>Presupuestos</Link></b> —
              lo que te pasó cada proveedor. Cargá varias cotizaciones del mismo
              trabajo y la app te muestra cuánto se separan.</li>
            <li><b><Link to={`/obra/${obra.id}/pagar`}>Registrar Pago</Link></b> —
              cada pago, con su comprobante, parado en la obra.</li>
            <li><b><Link to={`/obra/${obra.id}/materiales`}>Materiales y precios</Link></b> —
              los precios, para que el cómputo pueda dar un teórico.</li>
          </ul>
        </div>
      ) : (
        <>
          <Curvas datos={d.curvas} escala={escala} alCambiarEscala={setEscala} />
          <Gantt tareas={d.crono.tareas} rubros={d.crono.rubros} escala={escala}
            alCambiarEscala={setEscala} alMover={setEditando} />
        </>
      )}

      {editando && (
        <Modal titulo={editando.tarea}
          bajada="Fechas y avance. Mover una tarea corre a las que dependen de ella."
          alCerrar={() => setEditando(null)}>
          <EditarTarea obra={obra} tarea={editando} tareas={d.crono.tareas}
            alGuardar={() => { setEditando(null); cargar(); tocado() }} />
        </Modal>
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

function EditarTarea({ obra, tarea, tareas, alGuardar }) {
  const hoy = new Date().toISOString().slice(0, 10)
  const [inicio, setInicio] = useState(tarea.fecha_inicio || '')
  const [fin, setFin] = useState(tarea.fecha_fin || '')
  const [avance, setAvance] = useState(tarea.avance_pct ?? 0)
  const [fechaAvance, setFechaAvance] = useState(hoy)
  const [depende, setDepende] = useState(tarea.dependencias?.[0]?.depende_de_id || '')
  const [desfase, setDesfase] = useState(tarea.dependencias?.[0]?.dias_desfase ?? 0)
  const [error, setError] = useState(null)
  const [guardando, setGuardando] = useState(false)
  const [movidas, setMovidas] = useState(null)

  const guardar = async (e) => {
    e.preventDefault()
    setGuardando(true)
    try {
      await api.put(`/api/obras/${obra.id}/cronograma/${tarea.id}/dependencias`,
        depende ? [{ depende_de_id: depende, dias_desfase: Number(desfase) }] : [])
      const r = await api.patch(`/api/obras/${obra.id}/cronograma/${tarea.id}`, {
        fecha_inicio: inicio || null,
        fecha_fin: fin || null,
      })
      if (Number(avance) !== (tarea.avance_pct ?? 0)) {
        await api.post(`/api/obras/${obra.id}/cronograma/${tarea.id}/avance`,
          { avance_pct: Number(avance), fecha: fechaAvance })
      }
      if (r.movidas > 0) { setMovidas(r.movidas); setGuardando(false); return }
      alGuardar()
    } catch (err) { setError(err); setGuardando(false) }
  }

  if (movidas != null) {
    return (
      <div className="ob-pagar__hecho">
        <div className="ob-pagar__hecho-titulo">
          Se corrieron {movidas} tarea(s) que dependían de ésta
        </div>
        <div className="ob-pagar__hecho-saldo">
          Conservaron su duración y su desfase: mover no es reprogramar.
        </div>
        <button className="ob-btn" onClick={alGuardar}>Ver el cronograma</button>
      </div>
    )
  }

  return (
    <form onSubmit={guardar}>
      <Aviso error={error} alCerrar={() => setError(null)} />

      <div className="ob-pagar__monto-fila">
        <label className="ob-campo" style={{ flex: 1 }}>
          <span className="ob-label">Empieza</span>
          <input className="ob-input" type="date" value={inicio}
            onChange={(e) => setInicio(e.target.value)} />
        </label>
        <label className="ob-campo" style={{ flex: 1 }}>
          <span className="ob-label">Termina</span>
          <input className="ob-input" type="date" value={fin}
            onChange={(e) => setFin(e.target.value)} />
        </label>
      </div>

      <div className="ob-pagar__monto-fila">
        <label className="ob-campo" style={{ flex: 2 }}>
          <span className="ob-label">Avance (%)</span>
          <input className="ob-input ob-num" inputMode="decimal" value={avance}
            onChange={(e) => setAvance(e.target.value)} />
          <span className="ob-campo__pie">
            {tarea.avance_fecha
              ? `Último cargado: ${num(tarea.avance_pct, 0)} % el ${fmtFecha(tarea.avance_fecha)}.`
              : 'Todavía no se cargó avance de esta tarea.'}
          </span>
        </label>
        <label className="ob-campo" style={{ flex: 1 }}>
          <span className="ob-label">Medido el</span>
          <input className="ob-input" type="date" value={fechaAvance}
            onChange={(e) => setFechaAvance(e.target.value)} />
        </label>
      </div>

      <label className="ob-campo"><span className="ob-label">Va después de</span>
        <select className="ob-input" value={depende} onChange={(e) => setDepende(e.target.value)}>
          <option value="">Nada — arranca cuando dice la fecha</option>
          {tareas.filter((t) => t.id !== tarea.id).map((t) => (
            <option key={t.id} value={t.id}>{t.rubro} · {t.tarea}</option>
          ))}
        </select>
        <span className="ob-campo__pie">
          Si esa tarea se corre, ésta se corre también.
        </span>
      </label>

      {depende && (
        <label className="ob-campo"><span className="ob-label">Días entre una y otra</span>
          <input className="ob-input ob-num" inputMode="numeric" value={desfase}
            onChange={(e) => setDesfase(e.target.value)} />
          <span className="ob-campo__pie">
            Puede ser negativo: el revoque puede empezar antes de que la
            mampostería termine del todo.
          </span>
        </label>
      )}

      <button className="ob-btn ob-btn--primario ob-pagar__guardar" type="submit"
        disabled={guardando}>
        {guardando ? 'Guardando…' : 'Guardar'}
      </button>
    </form>
  )
}
