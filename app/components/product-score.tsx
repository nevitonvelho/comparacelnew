"use client";
import { useEffect,useState } from "react";
import { useCatalog } from "./catalog-provider";
import { useReactionStats } from "./reactions";
import { medianPrice,productScore,type ProductMetrics } from "@/lib/product-score";

type Entry={value:ProductMetrics|null;failed:boolean;updated:number;listeners:Set<()=>void>};
const entries=new Map<string,Entry>();
const queued=new Set<string>();
let timer:ReturnType<typeof setTimeout>|null=null;
function entry(id:string){let current=entries.get(id);if(!current){current={value:null,failed:false,updated:0,listeners:new Set()};entries.set(id,current);}return current;}
function enqueue(id:string){queued.add(id);if(!timer)timer=setTimeout(flush,20);}
async function flush(){
  timer=null;
  const ids=[...queued].slice(0,24);ids.forEach(id=>queued.delete(id));
  if(queued.size)timer=setTimeout(flush,20);
  try{
    const response=await fetch("/api/product-metrics",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({ids})});
    if(!response.ok)throw new Error("Métricas indisponíveis");
    const result=await response.json();
    for(const id of ids){const current=entry(id);current.value=result.products[id]??null;current.failed=!current.value;current.updated=Date.now();current.listeners.forEach(notify=>notify());}
  }catch{for(const id of ids){const current=entry(id);current.failed=true;current.updated=Date.now();current.listeners.forEach(notify=>notify());}}
}
function useMetrics(id:string){
  const [state,setState]=useState<{id:string;value:ProductMetrics|null;failed:boolean}|null>(null);
  useEffect(()=>{
    const current=entry(id);
    const notify=()=>setState({id,value:current.value,failed:current.failed});
    current.listeners.add(notify);notify();
    if(Date.now()-current.updated>60000)enqueue(id);
    const refresh=()=>{if(document.visibilityState==="visible")enqueue(id);};
    const interval=setInterval(refresh,60000);
    window.addEventListener("comparacel-metrics-change",refresh);
    return()=>{current.listeners.delete(notify);clearInterval(interval);window.removeEventListener("comparacel-metrics-change",refresh);};
  },[id]);
  return state?.id===id?state:null;
}
export function ProductScore({productId,explain=false}:{productId:string;explain?:boolean}){
  const {products}=useCatalog();
  const product=products.find(item=>item.id===productId);
  const metrics=useMetrics(productId);
  const reactions=useReactionStats(`product:${productId}`);
  const median=medianPrice(products.filter(item=>item.category===product?.category).map(item=>item.price));
  const result=product&&metrics?.value&&reactions&&!reactions.error&&!metrics.failed?productScore(metrics.value,reactions.counts,product.price,median):null;
  const label=result?result.value.toLocaleString("pt-BR",{minimumFractionDigits:1,maximumFractionDigits:1}):"—";
  const hue=result?(result.value-1)/9*130:0;
  const circle=<span className={`product-score-circle ${result?.provisional?"score-provisional":""} ${!result?"score-pending":""}`} style={result?{borderColor:`hsl(${hue} 65% 40%)`,color:`hsl(${hue} 65% 25%)`,background:`hsl(${hue} 75% 95%)`}:undefined} title={result?`Índice Comparacel: ${label}/10${result.provisional?" · provisório, menos de 10 avaliações":""}. Preço, reações, favoritos, salvamentos e visitas.`:"Nota indisponível no momento"} aria-label={result?`Índice Comparacel ${label} de 10${result.provisional?", provisório":""}`:"Índice Comparacel indisponível"}>{label}</span>;
  if(!explain)return circle;
  return <section className="product-score-detail"><div>{circle}<span><strong>Índice Comparacel</strong><small>{result?.provisional?"Nota provisória · poucas avaliações":"Preço e interesse da comunidade"}</small></span></div><details><summary>Como esta nota é calculada?</summary><p>De 1 a 10: reações têm peso de 50%, preço relativo à categoria 20%, favoritos 15%, pessoas que salvaram comparações com este produto 10% e visitas 5%. Preço ausente redistribui seu peso. Reações usam a média suavizada explicada abaixo; atividade cresce de forma gradual, com limite de influência. Sem atividade, esses sinais começam no meio da escala, para não penalizar um produto novo.</p><p>O índice expressa interesse e preço relativo, sem substituir a análise da ficha técnica. Preços mais baixos dentro da categoria favorecem a nota, sem afirmar que os produtos têm as mesmas características. Menos de 10 avaliações deixa a nota provisória; a borda tracejada indica essa condição.</p>{metrics?.value&&<p>{metrics.value.views} visitas · {metrics.value.favorites} favoritos · {metrics.value.saved} pessoas salvaram comparações com este produto.</p>}</details></section>;
}
