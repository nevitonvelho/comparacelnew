"use client";
import { UiIcon } from "./icons";
import { useEffect,useState } from "react";
import { doc,onSnapshot } from "firebase/firestore";
import { getDatabase } from "@/lib/firebase/client";
import { pageIdentity,type PageKind } from "@/lib/engagement-model";
import { emptyReactions,reactionOptions,reactionSummary,type ReactionCounts } from "@/lib/reaction-model";
import { useReactions } from "./reaction-provider";
import { authError,useAuth } from "./auth-provider";

export function useReactionStats(key:string) {
  const [stats,setStats]=useState<{key:string;counts:ReactionCounts;error:boolean}|null>(null);
  useEffect(()=>{
    if(!key)return;
    return onSnapshot(doc(getDatabase(),"reactionStats",key),snapshot=>setStats({key,counts:{...emptyReactions,...snapshot.data()?.counts},error:false}),()=>setStats({key,counts:emptyReactions,error:true}));
  },[key]);
  return stats?.key===key?stats:null;
}
export function ReactionCounters({productId}:{productId:string}) {
  const current=useReactionStats(`product:${productId}`);
  return <div className="inline-reaction-counts" aria-label="Contadores de reações">{reactionOptions("product").map(option=><span key={option.key} title={option.label}><UiIcon name={option.key}/><span className="sr-only">{option.label}: </span>{current&&!current.error?current.counts[option.key]:"—"}</span>)}</div>;
}

export function Reactions({kind,productIds,compact=false,readOnly=false}:{kind:PageKind;productIds:string[];compact?:boolean;readOnly?:boolean}) {
  const identity=pageIdentity(kind,productIds);
  const key=identity?.key??"";
  const {user}=useAuth();
  const {votes,loading,error,busy,react}=useReactions();
  const [feedback,setFeedback]=useState("");
  const [failed,setFailed]=useState(false);
  const [submitting,setSubmitting]=useState(false);
  const current=useReactionStats(key);
  const summary=current&&!current.error?reactionSummary(current.counts):null;
  const selected=votes[key];
  if(readOnly)return <section className="reaction-grade" aria-label="Indicador de reações do produto">
    <div className="reaction-grade-heading"><span>Reações da comunidade</span>{summary&&<span className={`reaction-seal seal-${summary.status}`}>{summary.status==="high"?<UiIcon name="external" />:summary.status==="low"?<UiIcon name="downtrend" />:null}{summary.label}</span>}</div>
    {summary&&<><div className={`reaction-grade-track grade-${summary.status}`} role="meter" aria-label="Grau das reações" aria-valuemin={0} aria-valuemax={100} aria-valuenow={summary.total?Math.round(summary.score*100):0} aria-valuetext={summary.total?`${summary.label}, ${summary.total} avaliações`:"Sem reações ainda"}><span style={{width:summary.total?`${Math.round(summary.score*100)}%`:"0%"}} /></div><div className="reaction-grade-counts">{reactionOptions("product").map(option=><span key={option.key} title={option.label}><span aria-hidden="true"><UiIcon name={option.key} /></span><span className="sr-only">{option.label}: </span>{current!.counts[option.key]}</span>)}<small>{summary.total===0?"Sem reações ainda":`${summary.total} ${summary.total===1?"opinião":"opiniões"}`}</small></div></>}
    {current?.error&&<small>Indicador indisponível.</small>}
  </section>;

  return <section className={`reactions ${compact?"reactions-compact":""}`} aria-label={kind==="product"?"Reações ao produto":"Reações à comparação"}>
    <div className="reactions-heading"><span>{kind==="product"?"O que você acha?":"Esta comparação ajuda?"}</span>{summary&&<span className={`reaction-seal seal-${summary.status}`} title="Baseado nas reações da comunidade, com no mínimo 10 avaliações">{summary.status==="high"?<UiIcon name="external" />:summary.status==="low"?<UiIcon name="downtrend" />:null}{summary.label}</span>}</div>
    <div className="reaction-options">{reactionOptions(kind).map(option=><button type="button" key={option.key} className={selected===option.key?"reaction-selected":""} aria-label={option.label} aria-pressed={selected===option.key} title={`${option.label}${selected===option.key?" · clique para retirar":""}`} disabled={submitting||loading||Boolean(busy)||Boolean(user&&error)} onClick={async()=>{
      setSubmitting(true);setFailed(false);setFeedback("");
      try {const result=await react(kind,productIds,option.key);setFeedback(result?"Sua reação foi registrada.":"Sua reação foi retirada.");}
      catch(error){setFailed(true);setFeedback(error instanceof Error&&!("code" in error)?error.message:authError(error));}
      finally{setSubmitting(false);}
    }}><span className="reaction-face" aria-hidden="true"><UiIcon name={option.key} /></span><span className="reaction-label">{option.label}</span><span className="reaction-count">{current&&!current.error?current.counts[option.key]:"—"}</span></button>)}</div>
    {current?.error&&<p className="reaction-message" role="status">Reações indisponíveis no momento.</p>}
    {user&&error&&<p className="reaction-message" role="alert">Não foi possível carregar suas reações.</p>}
    {feedback&&<p className="reaction-message" role={failed?"alert":"status"}>{feedback}</p>}
    {!compact&&<details className="reaction-explanation"><summary>Como os selos são definidos?</summary><p>As carinhas expressam {kind==="product"?"opiniões sobre o produto":"a utilidade da comparação"}. Cada conta Google verificada tem uma reação por item. O selo exige pelo menos 10 avaliações e usa uma média suavizada: triste vale 0, feliz vale 0,75 e muito feliz vale 1; somamos 6 pontos e dividimos pelo total de avaliações mais 10. A partir de 65% aparece “Em alta”; até 40%, “Em baixa”. Entre essas faixas, as opiniões são variadas.</p><p>Até 20 votos ou alterações em 24 horas, com 10 segundos entre votos e 60 segundos para mudar a reação no mesmo item. Você pode retirar sua reação. Favoritar guarda o produto na sua conta e não conta como avaliação.</p></details>}
  </section>;
}
