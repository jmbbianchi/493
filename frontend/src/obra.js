export function superficieCalculo(obra) {
  if(obra.sup_cubierta == null)return null
  const cubierta=Number(obra.sup_cubierta)
  if(obra.criterio_m2==='cubierta_mas_medio_semi')return cubierta+Number(obra.sup_semicubierta || 0)/2
  if(obra.criterio_m2==='total')return cubierta+Number(obra.sup_semicubierta || 0)+Number(obra.sup_descubierta || 0)
  return cubierta
}
