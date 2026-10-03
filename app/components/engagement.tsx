"use client";
import { useEffect, useState } from "react";
import { useLibrary } from "./library-provider";
import { popularity, type Engagement, type PageKind } from "@/lib/engagement-model";

// Share pending requests across mounts and serialize them so the first response
// establishes the visitor cookie before another page records a visit.
const pending=new Map<string,Promise<Engagement>>();
let queue:Promise<unknown>=Promise.resolve();
function loadCounts(kind:PageKind,key:string,favorite:boolean) {
  const requestKey=`${kind}:${key}:${favorite}`;
  const existing=pending.get(requestKey);
  if(existing)return existing;
  const request=queue.catch(()=>{}).then(async()=>{
    const response=await fetch("/api/engagement",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({kind,productIds:JSON.parse(key)})});
    if(!response.ok)throw new Error("Estatísticas indisponíveis");
    return await response.json() as Engagement;
  });
  queue=request;
  pending.set(requestKey,request);
  void request.then(()=>pending.delete(requestKey),()=>pending.delete(requestKey));
  return request;
}

export function PageEngagement({kind,productIds}:{kind:PageKind;productIds:string[]}) {
  const key=JSON.stringify([...productIds].sort());
  const {items}=useLibrary();
  const libraryKind=kind==="product"?"likedProducts":"likedComparisons";
  const favorite=items[libraryKind].some(item=>JSON.stringify([...item.productIds].sort())===key);
  const [state,setState]=useState<{key:string;counts:Engagement|null;failed:boolean}|null>(null);
  const stateKey=`${kind}:${key}`;
  useEffect(()=>{
    let active=true;
    const load=async()=>{
      if(document.visibilityState!=="visible")return;
      try {
        const counts=await loadCounts(kind,key,favorite);
        if(active)setState({key:stateKey,counts,failed:false});
      } catch { if(active)setState({key:stateKey,counts:null,failed:true}); }
    };
    void load();
    document.addEventListener("visibilitychange",load);
    return ()=>{active=false;document.removeEventListener("visibilitychange",load);};
  },[kind,key,stateKey,favorite]);
  const current=state?.key===stateKey?state:null;
  if(current?.failed)return <div className="page-engagement stats-unavailable">Estatísticas indisponíveis no momento.</div>;
  if(!current?.counts)return <div className="page-engagement" role="status">Carregando estatísticas…</div>;
  const {counts}=current;
  const heat=popularity(counts);
  const format=(value:number)=>value.toLocaleString("pt-BR");
  return <section className={`page-engagement ${kind==="product"?"product-engagement":"comparison-engagement"}`} aria-label={kind==="product"?"Popularidade do produto":"Visitas da comparação"}>
    <div className="engagement-counts"><span><strong>{format(counts.views)}</strong> {counts.views===1?"visita":"visitas"}</span><span><strong>{format(counts.likes)}</strong> {counts.likes===1?"favorito":"favoritos"}</span></div>
    {kind==="product"&&<div className="product-thermometer"><div className="thermometer-heading"><strong>Termômetro de interesse</strong><span>{heat.label}</span></div><div className="thermometer-scale" role="meter" aria-label="Popularidade do produto" aria-valuemin={0} aria-valuemax={5} aria-valuenow={heat.level} aria-valuetext={heat.label}>{[1,2,3,4,5].map(level=><span key={level} className={level<=heat.level?`heated heat-${heat.level}`:""} />)}</div><details><summary>Como funciona?</summary><p>Indica interesse, sem avaliar a qualidade do produto. Cada visita vale 1 ponto e cada favorito vale 10. As faixas começam em 0, 25, 100, 300 e 1.000 pontos. Uma visita por navegador a cada 30 minutos; o total começou com este recurso.</p></details></div>}
    {kind==="comparison"&&<small>Uma visita por navegador a cada 30 minutos.</small>}
  </section>;
}
