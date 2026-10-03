"use client";
import Link from "next/link";
import {useEffect,useState} from "react";
import {useCatalog} from "./catalog-provider";
import {ProductImage} from "./product-image";
import {UiIcon} from "./icons";
import {comparisonSlug} from "@/lib/product-model";
type Item={id:string;productIds:string[];category:string;views:number};
export function PopularComparisons({category}:{category:string}) {
  const {products}=useCatalog();
  const [state,setState]=useState<{category:string;items:Item[];error:boolean}|null>(null);
  useEffect(()=>{
    let active=true;
    async function load(){try{
      const response=await fetch(`/api/popular-comparisons?category=${encodeURIComponent(category)}`);
      if(!response.ok)throw new Error("Comparações indisponíveis");
      const data=await response.json();
      if(active)setState({category,items:data.comparisons,error:false});
    }catch{if(active)setState({category,items:[],error:true});}}
    void load();
    const timer=setInterval(()=>{if(document.visibilityState==="visible")void load();},60000);
    return()=>{active=false;clearInterval(timer);};
  },[category]);
  const current=state?.category===category?state:null;
  return <section className="popular-comparisons" aria-label="Comparações mais acessadas"><div className="feed-heading"><h2><UiIcon name="compare" /> Mais comparados</h2><span>Últimos 7 dias</span></div><p className="popular-intro">Os pares que mais despertam interesse. Aparecem aqui automaticamente conforme as pessoas comparam.</p>{!current?<p role="status">Carregando comparações…</p>:current.error?<p role="alert">Não foi possível carregar as comparações mais acessadas.</p>:!current.items.length?<p className="popular-empty">Ainda não há acessos registrados nesta categoria. Escolha dois produtos para começar.</p>:<div className="popular-pairs">{current.items.map((item,index)=>{
    const pair=item.productIds.map(id=>products.find(product=>product.id===id));
    if(!pair.every(Boolean))return null;
    return <Link href={`/comparar/${comparisonSlug(item.productIds)}`} className="popular-pair" key={item.id}><div className="popular-pair-top"><span>#{index+1}</span><small>{item.views.toLocaleString("pt-BR")} {item.views===1?"acesso":"acessos"}</small></div><div className="popular-pair-products">{pair.map(product=><div key={product!.id}><ProductImage name={product!.name} url={product!.imageUrl} sizes="150px" /><strong>{product!.name}</strong></div>)}</div><span className="popular-pair-link">Ver comparação<UiIcon name="right"/></span></Link>;
  })}</div>}<details className="popular-method"><summary>O que entra nesta lista?</summary><p>Conta acessos às fichas com dois produtos da mesma categoria, incluindo visitantes sem login. Um navegador registra um acesso por par a cada 30 minutos. A lista considera os últimos 7 dias, incluindo hoje, e atualiza em até um minuto. A lista mostra os produtos e a quantidade de acessos, sem identificar quem comparou.</p></details></section>;
}
