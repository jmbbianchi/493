const centavos = valor => Math.round(Number(String(valor).replace(',', '.')) * 100)

export function totalAcuerdo(cuotas) {
  return cuotas.reduce((total, c) => total + centavos(c.monto_nominal), 0) / 100
}

export function repartirAcuerdo(cuotas, monto) {
  const total = centavos(monto)
  const fijas = cuotas.filter(c => c.con_pagos).reduce((s,c) => s + centavos(c.monto_nominal), 0)
  const libres = cuotas.filter(c => !c.con_pagos)
  const disponible = total - fijas
  if (!Number.isFinite(total) || !libres.length || disponible < libres.length)
    throw new Error('El total debe cubrir las cuotas con pagos y dejar un importe positivo para cada desembolso editable.')
  const base = libres.reduce((s,c) => s + Math.max(0,centavos(c.monto_nominal) || 0),0)
  let resto = disponible, pendientes = libres.length
  return cuotas.map(c => {
    if(c.con_pagos)return c
    pendientes--
    const proporcional = base ? Math.round(disponible * Math.max(0,centavos(c.monto_nominal) || 0) / base) : Math.floor(disponible / libres.length)
    const valor = pendientes ? Math.max(1,Math.min(resto-pendientes,proporcional)) : resto
    resto -= valor
    return {...c,monto_nominal:(valor/100).toFixed(2)}
  })
}
