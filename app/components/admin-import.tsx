"use client";
import { useEffect, useRef, useState } from "react";
import type { User } from "firebase/auth";
import { adminRequest, type AdminCatalog } from "./admin-client";
import { AdminImportList } from "./admin-import-list";
import { AdminExtension } from "./admin-extension";
import { AdminImportOpenLink } from "./admin-import-open-link";
import { UiIcon } from "./icons";
import { parseImportLine, parseImportText, type ImportSource } from "@/lib/admin-import-model";
import type { AdminProduct } from "@/lib/admin-model";
const mercadoImportExample = "https://meli.la/31EQLJ3 https://www.mercadolivre.com.br/p/MLB66154233";
type Result = { line: string; name?: string; status: "created" | "updated" | "error"; message: string };
export function AdminImport({ user, catalog, onImported }: { user: User; catalog: AdminCatalog; onImported: () => Promise<void> }) {
  const [source, setSource] = useState<ImportSource>("amazon");
  const [category, setCategory] = useState(catalog.categories[0]?.id ?? "celulares");
  const [entryMode,setEntryMode] = useState<"list"|"text">("list");
  const [text, setText] = useState("");
  const [downloadImages, setDownloadImages] = useState(true);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState("");
  const [results, setResults] = useState<Result[]>([]);
  const [queue, setQueue] = useState<string[]>([]);
  const [total, setTotal] = useState(0);
  const [current, setCurrent] = useState("");
  const stop = useRef(false);
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; stop.current = true; }; }, []);
  useEffect(() => { if (!running) return; const warn = (event: BeforeUnloadEvent) => event.preventDefault(); window.addEventListener("beforeunload", warn); return () => window.removeEventListener("beforeunload", warn); }, [running]);
  async function start(lines?: string[]) {
    let entries: string[];
    try { entries = lines ?? parseImportText(text); } catch (error) { setError(error instanceof Error ? error.message : "Confira o arquivo."); return; }
    setError(""); setResults([]); setTotal(entries.length); setQueue(entries); setRunning(true); stop.current = false;
    let stoppedForAccess = false;
    for (let index = 0; index < entries.length; index++) {
      if (stop.current || !mounted.current) break;
      const line = entries[index]; setCurrent(`Processando ${index + 1} de ${entries.length}`);
      try {
        parseImportLine(line, source);
        const result = await adminRequest<{ product: AdminProduct; created: boolean; warnings: string[] }>(user, "import", { method: "POST", body: JSON.stringify({ source, category, line, downloadImages }) });
        if (mounted.current) setResults(old => [...old, { line, name: result.product.name, status: result.created ? "created" : "updated", message: result.warnings.join(" ") || (result.created ? "Rascunho criado. Confira antes de ativar." : "Oferta atualizada; edição manual preservada.") }]);
      } catch (error) {
        if (mounted.current) setResults(old => [...old, { line, status: "error", message: error instanceof Error ? error.message : "Falha ao importar." }]);
        if (error && typeof error === "object" && "status" in error && [401, 403, 429, 503].includes(Number(error.status))) { stoppedForAccess = true; break; }
      }
      if (index < entries.length - 1 && !stop.current) await new Promise(resolve => setTimeout(resolve, 4100));
    }
    if (!mounted.current) return;
    setRunning(false); setCurrent(stoppedForAccess ? "Lote interrompido. Resolva o erro antes de continuar." : stop.current ? "Lote interrompido após o item em andamento." : "Lote concluído.");
    try { await onImported(); } catch { setError("Importação concluída. Atualize o painel para recarregar os produtos."); }
  }
  const failures = results.filter(result => result.status === "error");
  return <><AdminExtension user={user} /><section className="admin-card admin-import"><h2>Cadastre vários produtos pelos links.</h2><p>Adicione os produtos um por um, envie um arquivo .txt ou cole a lista. Produtos novos são criados como rascunhos. Produtos existentes mantêm sua publicação e seus campos editados manualmente.</p><fieldset disabled={running}><div className="admin-filters"><label>Fonte<select value={source} onChange={event => { setSource(event.target.value as ImportSource); setTotal(0); setResults([]); }}><option value="amazon">Amazon Brasil</option><option value="mercadolivre">Mercado Livre</option></select></label><label>Categoria dos novos produtos<select value={category} onChange={event => { setCategory(event.target.value); setTotal(0); setResults([]); }}>{catalog.categories.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><label>Arquivo de links (.txt)<input type="file" accept=".txt,text/plain" onChange={async event => { const file = event.target.files?.[0]; if (!file) return; if (file.size > 200000) { setError("Use um arquivo de até 200 KB."); return; } setText(await file.text()); setError(""); setTotal(0); setResults([]); }} /></label></div><div className="admin-access-actions"><button type="button" className="button secondary" aria-pressed={entryMode==="list"} onClick={()=>setEntryMode("list")}>Adicionar um por um</button><button type="button" className="button secondary" aria-pressed={entryMode==="text"} onClick={()=>setEntryMode("text")}>Colar ou editar lista completa</button></div>{entryMode==="list" && <AdminImportList key={source} source={source} text={text} onChange={value=>{setText(value);setTotal(0);setResults([]);}} />}<label hidden={entryMode!=="text"}>Links dos produtos<textarea rows={7} maxLength={200000} value={text} onChange={event => { setText(event.target.value); setTotal(0); setResults([]); }} placeholder={source === "amazon" ? "https://www.amazon.com.br/dp/B0XXXXXXXX?tag=sua-tag\nhttps://amzn.to/seu-link" : mercadoImportExample} /></label>{entryMode==="text" && text.trim() && <details className="admin-import-example"><summary>Abrir páginas da lista para coletar com a extensão</summary><ul className="admin-import-link-list">{text.split(/\r?\n/).map(line=>line.trim()).filter(line=>line && !line.startsWith("#")).slice(0,200).map((line,index)=><li key={`${index}:${line}`}><small>{line}</small><AdminImportOpenLink line={line} source={source} /></li>)}</ul></details>}<p className="admin-import-help">{source === "amazon" ? "Um link Amazon ou amzn.to por linha. O link de afiliado é preservado." : "Informe: link de afiliado, espaço, URL original do produto com /p/MLB… ou /up/MLBU…. Para /up/, mantenha os parâmetros que identificam o anúncio (pdp_filters ou wid). Os dados vêm da API oficial do Mercado Livre. Links meli.la sozinhos podem ser bloqueados; nesse caso, abra o link e copie também a URL final."} Até 200 linhas por lote; linhas vazias, comentários # e links repetidos são ignorados.</p>{source === "mercadolivre" && <div className="admin-import-example"><strong>Exemplo: ar-condicionado Elgin 9.000 BTUs</strong><p>Monte cada linha assim: <b>link de afiliado + espaço + URL do produto</b>. Abra o link de afiliado no navegador para copiar a URL com /p/MLB….</p><code>{mercadoImportExample}</code><p>O primeiro link fica no botão de compra; o segundo identifica o produto para importar os dados. Para outros produtos, substitua os dois links.</p><button type="button" className="button secondary" disabled={Boolean(text.trim())} onClick={() => { setText(mercadoImportExample); setError(""); setTotal(0); setResults([]); }}>Preencher com este exemplo</button>{text.trim() && <small>Para preencher com o exemplo, limpe o campo de links acima.</small>}</div>}<label className="admin-import-checkbox"><input type="checkbox" checked={downloadImages} onChange={event => setDownloadImages(event.target.checked)} />Importar imagens para o Storage</label></fieldset>{error && <p role="alert" className="admin-alert">{error}</p>}{!running && failures.length > 0 && <p role="alert" className="admin-alert">{failures.length} item(ns) falharam. {failures[0].message}</p>}<div className="admin-access-actions"><button className="button primary" disabled={running || !text.trim()} onClick={() => void start()}><UiIcon name="add" />{running ? "Importando…" : "Iniciar importação"}</button>{running && <button className="button secondary" onClick={() => { stop.current = true; setCurrent("Parando após o produto em andamento…"); }}>Parar após este produto</button>}{!running && failures.length > 0 && <button className="button secondary" onClick={() => void start(failures.map(item => item.line))}>Repetir itens com falha</button>}</div></section>{total > 0 && <section className="admin-card admin-import-results"><h2>Resultado da importação</h2><p role="status">{current} · {results.length}/{total} processados</p>{running && <p>Mantenha esta aba aberta até concluir o lote.</p>}<progress max={total} value={results.length} /><div className="admin-import-counts"><span>{results.filter(item => item.status === "created").length} criados</span><span>{results.filter(item => item.status === "updated").length} atualizados</span><span>{failures.length} falhas</span></div><ul>{results.map((item, index) => <li key={`${index}:${item.line}`}><UiIcon name={item.status === "error" ? "close" : "check"} /><div><strong>{item.name ?? `Linha ${index + 1}`}</strong><small>{item.line}</small><p>{item.message}</p><AdminImportOpenLink line={item.line} source={source} /></div></li>)}</ul>{!running && results.length < total && <button className="button secondary" onClick={() => { try { void start(queue.slice(results.length)); } catch (error) { setError(error instanceof Error ? error.message : "Confira a lista."); } }}>Continuar itens restantes</button>}</section>}</>;
}
