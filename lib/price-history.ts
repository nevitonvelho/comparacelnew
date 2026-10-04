export type PriceHistoryPoint = { date: string; price: number; storeId: string };
export function priceHistoryPoints(rows: Record<string,unknown>[]): PriceHistoryPoint[] {
  return rows.flatMap(row=>{
    const date=typeof row.recorded_at==='string'?row.recorded_at:'';
    const price=typeof row.priceCents==='number'?row.priceCents/100:Number(row.price);
    if(!Number.isFinite(Date.parse(date)) || !Number.isFinite(price) || price<=0)return [];
    return [{date,price,storeId:String(row.storeId ?? row.store ?? '')}];
  }).sort((a,b)=>Date.parse(a.date)-Date.parse(b.date));
}
