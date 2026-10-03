"use client";
import { UiIcon } from "./icons";
import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth,authError } from "./auth-provider";
import { useCatalog } from "./catalog-provider";
import { usePublicProfile } from "./social-hooks";
import { publishComparison } from "@/lib/social";
export function PublishComparison({productIds}:{productIds:string[]}) {
  const {user,login,loading:authLoading}=useAuth();
  const {profile,loading,error}=usePublicProfile(user?.uid);
  const {products}=useCatalog();
  const router=useRouter();
  const [open,setOpen]=useState(false);
  const [title,setTitle]=useState("");
  const [opinion,setOpinion]=useState("");
  const [winner,setWinner]=useState("undecided");
  const [busy,setBusy]=useState(false);
  const [message,setMessage]=useState("");
  const pair=productIds.map(id=>products.find(product=>product.id===id)).filter(product=>product!==undefined);
  return <div className="publish-comparison"><button className="button primary" disabled={authLoading||busy} onClick={async()=>{setMessage("");if(!user){setBusy(true);try{await login();setOpen(true);}catch(error){setMessage(authError(error));}finally{setBusy(false);}}else setOpen(value=>!value);}}>Publicar minha comparação <UiIcon name="external" /></button>{message&&!open&&<p role="alert">{message}</p>}{open&&<section className="publish-form"><div className="section-heading"><h2>Compartilhe sua escolha.</h2><button className="text-button" onClick={()=>setOpen(false)}>Fechar</button></div><p>Esta publicação será pública e ligada ao seu perfil. Salvar uma comparação na conta não a publica.</p>{loading?<p role="status">Carregando perfil…</p>:error?<p role="alert">Não foi possível consultar seu perfil.</p>:!profile?<div><p>Crie seu perfil público para assinar a publicação.</p><Link href="/minha-conta" className="button secondary">Criar meu perfil público <UiIcon name="right" /></Link></div>:<form onSubmit={async event=>{event.preventDefault();if(!user)return;setBusy(true);setMessage("");try{const id=await publishComparison(user.uid,pair,title,opinion,winner);setOpen(false);router.push(`/comunidade/${id}`);}catch(error){setMessage(error instanceof Error&&!("code" in error)?error.message:authError(error));}finally{setBusy(false);}}}><label>Título<input required minLength={5} maxLength={100} value={title} onChange={event=>setTitle(event.target.value)} placeholder="Qual vale mais a pena para você?" /></label><label>Minha preferência<select value={winner} onChange={event=>setWinner(event.target.value)}><option value="undecided">Ainda estou em dúvida</option><option value="tie">Os dois me atendem</option>{pair.map(product=><option key={product.id} value={product.id}>{product.name}</option>)}</select></label><label>Minha opinião<textarea required minLength={20} maxLength={3000} rows={6} value={opinion} onChange={event=>setOpinion(event.target.value)} placeholder="Conte o que você comparou e por que prefere uma das opções." /></label><small>{opinion.length}/3.000 caracteres · opinião do autor</small><div className="publish-submit"><button className="button primary" disabled={busy}>{busy?"Publicando…":"Publicar na comunidade"}</button><span>Assinado por {profile.displayName}</span></div><p role="alert">{message}</p></form>}</section>}</div>;
}
