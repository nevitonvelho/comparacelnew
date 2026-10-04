"use client";
import { useEffect, useRef, useState } from "react";
import { UiIcon } from "./icons";
import Link from "next/link";
import type { User } from "firebase/auth";
import type { AdminProduct } from "@/lib/admin-model";
import { AdminError } from "@/lib/admin-model";
import { readPriceRefreshJob, type PriceRefreshJob } from "@/lib/admin-price-progress";
import { adminRequest } from "./admin-client";
export function AdminPriceRefresh({user,products,onFinished,onRunning,disabled=false,onRefreshProduct,refreshingProductId}:{user:User;products:AdminProduct[];onFinished:()=>Promise<void>;onRunning:(running:boolean)=>void;disabled?:boolean;onRefreshProduct:(id:string)=>Promise<string>;refreshingProductId:string|null}) {
  const [manualResults,setManualResults]=useState<Record<string,string>>({});
  const [running,setRunning]=useState(false);
  const [job,setJob]=useState<PriceRefreshJob|null>(null);
  const [message,setMessage]=useState("");
  const [storageError,setStorageError]=useState(false);
  const [ready,setReady]=useState(false);
  const stop=useRef(false);const active=useRef(true);const lock=useRef(false);
  const storageKey=`comparacel-price-refresh-v1:${user.uid}`;
  useEffect(()=>{
    active.current=true;
    void Promise.resolve().then(()=>{
      if(!active.current)return;
      try { setJob(readPriceRefreshJob(localStorage.getItem(storageKey))); }
      catch { setStorageError(true); }
      setReady(true);
    });
    return()=>{active.current=false;stop.current=true;};
  },[storageKey]);
  function save(next:PriceRefreshJob) {
    next.updatedAt=Date.now();
    try { localStorage.setItem(storageKey,JSON.stringify(next)); }
    catch { if(active.current)setStorageError(true); }
    if(active.current)setJob({...next,errors:[...next.errors]});
  }
  async function start(resume:boolean) {
    if(lock.current || !ready || disabled)return;
    const queue=products.flatMap(product=>product.offers.filter(offer=>offer.available && offer.url).map(offer=>({id:product.id,name:product.name,offerId:offer.id}))).slice(0,500);
    const next:PriceRefreshJob=resume && job ? {...job,errors:[...job.errors]} : {version:1,queue,next:0,changed:0,skipped:0,failed:0,checked:0,errors:[],updatedAt:Date.now()};
    if(!next.queue.length){setMessage("Nenhuma oferta disponível nesta lista.");return;}
    lock.current=true;stop.current=false;setRunning(true);onRunning(true);save(next);
    try {
      // Also respect the interval when resuming immediately after a pause.
      if(resume)await new Promise(resolve=>setTimeout(resolve,Math.max(0,4100-(Date.now()-(job?.updatedAt ?? 0)))));
      while(next.next<next.queue.length) {
        if(stop.current || !active.current)break;
        const item=next.queue[next.next];
        setMessage(`Conferindo ${next.next+1}/${next.queue.length}: ${item.name}`);
        let accessFailure=false;
        try {
          const request=()=>adminRequest<{changed:boolean;skipped?:boolean;message:string}>(user,`products/${encodeURIComponent(item.id)}/price`,{method:"POST",body:JSON.stringify({offerId:item.offerId})});
          let result;
          try {result=await request();}
          catch(error) {
            if(!(error instanceof AdminError) || error.status!==429 || !error.retryAfterMs || error.retryAfterMs>120000)throw error;
            const until=Date.now()+error.retryAfterMs;
            setMessage("Aguardando o intervalo de consulta ou outra atualização terminar…");
            while(Date.now()<until && !stop.current && active.current)await new Promise(resolve=>setTimeout(resolve,Math.min(1000,until-Date.now())));
            if(stop.current || !active.current)break;
            result=await request();
          }
          if(result.changed)next.changed++;else if(result.skipped)next.skipped++;else next.checked++;
          if(result.skipped || result.message.startsWith("Preço não retornado"))next.errors.push({productId:item.id,message:`${item.name}: ${result.message}`});
        } catch(error) {
          if(error instanceof AdminError && error.status===429 && error.retryAfterMs!==undefined) {
            // Keep the current offer pending: no source request was made.
            next.errors.push({productId:item.id,message:`${item.name}: Limite interno de consultas. Aguarde ${Math.ceil(error.retryAfterMs/60000)} minuto(s) e continue; esta oferta permanece pendente.`});
            save(next);stop.current=true;break;
          }
          next.failed++;next.errors.push({productId:item.id,message:`${item.name}: ${error instanceof Error?error.message:"Falha na consulta."}`});
          accessFailure=!!(error && typeof error==='object' && 'status' in error && [401,403].includes(Number(error.status)));
          if(accessFailure)stop.current=true;
        }
        // Failed source checks are finished for this batch; manual refresh can retry later.
        if(!accessFailure)next.next++;
        next.errors=next.errors.filter((entry,index,list)=>!list.slice(index+1).some(other=>other.productId===entry.productId && other.message===entry.message)).slice(-20);
        save(next);
        if(next.next<next.queue.length && !stop.current && active.current)await new Promise(resolve=>setTimeout(resolve,4100));
      }
      if(active.current){
        setMessage(`${next.next<next.queue.length?"Atualização pausada":"Atualização concluída"}: ${next.changed} preços alterados, ${next.checked} conferidos, ${next.skipped} ignorados e ${next.failed} falhas.`);
        try{await onFinished();}catch{next.errors=[...next.errors,{message:"Atualize o painel para recarregar os preços."}].slice(-20);save(next);}
      }
    } finally {lock.current=false;if(active.current){setRunning(false);onRunning(false);}}
  }
  const pending=job && job.next<job.queue.length;
  return <section className="admin-price-refresh">
    <div className="price-refresh-heading"><div><h2>Atualização de preços</h2><p>Falhas preservam o último preço. Lojas com bloqueio têm um intervalo de 15 minutos; o lote segue com as demais ofertas.</p></div><div className="price-refresh-controls">
      {pending && <button type="button" className="button primary" disabled={disabled || running || !ready} onClick={()=>void start(true)}><UiIcon name="play" />Continuar ({job.queue.length-job.next})</button>}
      <button type="button" className="button secondary" disabled={disabled || running || !ready || !products.length} onClick={()=>void start(false)}><UiIcon name={job?"refresh":"play"} />{running?"Atualizando…":job?"Começar do zero":"Atualizar lista"}</button>
      {running && <button type="button" className="button secondary" onClick={()=>{stop.current=true;setMessage("Parando após a oferta em andamento…");}}><UiIcon name="pause" />Pausar</button>}
    </div></div>
    <p className="admin-helper">Uma oferta por vez, até 500 por lote, com intervalo de 4 segundos. Mercado Livre: consultas confirmadas são reutilizadas por 24 horas. O andamento fica salvo neste navegador para sua conta. Continuar usa a lista original; começar do zero usa os filtros atuais.</p>
    {storageError && <p role="alert">Não foi possível salvar o andamento neste navegador. Mantenha esta aba aberta para concluir.</p>}
    {message && <p className="price-refresh-status" role="status">{message}</p>}
    {job && <><div className="price-refresh-stats"><span><strong>{job.changed}</strong> alterados</span><span><strong>{job.checked}</strong> conferidos</span><span><strong>{job.skipped}</strong> ignorados</span><span><strong>{job.failed}</strong> falhas</span></div><p className="admin-helper">{job.next}/{job.queue.length} ofertas processadas · Último registro: {new Date(job.updatedAt).toLocaleString("pt-BR")}</p><progress max={job.queue.length} value={job.next} aria-label="Ofertas processadas" /></>}
    {!!job?.errors.length && <details><summary>Avisos e falhas ({job.errors.length} mais recentes)</summary><ul>{job.errors.map((error,index)=><li key={index}><p>{error.message}</p>{error.productId && <><div className="price-log-actions"><button type="button" className="button secondary" disabled={running || disabled} onClick={async()=>{const id=error.productId!;const result=await onRefreshProduct(id);setManualResults(old=>({...old,[id]:result}));}}><UiIcon name="refresh" className={refreshingProductId===error.productId?"price-refresh-spin":""} />{refreshingProductId===error.productId?"Atualizando…":"Atualizar preço"}</button><Link href={`/admin?produto=${encodeURIComponent(error.productId)}`} target="_blank" rel="noopener noreferrer" className="button secondary" aria-label={`Editar produto: ${error.message} (abre em nova aba)`}><UiIcon name="edit" />Editar produto <UiIcon name="external" /></Link></div>{manualResults[error.productId] && <p className="admin-helper" role="status">{manualResults[error.productId]}</p>}</>}</li>)}</ul></details>}
  </section>;
}
