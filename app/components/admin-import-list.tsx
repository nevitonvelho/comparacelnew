"use client";
import { useState } from "react";
import { buildImportLine, parseImportLine, type ImportSource } from "@/lib/admin-import-model";
import { AdminImportOpenLink } from "./admin-import-open-link";
export function AdminImportList({source,text,onChange}:{source:ImportSource;text:string;onChange:(text:string)=>void}) {
  const [affiliate,setAffiliate]=useState("");
  const [identity,setIdentity]=useState("");
  const [kind,setKind]=useState<"catalog"|"item">("catalog");
  const [notice,setNotice]=useState("");
  const lines=text.split(/\r?\n/).map(line=>line.trim()).filter(line=>line && !line.startsWith("#"));
  let candidate="",failure="";
  try{candidate=buildImportLine(affiliate,identity,source,kind);}catch(error){failure=error instanceof Error?error.message:"Confira os links.";}
  function add() {
    if(!candidate)return;
    if(lines.includes(candidate)){setNotice("Esse produto já está na lista.");return;}
    if(lines.length>=200){setNotice("Limite de 200 produtos por lote.");return;}
    onChange([...lines,candidate].join("\n"));setAffiliate("");setIdentity("");setNotice("Produto adicionado à lista.");
  }
  return <div className="admin-import-example">
    <strong>Adicione os produtos um por um</strong>
    <div className="admin-field-grid">
      <label>{source==="amazon"?"Link Amazon ou amzn.to":"Link de afiliado do Mercado Livre"}<input type="url" maxLength={2000} value={affiliate} onChange={event=>{setAffiliate(event.target.value);setNotice("");}} placeholder={source==="amazon"?"https://amzn.to/…":"https://meli.la/…"} /></label>
      {source==="mercadolivre" && <><label>ID ou URL completa do produto<input maxLength={2500} value={identity} onChange={event=>{setIdentity(event.target.value);setNotice("");}} placeholder="MLB66154233 ou URL completa" /></label><label>Tipo do ID<select value={kind} onChange={event=>setKind(event.target.value as "catalog"|"item")}><option value="catalog">Catálogo — /p/MLB…</option><option value="item">Anúncio — MLB… (item_id ou wid)</option></select></label></>}
    </div>
    {source==="mercadolivre" && <p className="admin-helper">Para um ID de catálogo MLB…, montamos a URL automaticamente. Para MLBU…, cole a URL original /up/ completa com item_id ou wid; apenas esse ID não identifica o anúncio.</p>}
    {(affiliate.trim() || identity.trim()) && <p role="status" className="admin-helper">{failure || "✓ Formato válido. A disponibilidade será conferida na importação."}</p>}
    {candidate && source==="mercadolivre" && <code>{candidate}</code>}
    <div className="admin-access-actions"><button type="button" className="button secondary" disabled={!candidate || lines.length>=200} onClick={add}>Adicionar à lista</button>{candidate && <AdminImportOpenLink line={candidate} source={source} />}</div>
    {notice && <p role="status">{notice}</p>}
    <p className="admin-helper">{lines.length}/200 produtos na lista. A validação abaixo verifica o formato, sem consultar as lojas.</p>
    {!!lines.length && <ul className="admin-import-link-list">{lines.map((line,index)=>{
      let error="";try{parseImportLine(line.replace(/\s+#.*$/, ""),source);}catch(value){error=value instanceof Error?value.message:"Formato inválido.";}
      return <li key={`${index}:${line}`}><div><strong>{error?"⚠ Confira o link":"✓ Formato válido"}</strong><small>{line}</small>{error && <p>{error}</p>}</div><div className="admin-access-actions"><AdminImportOpenLink line={line} source={source} /><button type="button" className="text-button" aria-label={`Remover produto ${index+1} da lista`} onClick={()=>onChange(lines.filter((_,i)=>i!==index).join("\n"))}>Remover</button></div></li>;
    })}</ul>}
  </div>;
}
