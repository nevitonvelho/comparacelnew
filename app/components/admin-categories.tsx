"use client";
import { useState } from "react";
import type { User } from "firebase/auth";
import { adminRequest, type AdminCatalog } from "./admin-client";
import { slugify } from "@/lib/admin-model";
export function AdminCategories({ user, catalog, onSaved }: {user:User;catalog:AdminCatalog;onSaved:()=>Promise<void>}) {
  const [categories,setCategories]=useState(catalog.categories);
  const [homeLimit,setHomeLimit]=useState(catalog.homeLimit);
  const [name,setName]=useState(""); const [slug,setSlug]=useState("");
  const [busy,setBusy]=useState(false); const [message,setMessage]=useState("");
  async function save(body: unknown) {
    setBusy(true);setMessage("");
    try { await adminRequest(user,"categories",{method:"POST",body:JSON.stringify(body)}); await onSaved();setMessage("Categorias salvas.");setName("");setSlug(""); }
    catch(error){setMessage(error instanceof Error?error.message:"Falha ao salvar.");}
    finally{setBusy(false);}
  }
  return <div className="admin-categories"><p>Cadastre categorias e escolha quais aparecem na seção “Comece pela categoria” da home. Categorias ocultas continuam no catálogo. Os quatro destaques ilustrativos do topo permanecem separados desta seleção.</p>{message && <p role="status" className="admin-notice">{message}</p>}<form className="admin-card" onSubmit={event=>{event.preventDefault();void save({name,slug});}}><h2>Adicionar categoria</h2><fieldset disabled={busy}><label>Nome<input required maxLength={120} value={name} onChange={event=>{setName(event.target.value);if(!slug || slug===slugify(name))setSlug(slugify(event.target.value));}} /></label><label>URL da categoria<input required maxLength={140} pattern="[a-z0-9]+(-[a-z0-9]+)*" value={slug} onChange={event=>setSlug(event.target.value)} /><small>/{slug || "nome-da-categoria"}</small></label><button className="button primary">Cadastrar categoria</button></fieldset></form><form className="admin-card" onSubmit={event=>{event.preventDefault();void save({categories,homeLimit});}}><h2>Categorias na home</h2><fieldset disabled={busy}><label>Quantidade máxima na home<input type="number" min={0} max={100} required value={homeLimit} onChange={event=>setHomeLimit(Number(event.target.value))} /><small>0 oculta todas. Só aparecem categorias selecionadas com produtos ativos.</small></label>{categories.map((item,index)=><div className="admin-category-setting" key={item.id}><label className="admin-checkbox"><input type="checkbox" checked={item.showOnHome} onChange={event=>setCategories(old=>old.map((value,i)=>i===index?{...value,showOnHome:event.target.checked}:value))} />{item.name}</label><label>Ordem<input aria-label={`Ordem de ${item.name}`} type="number" min={0} max={999} required value={item.order} onChange={event=>setCategories(old=>old.map((value,i)=>i===index?{...value,order:Number(event.target.value)}:value))} /></label></div>)}<button className="button primary">Salvar exibição na home</button></fieldset></form></div>;
}
