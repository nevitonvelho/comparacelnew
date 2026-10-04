"use client";
import { useState } from "react";
import type { PriceHistoryPoint } from "@/lib/price-history";
import { money } from "@/lib/product-model";

const palette=["#df5015","#1670b8","#7c3aed","#16815e","#ad5d00"];
const date=(value:string)=>new Date(value).toLocaleDateString("pt-BR",{day:"2-digit",month:"2-digit",year:"numeric"});
export function PriceHistoryChart({points,stores,unavailable=false}:{points:PriceHistoryPoint[];stores:{id:string;name:string}[];unavailable?:boolean}) {
  const [focus,setFocus]=useState<string|null>(null);
  const ids=[...new Set(points.map(point=>point.storeId))];
  const series=ids.map((id,index)=>{
    const name=stores.find(store=>store.id===id)?.name ?? "Loja";
    const color=/amazon/i.test(name)?"#df5015":/mercado\s*livre/i.test(name)?"#1670b8":palette[(index+2)%palette.length];
    const values=points.filter(point=>point.storeId===id).sort((a,b)=>Date.parse(a.date)-Date.parse(b.date)).slice(-120);
    return {id,name,color,values};
  });
  const all=series.flatMap(store=>store.values.map((point,index)=>({...point,name:store.name,color:store.color,key:`${store.id}:${index}`})));
  const prices=all.map(point=>point.price);
  const low=all.length?Math.min(...prices):0,high=all.length?Math.max(...prices):0;
  const padding=Math.max((high-low)*0.15,high*0.03,1);
  const start=all.length?Math.min(...all.map(point=>Date.parse(point.date))):0;
  const end=all.length?Math.max(...all.map(point=>Date.parse(point.date))):0;
  const position=(point:PriceHistoryPoint)=>({x:end===start?254:58+(Date.parse(point.date)-start)/(end-start)*392,y:174-(point.price-(low-padding))/(high-low+padding*2)*146});
  const chosen=all.find(point=>point.key===focus) ?? all.reduce<(typeof all)[number]|undefined>((latest,point)=>!latest || Date.parse(point.date)>Date.parse(latest.date)?point:latest,undefined);
  const cheapest=all.find(point=>point.price===low),mostExpensive=all.find(point=>point.price===high);
  return <section className="price-history-card" aria-label="Histórico de preços"><h2>Histórico de preços</h2>
    {!all.length?<p>{unavailable?"Não foi possível carregar o histórico agora.":"O histórico aparecerá quando houver preços registrados para este produto."}</p>:<>
      <ul className="price-history-legend" aria-label="Lojas no gráfico">{series.map(store=><li key={store.id}><span className="price-history-swatch" style={{backgroundColor:store.color}} aria-hidden="true" /><span>{store.name}<strong>{money(store.values.at(-1)!.price)}</strong><small>Último registro em {date(store.values.at(-1)!.date)}</small></span></li>)}</ul>
      <p className="price-history-selection" aria-live="polite" style={{color:chosen?.color}}>{chosen && <><span>{chosen.name}<strong>{money(chosen.price)}</strong></span><small>{date(chosen.date)}</small></>}</p>
      <svg viewBox="0 0 480 215" role="group" aria-label={`Histórico de ${series.map(store=>store.name).join(" e ")}. Menor preço ${money(low)}, maior ${money(high)}.`}>
        {[0,0.5,1].map((fraction,index)=>{const value=low-padding+fraction*(high-low+padding*2);const y=174-fraction*146;return <g key={index}><line x1="58" x2="450" y1={y} y2={y} stroke="#e5e7eb" /><text x="52" y={y+4} textAnchor="end" fontSize="11" fill="#68778a">{value.toLocaleString("pt-BR",{maximumFractionDigits:0})}</text></g>;})}
        {series.map((store,storeIndex)=><g key={store.id}>
          <polyline points={store.values.map(point=>{const coord=position(point);return `${coord.x},${coord.y}`;}).join(" ")} fill="none" stroke={store.color} strokeWidth="3" strokeLinejoin="round" strokeDasharray={storeIndex%2?"7 4":undefined} />
          {store.values.map((point,index)=>{const coord=position(point);const key=`${store.id}:${index}`;const label=`${store.name}, ${date(point.date)}: ${money(point.price)}`;return <circle key={key} cx={coord.x} cy={coord.y} r={focus===key?6:4} fill={store.color} stroke="#fff" strokeWidth="1" tabIndex={0} role="button" aria-label={label} onFocus={()=>setFocus(key)} onMouseEnter={()=>setFocus(key)} onClick={()=>setFocus(key)} onKeyDown={event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();setFocus(key);}}}><title>{label}</title></circle>;})}
        </g>)}
        <text x="58" y="203" fontSize="11" fill="#68778a">{date(new Date(start).toISOString())}</text>{end!==start && <text x="450" y="203" textAnchor="end" fontSize="11" fill="#68778a">{date(new Date(end).toISOString())}</text>}
      </svg>
      <div className="price-history-summary"><span>Menor registrado <strong>{money(low)}</strong><small>{cheapest?.name}</small></span><span>Maior registrado <strong>{money(high)}</strong><small>{mostExpensive?.name}</small></span></div>
      <p className="admin-helper price-history-note">{all.length===1?"Primeiro preço registrado. Novas alterações formarão o gráfico.":"Últimas 120 alterações por loja, na mesma escala de preços e datas."} Os valores são dos momentos de consulta; confirme o preço na loja.</p>
    </>}
  </section>;
}
