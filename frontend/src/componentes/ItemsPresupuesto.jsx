import { plata } from '../formato'

export default function ItemsPresupuesto({ items, onChange }) {
  const cambiar = (i, campo, valor) => onChange(items.map((x, n) => n === i ? { ...x, [campo]: valor } : x))
  return <section>
    <h3>Artículos del presupuesto</h3>
    <div className="ob-tablewrap"><table className="ob-table"><thead><tr><th>Descripción</th><th>Cantidad</th><th>Unidad</th><th>Precio unitario final</th><th>Subtotal</th><th /></tr></thead>
      <tbody>{items.map((x, i) => <tr key={i}>
        <td><input className="ob-input" aria-label={`Descripción ${i + 1}`} required maxLength={300} value={x.descripcion} onChange={(e) => cambiar(i, 'descripcion', e.target.value)} /></td>
        <td><input className="ob-input" aria-label={`Cantidad ${i + 1}`} type="number" min="0.0001" step="any" required value={x.cantidad} onChange={(e) => cambiar(i, 'cantidad', e.target.value)} /></td>
        <td><input className="ob-input" aria-label={`Unidad ${i + 1}`} maxLength={8} placeholder="m³" value={x.unidad} onChange={(e) => cambiar(i, 'unidad', e.target.value)} /></td>
        <td><input className="ob-input" aria-label={`Precio ${i + 1}`} type="number" min="0" step="0.01" required value={x.precio_unitario} onChange={(e) => cambiar(i, 'precio_unitario', e.target.value)} /></td>
        <td>{plata(Number(x.cantidad) * Number(x.precio_unitario))}</td>
        <td><button type="button" className="ob-btn" onClick={() => onChange(items.filter((_, n) => n !== i))}>Quitar</button></td>
      </tr>)}</tbody></table></div>
    <button type="button" className="ob-btn" onClick={() => onChange([...items, { descripcion: '', cantidad: 1, unidad: '', precio_unitario: '' }])}>+ Agregar ítem</button>
    <p>Total: <strong>{plata(items.reduce((a, x) => a + Number(x.cantidad) * Number(x.precio_unitario), 0))}</strong>. Ingresá precios finales, con impuestos incluidos.</p>
  </section>
}
