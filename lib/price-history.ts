export type PriceHistoryPoint = { date: string; price: number; storeId: string };
export function priceHistoryPoints(rows: Record<string,unknown>[]): PriceHistoryPoint[] {
  return rows.flatMap(row=>{
    const date=typeof row.recorded_at==='string'?row.recorded_at:'';
    const price=typeof row.priceCents==='number'?row.priceCents/100:Number(row.price);
    if(!Number.isFinite(Date.parse(date)) || !Number.isFinite(price) || price<=0)return [];
    return [{date,price,storeId:String(row.storeId ?? row.store ?? '')}];
  }).sort((a,b)=>Date.parse(a.date)-Date.parse(b.date));
}

/** Daily observed minimum, without carrying stale offers into unobserved days. */
export function unifiedPriceHistory(points: PriceHistoryPoint[]) {
  const days = new Map<string, PriceHistoryPoint>();
  for (const point of points) {
    if (!Number.isFinite(Date.parse(point.date)) || !Number.isFinite(point.price) || point.price <= 0) continue;
    const day = new Date(point.date).toISOString().slice(0, 10);
    const previous = days.get(day);
    if (!previous || point.price < previous.price) days.set(day, point);
  }
  return [...days.values()].sort((a,b) => Date.parse(a.date)-Date.parse(b.date));
}
export function priceIntelligence(points: PriceHistoryPoint[], now = Date.now()) {
  const observations=points.filter(point => Date.parse(point.date) <= now && Number.isFinite(point.price) && point.price > 0);
  const daily = unifiedPriceHistory(observations);
  const window = (days: number) => daily.filter(point => Date.parse(point.date) >= now-days*86400000);
  const sufficient = (values: PriceHistoryPoint[]) => values.length >= 7 && Date.parse(values.at(-1)!.date)-Date.parse(values[0].date) >= 14*86400000;
  const average = (days: number) => {
    const values=window(days);
    return sufficient(values) ? values.reduce((sum,point)=>sum+point.price,0)/values.length : null;
  };
  const recent = window(7);
  const minimum = daily.length ? Math.min(...daily.map(point=>point.price)) : null;
  const maximum = daily.length ? Math.max(...observations.map(point=>point.price)) : null;
  const recentMinimum = recent.length ? Math.min(...recent.map(point=>point.price)) : null;
  const average30=average(30), average90=average(90), average180=average(180);
  const discount=average30 !== null && recentMinimum !== null ? (1-recentMinimum/average30)*100 : null;
  return {daily, minimum, maximum, recentMinimum, average30, average90, average180, discount,
    difference: minimum !== null && recentMinimum !== null ? recentMinimum-minimum : null,
    classification: discount === null ? 'Sem classificação' : discount >= 10 ? 'Abaixo da média' : discount <= -10 ? 'Acima da média' : 'Na média',
    observedDays: daily.length};
}
