"use client";
import { useState } from "react";
import type { User } from "firebase/auth";
import { adminRequest } from "./admin-client";
import { UiIcon } from "./icons";
export function AdminExtension({user}:{user:User}) {
  const [key,setKey]=useState("");const [expires,setExpires]=useState("");const [busy,setBusy]=useState(false);const [message,setMessage]=useState("");
  async function change(revoke:boolean) {
    setBusy(true);setMessage("");
    try {
      if(revoke){await adminRequest(user,"extension",{method:"DELETE"});setKey("");setExpires("");setMessage("Conexão revogada. A extensão precisa de uma nova chave.");}
      else {const data=await adminRequest<{key:string;expiresAt:string}>(user,"extension",{method:"POST"});setKey(data.key);setExpires(data.expiresAt);setMessage("Cole esta chave nas configurações da extensão. Gerar outra substitui a chave anterior.");}
    }catch(error){setMessage(error instanceof Error?error.message:"Não foi possível configurar a extensão.");}
    finally{setBusy(false);}
  }
  return <section className="admin-card"><h2>Importe pelo seu navegador</h2><p>Abra um produto no Mercado Livre ou Amazon, acione a extensão, cole o link de afiliado e escolha a categoria. A extensão reconhece anúncios já importados, atualiza preço ou informações e permite buscar a mesma ficha para adicionar a oferta da outra loja.</p><p>Para conferir várias ofertas, abra “Atualizar preços em lote” na extensão, carregue os preços desatualizados e inicie. Mantenha a tela do lote aberta; você pode pausar e continuar. Anúncios bloqueados ou sem preço ficam para revisão.</p><div className="admin-access-actions"><a className="button secondary" href="/extensions/comparacel-collector.zip" download><UiIcon name="external" />Baixar extensão</a><button className="button primary" disabled={busy} onClick={()=>void change(false)}>Gerar chave de conexão</button><button className="button secondary" disabled={busy} onClick={()=>void change(true)}>Revogar conexão</button></div><details className="admin-import-example"><summary>Como instalar e conectar</summary><ol><li>Baixe e descompacte a extensão.</li><li>Abra <code>chrome://extensions</code>, ative o modo de desenvolvedor e clique em “Carregar sem compactação”. Selecione a pasta que contém <code>manifest.json</code>.</li><li>Gere uma chave aqui. Na extensão, informe o endereço deste site e cole a chave. Clique em “Conectar e carregar categorias”.</li><li>Abra o produto, colete a página, cole seu link de afiliado e clique em “Importar produto novo”. Produtos novos ficam como rascunhos.</li></ol></details>{key && <><label>Chave de conexão<input readOnly type="password" value={key} autoComplete="off" /></label><button type="button" className="button secondary" onClick={async()=>{try{await navigator.clipboard.writeText(key);setMessage("Chave copiada.");}catch{setMessage("Selecione e copie a chave do campo.");}}}>Copiar chave</button><p className="admin-helper">Validade: {new Date(expires).toLocaleDateString("pt-BR")}. A chave aparece apenas nesta geração.</p></>}{message && <p role="status">{message}</p>}</section>;
}
