"use client";
import { UiIcon } from "./icons";
import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import { useAuth,authError } from "./auth-provider";
import { usePublicProfile } from "./social-hooks";
import { googlePhoto,saveProfile,type PublicProfile } from "@/lib/social";
export function Avatar({name,photoURL}:{name:string;photoURL:string|null}) {
  const [failed,setFailed]=useState(false);
  return <span className="public-avatar">{photoURL&&!failed?<Image src={photoURL} width={40} height={40} alt="" onError={()=>setFailed(true)} />:name.slice(0,1).toUpperCase()}</span>;
}
export function PublicProfileEditor() {
  const {user}=useAuth();
  const {profile,loading,error}=usePublicProfile(user?.uid);
  if(!user)return null;
  if(loading)return <p role="status">Carregando perfil público…</p>;
  if(error)return <p role="alert">Não foi possível carregar seu perfil público.</p>;
  return <ProfileForm key={`${user.uid}:${profile?.displayName??"new"}:${profile?.bio??""}:${profile?.photoURL??""}`} profile={profile} />;
}
function ProfileForm({profile}:{profile:PublicProfile|null}) {
  const {user}=useAuth();
  const [name,setName]=useState(profile?.displayName??user?.displayName?.slice(0,60)??"");
  const [bio,setBio]=useState(profile?.bio??"");
  const [photo,setPhoto]=useState(Boolean(profile?profile.photoURL:googlePhoto(user?.photoURL)));
  const [busy,setBusy]=useState(false);
  const [message,setMessage]=useState("");
  return <section className="profile-editor"><div className="section-heading"><div><span className="eyebrow">SEU ESPAÇO NA COMUNIDADE</span><h2>{profile?"Seu perfil público":"Crie seu perfil público"}</h2></div>{profile&&<Link href={`/perfil/${user!.uid}`} className="section-link">Ver meu perfil <UiIcon name="external" /></Link>}</div><p>O nome, a bio e a foto escolhidos aqui ficarão públicos. Seus favoritos e comparações salvas continuam privados.</p><form onSubmit={async event=>{event.preventDefault();if(!user)return;setBusy(true);setMessage("");try{await saveProfile(user.uid,{displayName:name,bio,photoURL:photo?googlePhoto(user.photoURL):null});setMessage("Perfil público atualizado.");}catch(error){setMessage(authError(error));}finally{setBusy(false);}}}><label>Nome público<input required maxLength={60} value={name} onChange={event=>setName(event.target.value)} /></label><label>Bio<textarea maxLength={280} rows={3} value={bio} onChange={event=>setBio(event.target.value)} placeholder="Conte o que você gosta de comparar…" /></label>{googlePhoto(user?.photoURL)&&<label className="checkbox-label"><input type="checkbox" checked={photo} onChange={event=>setPhoto(event.target.checked)} />Usar minha foto do Google no perfil público</label>}<button className="button primary" disabled={busy}>{busy?"Salvando…":profile?"Atualizar perfil":"Criar perfil público"}</button><p role="status">{message}</p></form></section>;
}
