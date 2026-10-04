"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { comparisonRecommendations, cleanNoticeLedger, appendNotice, suggestionSpacing, suggestionLifetime, type NoticeLedger, type ComparisonSuggestion } from "@/lib/product-recommendations";
import { useAuth } from "./auth-provider";
import { useLibrary } from "./library-provider";
import { useCatalog } from "./catalog-provider";
import { UiIcon } from "./icons";
export function Notifications() {
  const {user}=useAuth();const {items,loading,error:libraryError}=useLibrary();const {products,status:catalogStatus}=useCatalog();
  const pathname=usePathname();
  const [open,setOpen]=useState(false);
  const [state,setState]=useState<{uid:string;suggestions:ComparisonSuggestion[]}|null>(null);
  const memory=useRef<{key:string;value:NoticeLedger}|null>(null);
  const [tick,setTick]=useState(0);
  const container=useRef<HTMLDivElement>(null);
  useEffect(()=>{
    if(!user || loading || libraryError || catalogStatus!=="ready" || pathname.startsWith("/admin")) return;
    const now=Date.now();
    const key=`comparacel-notifications-v3:${user.uid}`;
    let stored:unknown=memory.current?.key===key?memory.current.value:null;
    try { const saved=localStorage.getItem(key);if(saved)stored=JSON.parse(saved);localStorage.removeItem(`comparacel-notifications-v2:${user.uid}`); } catch { /* Use memory if storage is unavailable. */ }
    const ledger=cleanNoticeLedger(stored,now);
    const productId=pathname.startsWith("/produto/")?decodeURIComponent(pathname.slice(9)):null;
    const category=pathname.split("/")[1];
    const visited=productId?products.filter(item=>item.id===productId):products.filter(item=>item.category===category).slice(0,6);
    const favorites=[...visited.map(item=>({productIds:[item.id],createdAt:now})),...items.likedProducts];
    const skipped=[...items.savedComparisons,...items.likedComparisons,...[...ledger.issued,...ledger.messages.map(item=>item.pair)].map(pair=>({productIds:pair.split("-vs-")}))];
    const recommended=comparisonRecommendations(products,favorites,skipped,now);
    const candidate=recommended[0];
    const created=candidate && document.visibilityState!=="hidden"?appendNotice(ledger,candidate.id,now):false;
    const suggestions=ledger.messages.flatMap(message=>{
      const [first,second]=message.pair.split("-vs-");
      const product=products.find(item=>item.id===first);const alternative=products.find(item=>item.id===second);
      if(!product || !alternative || product.category!==alternative.category) return [];
      return [{id:message.pair,product,alternative,reason:"Uma alternativa da mesma categoria para você comparar.",createdAt:message.createdAt,href:`/comparar/${message.pair}`}];
    });
    if(created && ledger.shownDay!==ledger.day){setOpen(true);ledger.shownDay=ledger.day;}
    memory.current={key,value:ledger};
    try {localStorage.setItem(key,JSON.stringify(ledger));} catch { /* Keep the daily cap in memory. */ }
    setState({uid:user.uid,suggestions});
    // One pending timeout, bounded by the daily cap; no polling or background work.
    const nextSuggestion=candidate && ledger.count<6?Math.max(now+1000,ledger.lastAt+suggestionSpacing):Infinity;
    const nextExpiry=ledger.messages.length?Math.min(...ledger.messages.map(item=>item.createdAt+suggestionLifetime)):Infinity;
    const due=Math.min(nextSuggestion,nextExpiry);
    const timer=document.visibilityState!=="hidden" && Number.isFinite(due)?setTimeout(()=>setTick(value=>value+1),Math.max(1000,due-now)):null;
    const resume=()=>{if(document.visibilityState!=="hidden")setTick(value=>value+1);};
    window.addEventListener("focus",resume);document.addEventListener("visibilitychange",resume);
    return()=>{if(timer!==null)clearTimeout(timer);window.removeEventListener("focus",resume);document.removeEventListener("visibilitychange",resume);};
  },[user,loading,libraryError,products,catalogStatus,items,pathname,tick]);
  useEffect(()=>{
    if(!open)return;
    const close=(event:PointerEvent)=>{if(container.current && !container.current.contains(event.target as Node))setOpen(false);};
    const escape=(event:KeyboardEvent)=>{if(event.key==="Escape"){setOpen(false);container.current?.querySelector<HTMLButtonElement>("button")?.focus();}};
    document.addEventListener("pointerdown",close);document.addEventListener("keydown",escape);
    return()=>{document.removeEventListener("pointerdown",close);document.removeEventListener("keydown",escape);};
  },[open]);
  if(!user)return null;
  const ready=state?.uid===user.uid;
  const suggestions=ready?state.suggestions:[];
  const unread=suggestions.length;
  function markRead(id:string){
    if(!memory.current || memory.current.key!==`comparacel-notifications-v3:${user!.uid}`)return;
    const ledger=memory.current.value;
    ledger.messages=ledger.messages.filter(item=>item.pair!==id);
    try{localStorage.setItem(memory.current.key,JSON.stringify(ledger));}catch{ /* Retain changes for this visit. */ }
    setState(old=>old?.uid===user!.uid?{...old,suggestions:old.suggestions.filter(item=>item.id!==id)}:old);
  }
  return <div className="notifications" ref={container}><button type="button" className="header-icon-button" aria-label={`Notificações${unread?`, ${unread} não lidas`:""}`} title="Notificações" aria-expanded={open} aria-controls="notifications-panel" onClick={()=>setOpen(value=>!value)}><UiIcon name="bell" />{unread>0 && <span className="notification-count">{unread}</span>}</button>{open && <section className="notification-panel" id="notifications-panel" aria-label="Notificações"><div className="notification-heading"><strong>Notificações</strong><button type="button" className="header-icon-button" aria-label="Fechar notificações" onClick={()=>setOpen(false)}><UiIcon name="close" /></button></div><p>Sugestões baseadas nos produtos visitados e nos seus favoritos.</p>{libraryError?<p role="alert">Não foi possível carregar seus favoritos.</p>:loading || !ready && !pathname.startsWith("/admin")?<p role="status">Carregando…</p>:!suggestions.length?<p>Explore uma categoria, visite um produto ou marque um favorito para receber sugestões. Até seis por dia, com intervalo de 10 minutos.</p>:<ul>{suggestions.map(item=><li key={item.id} className="unread"><strong>Compare {item.product.name}</strong><p>Que tal comparar com {item.alternative.name}? {item.reason}</p><div><Link href={item.href} className="section-link" onClick={()=>{setOpen(false);void markRead(item.id);}}>Comparar produtos <UiIcon name="right" /></Link>{<button type="button" className="text-button" onClick={()=>void markRead(item.id)}>Marcar como lida</button>}</div></li>)}</ul>}</section>}</div>;
}
