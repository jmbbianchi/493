import { useEffect, useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import * as api from '../api'
import Aviso from '../componentes/Aviso'
import Modal from '../componentes/Modal'
import { fecha as fmtFecha } from '../formato'

/**
 * Quién entra y a qué obra. Es la segunda capa, y la maneja el dueño.
 *
 * Entra dice quién sos; esto dice si podés pasar. Alguien puede
 * autenticarse perfecto y no entrar: porque nunca fue habilitado, porque
 * se dio de baja, o —el día que la app se cobre— porque no pagó.
 *
 * Se habilita por email y antes de que la persona entre por primera vez.
 * El identificador que da Entra no existe hasta que entra, y para entrar
 * tiene que estar habilitada: el email es lo único que se sabe de antemano.
 */
export default function Usuarios() {
  const { obra } = useOutletContext()
  const [usuarios, setUsuarios] = useState(null)
  const [obras, setObras] = useState([])
  const [error, setError] = useState(null)
  const [invitando, setInvitando] = useState(false)
  const [editando, setEditando] = useState(null)

  const cargar = async () => {
    try {
      const [u, o] = await Promise.all([
        api.get('/api/usuarios'),
        api.get('/api/obras'),
      ])
      setUsuarios(u); setObras(o)
    } catch (e) { setError(e) }
  }
  useEffect(() => { cargar() }, [])

  const cambiarEstado = async (u, estado) => {
    try {
      await api.patch(`/api/usuarios/${u.id}`, { estado })
      await cargar()
    } catch (e) { setError(e) }
  }

  if (error) return <Aviso error={error} alCerrar={() => setError(null)} />
  if (!usuarios) return <p className="ob-cargando">Cargando…</p>

  return (
    <>
      <div className="ob-toolbar">
        <span className="ob-label">Quién tiene acceso</span>
        <span className="ob-toolbar__meta">
          {usuarios.filter((u) => u.estado === 'activo').length} activo(s) de {usuarios.length}
          <button className="ob-btn ob-btn--primario" onClick={() => setInvitando(true)}
            style={{ marginLeft: 'var(--ob-gap-3)' }}>Habilitar a alguien</button>
        </span>
      </div>

      <p className="ob-nota">
        Se habilita por email, antes de que la persona entre por primera vez.
        Cuando entre con su cuenta, la app la reconoce por ese email y le abre
        sólo las obras que le hayas dado.
      </p>

      <div className="ob-tablewrap">
        <table className="ob-table">
          <thead>
            <tr>
              <th>Email</th><th>Nombre</th><th>Rol</th>
              <th className="ob-num">Obras</th>
              <th>Último acceso</th><th>Estado</th><th></th>
            </tr>
          </thead>
          <tbody>
            {usuarios.map((u) => (
              <tr key={u.id}>
                <td>{u.email}</td>
                <td className="ob-table__strong">{u.nombre}</td>
                <td className="ob-table__sec">
                  {u.rol_global === 'duenio' ? 'Dueño' : 'Cliente'}
                </td>
                <td className="ob-num">{u.obras}</td>
                <td className="ob-table__sec">
                  {u.ultimo_acceso ? fmtFecha(u.ultimo_acceso)
                    : (u.entro_alguna_vez ? '—' : 'nunca entró')}
                </td>
                <td>
                  <span className={`ob-chip ob-chip--${
                    u.estado === 'activo' ? 'ok' : u.estado === 'suspendido' ? 'bad' : 'mudo'}`}>
                    {u.estado}
                  </span>
                </td>
                <td style={{ width: '13rem' }}>
                  <button className="ob-btn" style={{ padding: '.05rem .4rem' }}
                    onClick={() => setEditando(u)}>Obras</button>
                  {u.estado !== 'activo' ? (
                    <button className="ob-btn" style={{ padding: '.05rem .4rem', marginLeft: '.3rem' }}
                      onClick={() => cambiarEstado(u, 'activo')}>Habilitar</button>
                  ) : (
                    <button className="ob-btn" style={{ padding: '.05rem .4rem', marginLeft: '.3rem' }}
                      onClick={() => cambiarEstado(u, 'suspendido')}>Suspender</button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="ob-nota">
        Suspender no borra nada: la persona se sigue autenticando bien con su
        cuenta y la app le dice que no. Su historial de obras queda intacto, que
        es justo lo que hace falta si algún día vuelve.
      </p>

      {invitando && (
        <Modal titulo="Habilitar a alguien"
          bajada="Con el email alcanza. Cuando entre con su cuenta, la app lo reconoce."
          alCerrar={() => setInvitando(false)}>
          <Invitar alCrear={() => { setInvitando(false); cargar() }} />
        </Modal>
      )}

      {editando && (
        <Modal titulo={`Obras de ${editando.nombre}`}
          bajada="A qué obras llega y con qué permiso."
          alCerrar={() => setEditando(null)}>
          <ObrasDe usuario={editando} obras={obras}
            alGuardar={() => { setEditando(null); cargar() }} />
        </Modal>
      )}
    </>
  )
}

function Invitar({ alCrear }) {
  const [d, setD] = useState({ email: '', nombre: '', rol_global: 'cliente', notas: '' })
  const [error, setError] = useState(null)
  const [guardando, setGuardando] = useState(false)
  const set = (k) => (e) => setD({ ...d, [k]: e.target.value })

  const guardar = async (e) => {
    e.preventDefault()
    setGuardando(true)
    try { await api.post('/api/usuarios', d); alCrear() }
    catch (err) { setError(err); setGuardando(false) }
  }

  return (
    <form onSubmit={guardar}>
      <Aviso error={error} alCerrar={() => setError(null)} />
      <label className="ob-campo"><span className="ob-label">Email</span>
        <input className="ob-input" type="email" required value={d.email}
          onChange={set('email')} placeholder="arquitecta@estudio.com" />
        <span className="ob-campo__pie">
          Tiene que ser el mismo con el que va a entrar.
        </span>
      </label>
      <label className="ob-campo"><span className="ob-label">Nombre</span>
        <input className="ob-input" required value={d.nombre} onChange={set('nombre')}
          placeholder="Arq. López" />
      </label>
      <label className="ob-campo"><span className="ob-label">Rol</span>
        <select className="ob-input" value={d.rol_global} onChange={set('rol_global')}>
          <option value="cliente">Cliente — ve sólo las obras que le des</option>
          <option value="duenio">Dueño — ve todo y administra el acceso</option>
        </select>
      </label>
      <label className="ob-campo"><span className="ob-label">Notas</span>
        <input className="ob-input" value={d.notas} onChange={set('notas')}
          placeholder="Opcional — para acordarte quién es" />
      </label>
      <button className="ob-btn ob-btn--primario ob-pagar__guardar" type="submit"
        disabled={guardando}>
        {guardando ? 'Guardando…' : 'Habilitar'}
      </button>
    </form>
  )
}

function ObrasDe({ usuario, obras, alGuardar }) {
  const [roles, setRoles] = useState(null)
  const [error, setError] = useState(null)
  const [guardando, setGuardando] = useState(false)

  useEffect(() => {
    api.get(`/api/usuarios/${usuario.id}/obras`)
      .then((suyas) => {
        const m = {}
        for (const o of suyas) m[o.id] = o.rol
        setRoles(m)
      })
      .catch(setError)
  }, [usuario.id])

  const guardar = async (e) => {
    e.preventDefault()
    setGuardando(true)
    try {
      await api.put(`/api/usuarios/${usuario.id}/obras`,
        Object.entries(roles).filter(([, r]) => r)
          .map(([obra_id, rol]) => ({ obra_id, rol })))
      alGuardar()
    } catch (err) { setError(err); setGuardando(false) }
  }

  if (!roles) return <p className="ob-cargando">Cargando…</p>

  return (
    <form onSubmit={guardar}>
      <Aviso error={error} alCerrar={() => setError(null)} />
      {obras.map((o) => (
        <label className="ob-campo" key={o.id}>
          <span className="ob-label">{o.nombre}</span>
          <select className="ob-input" value={roles[o.id] ?? ''}
            onChange={(e) => setRoles({ ...roles, [o.id]: e.target.value })}>
            <option value="">Sin acceso</option>
            <option value="lectura">Lectura — mira y no toca</option>
            <option value="editor">Editor — carga y modifica</option>
          </select>
        </label>
      ))}
      <button className="ob-btn ob-btn--primario ob-pagar__guardar" type="submit"
        disabled={guardando}>
        {guardando ? 'Guardando…' : 'Guardar'}
      </button>
    </form>
  )
}
