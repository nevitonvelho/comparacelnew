"use client";
import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import type { User } from "firebase/auth";
import { adminRequest } from "./admin-client";
import type { SeoDetail, SeoFields, SeoReport, SearchMetrics } from "@/lib/seo-workbench";

const count = (value: number | undefined) => value === undefined ? "—" : value.toLocaleString("pt-BR");
const ctr = (value: number | undefined) => value === undefined ? "—" : `${(value * 100).toFixed(1)}%`;
function Metrics({ current, previous }: { current: SearchMetrics | null; previous: SearchMetrics | null }) {
  return <div className="seo-metrics">{([
    ["Cliques", count(current?.clicks), count(previous?.clicks)], ["Impressões", count(current?.impressions), count(previous?.impressions)],
    ["CTR", ctr(current?.ctr), ctr(previous?.ctr)], ["Posição média", current?.position.toFixed(1) || "—", previous?.position.toFixed(1) || "—"],
  ] as const).map(([title, value, before]) => <div key={title}><small>{title}</small><strong>{value}</strong><span>Anterior: {before}</span></div>)}</div>;
}
export function AdminSeo({ user, onSaved, canConnect = false }: { user: User; onSaved: () => Promise<void>; canConnect?: boolean }) {
  const connectionResult = useSearchParams().get("search-console");
  const connectionErrors: Record<string, string> = { "invalid-state": "A autorização expirou ou não corresponde a este navegador. Clique em autorizar novamente.", cancelled: "A autorização foi cancelada. Você pode tentar novamente quando quiser.", failed: "Não foi possível concluir a conexão com o Google. Clique em autorizar para tentar novamente.", denied: "Sua conta não tem permissão para conectar o Search Console.", configuration: "Configure o cliente OAuth Aplicativo da Web no servidor.", property: "A conta não tem acesso à propriedade configurada ou a Search Console API não está ativada no projeto Google Cloud." };
  const [report, setReport] = useState<SeoReport | null>(null);
  const [detail, setDetail] = useState<SeoDetail | null>(null);
  const [draft, setDraft] = useState<SeoFields | null>(null);
  const [tagsText, setTagsText] = useState("");
  function setDraftFields(fields: SeoFields) { setDraft(fields); setTagsText(fields.tags.join(", ")); }
  const [search, setSearch] = useState("");
  const [kind, setKind] = useState("all");
  const [filter, setFilter] = useState("all");
  const [path, setPath] = useState("");
  const [busy, setBusy] = useState("");
  const [notice, setNotice] = useState(connectionResult === "connected" ? "Search Console conectado. Clique em sincronizar para carregar os dados." : "");
  const [error, setError] = useState(connectionErrors[connectionResult || ""] || "");
  const [visible, setVisible] = useState(30);
  const [attempt, setAttempt] = useState(0);
  const lock = useRef(false);
  const changed = Boolean(draft && detail && JSON.stringify(draft) !== JSON.stringify(detail.page.fields));
  useEffect(() => {
    let active = true;
    void adminRequest<SeoReport>(user, "seo").then(value => { if (active) { setReport(value); } }).catch(error => { if (active) setError(error instanceof Error ? error.message : "Não foi possível carregar SEO."); });
    return () => { active = false; };
  }, [user, attempt]);
  async function run(label: string, work: () => Promise<void>) {
    if (lock.current) return;
    lock.current = true; setBusy(label); setError(""); setNotice("");
    try { await work(); } catch (error) { setError(error instanceof Error ? error.message : "Não foi possível concluir a operação."); }
    finally { lock.current = false; setBusy(""); }
  }
  async function open(nextPath: string) {
    if (changed && !window.confirm("Abrir outra página e descartar as alterações ainda não aplicadas?")) return;
    await run("Abrindo diagnóstico…", async () => {
      const value = await adminRequest<SeoDetail>(user, `seo/page?path=${encodeURIComponent(nextPath)}`);
      setDetail(value); setDraftFields(value.page.fields); setPath(nextPath);
    });
  }
  async function connect() {
    await run("Abrindo autorização do Google…", async () => {
      const result = await adminRequest<{ url: string }>(user, "seo/oauth", { method: "POST" });
      const url = new URL(result.url);
      if (url.protocol !== "https:" || url.hostname !== "accounts.google.com") throw new Error("Endereço de autorização inválido.");
      window.location.assign(url.href);
    });
  }
  async function disconnect() {
    if (!window.confirm("Desconectar a conta do Search Console deste site? Os relatórios já sincronizados serão preservados.")) return;
    await run("Desconectando Search Console…", async () => {
      await adminRequest(user, "seo/oauth", { method: "DELETE" });
      setReport(await adminRequest<SeoReport>(user, "seo"));
      setNotice("Conexão removida do Comparacel. Para revogar também o acesso no Google, use as configurações da sua conta Google.");
    });
  }
  async function sync() {
    await run("Sincronizando Search Console…", async () => {
      await adminRequest(user, "seo", { method: "POST" });
      setReport(await adminRequest<SeoReport>(user, "seo"));
      if (detail && !changed) { const value = await adminRequest<SeoDetail>(user, `seo/page?path=${encodeURIComponent(detail.page.path)}`); setDetail(value); setDraftFields(value.page.fields); }
      setNotice("Dados do Search Console atualizados. Nenhum conteúdo foi alterado.");
    });
  }
  async function generate() {
    if (!detail) return;
    if (changed && !window.confirm("Substituir a edição ainda não aplicada por uma nova sugestão do Gemini?")) return;
    await run("Gerando sugestão com Gemini…", async () => {
      const value = await adminRequest<{ fields: SeoFields; warning?: string; model: string }>(user, "seo/generate", { method: "POST", body: JSON.stringify({ path: detail.page.path, fingerprint: detail.page.fingerprint }) });
      setDraftFields(value.fields); setNotice(value.warning || `Sugestão gerada com ${value.model}. Revise os fatos e os textos antes de aplicar.`);
    });
  }
  async function apply() {
    if (!detail || !draft || !changed) return;
    await run("Aplicando conteúdo revisado…", async () => {
      await adminRequest(user, "seo/page", { method: "PATCH", body: JSON.stringify({ path: detail.page.path, fingerprint: detail.page.fingerprint, fields: draft }) });
      const value = await adminRequest<SeoDetail>(user, `seo/page?path=${encodeURIComponent(detail.page.path)}`);
      setDetail(value); setDraftFields(value.page.fields);
      setReport(await adminRequest<SeoReport>(user, "seo"));
      try { await onSaved(); } catch { /* SEO was saved; the report is already current. */ }
      setNotice("Conteúdo aplicado à página e caches atualizados. O Google precisa rastrear a página novamente para refletir as mudanças.");
    });
  }
  const pages = (report?.pages || []).filter(page => (kind === "all" || page.kind === kind) && (filter === "all" || filter === "content" && page.score < 75 || filter === "opportunity" && page.performance === "Oportunidade de melhoria" || filter === "good" && page.performance === "Bom desempenho" || filter === "no-data" && !page.current) && `${page.name} ${page.path}`.toLocaleLowerCase("pt-BR").includes(search.toLocaleLowerCase("pt-BR"))).sort((a, b) => Number(b.active) - Number(a.active) || (b.current?.impressions ?? 0) - (a.current?.impressions ?? 0) || a.score - b.score);
  function edit(field: keyof SeoFields, value: string) { if (field === "tags") setTagsText(value); setDraft(current => current ? { ...current, [field]: field === "tags" ? value.split(",").map(tag => tag.trim()).filter(Boolean) : value } : current); }
  return <div className="admin-seo">
    <section className="admin-card"><div className="seo-toolbar"><div><h2>SEO com dados e revisão.</h2><p>Encontre oportunidades no Google e melhore o conteúdo quando decidir.</p></div><button className="button secondary" disabled={Boolean(busy) || !report?.searchConfigured} onClick={() => void sync()}>Sincronizar Search Console</button></div>
      <div className="seo-connection"><div><strong>{report?.connection.connected ? "Search Console conectado" : "Conecte sua conta Google"}</strong><p>A autorização solicita somente leitura dos dados de busca. {report?.connection.connectedAt ? `Conectado em ${new Date(report.connection.connectedAt).toLocaleString("pt-BR")}.` : "Use o botão para autorizar no navegador e retornar ao painel."}</p></div>{canConnect && <div className="seo-actions"><button className="button primary" disabled={Boolean(busy) || !report} onClick={() => void connect()}>{report?.connection.connected ? "Autorizar outra conta" : "Autorizar Search Console"}</button>{report?.connection.connected && <button className="button secondary" disabled={Boolean(busy)} onClick={() => void disconnect()}>Desconectar</button>}</div>}</div>
      {report && !report.connection.oauthAvailable && <details><summary>Configuração necessária para autorizar pelo painel</summary><p>{report.connection.reason}</p><p>URI de retorno: <code>https://comparacel.com.br/api/admin/seo/oauth/callback</code>. No Google Cloud, crie um cliente OAuth “Aplicativo da Web”, cadastre esse endereço e configure o JSON no servidor. Depois, a autorização será feita inteiramente pelo botão.</p></details>}
      <p className="seo-help">Qualidade do conteúdo é uma avaliação editorial interna, não uma nota do Google. “Bom desempenho” usa pelo menos 30 impressões, posição média até 10 e CTR de 2% ou mais; “Oportunidade” considera posição até 20. Esses limites são referências para triagem, não garantias de ranking. Ausência de dados não significa que a página não está indexada.</p>
      {report?.snapshot ? <p>Período: {report.snapshot.startDate} a {report.snapshot.endDate}, comparado a {report.snapshot.previousStartDate} a {report.snapshot.previousEndDate}. Sincronizado em {new Date(report.snapshot.fetchedAt).toLocaleString("pt-BR")}.</p> : <p>Search Console ainda sem sincronização. O diagnóstico editorial já funciona; use o botão para autorizar a conta Google e sincronize para consultar desempenho real.</p>}
      {report && !report.geminiConfigured && <p>Gemini ainda não configurado no servidor. Você pode revisar e editar os campos manualmente.</p>}
      {(report?.truncated || report?.snapshot?.truncated) && <p>O relatório alcançou um limite de consulta e pode não incluir todas as páginas. Você também pode abrir uma URL específica abaixo. A API do Google fornece as principais linhas e não garante cobertura completa.</p>}
    </section>
    {error && <p role="alert" className="admin-alert">{error}</p>}{notice && <p role="status" className="admin-notice">{notice}</p>}{busy && <p role="status">{busy}</p>}
    {!report && !error && <p role="status">Carregando diagnóstico…</p>}{!report && error && <button className="button secondary" onClick={() => setAttempt(value => value + 1)}>Tentar novamente</button>}
    <section className="admin-card"><form className="seo-open-path" onSubmit={event => { event.preventDefault(); void open(path.trim()); }}><label>Abrir produto ou comparação pelo caminho<input value={path} onChange={event => setPath(event.target.value)} placeholder="/produto/identificador ou /comparar/a-vs-b" maxLength={900} required /></label><button className="button secondary" disabled={Boolean(busy)}>Abrir diagnóstico</button></form></section>
    {detail && draft && <section className="admin-card seo-editor"><div className="seo-toolbar"><div><span className="eyebrow">REVISÃO DE CONTEÚDO</span><h2>{detail.page.name}</h2><a href={detail.page.path} target="_blank" rel="noopener noreferrer" className="section-link">Ver página ↗</a></div><button className="button primary" disabled={Boolean(busy) || !report?.geminiConfigured} onClick={() => void generate()}>Gerar sugestão com Gemini</button></div>
      <Metrics current={detail.page.current} previous={detail.page.previous} />
      <p><strong>Qualidade editorial: {detail.page.score}/100.</strong> {detail.page.performance}{!detail.page.active && " · Produto desativado no catálogo"}</p>
      {detail.page.issues.length > 0 && <ul className="seo-issues">{detail.page.issues.map(issue => <li key={issue}>{issue}</li>)}</ul>}
      {detail.queryWarning && <p>{detail.queryWarning}</p>}
      {detail.queries.length > 0 && <details><summary>Buscas que levaram a impressões da página</summary><ul className="seo-query-list">{detail.queries.map(row => <li key={row.keys[0]}><strong>{row.keys[0]}</strong><span>{count(row.clicks)} cliques · {count(row.impressions)} impressões · CTR {ctr(row.ctr)} · posição {row.position.toFixed(1)}</span></li>)}</ul></details>}
      <form onSubmit={event => { event.preventDefault(); void apply(); }}><fieldset disabled={Boolean(busy)} className="seo-fieldset"><div className="seo-edit-grid"><div><h3>Conteúdo atual</h3><label>Título SEO<textarea readOnly value={detail.page.fields.title} rows={2} /></label><label>Metadescrição<textarea readOnly value={detail.page.fields.metaDescription} rows={3} /></label><label>Descrição<textarea readOnly value={detail.page.fields.description} rows={9} /></label><label>Temas<input readOnly value={detail.page.fields.tags.join(", ")} /></label></div><div><h3>Conteúdo para aplicar</h3><label>Título SEO · {draft.title.length}/70<textarea maxLength={70} rows={2} value={draft.title} onChange={event => edit("title", event.target.value)} /></label><label>Metadescrição · {draft.metaDescription.length}/160<textarea maxLength={160} rows={3} value={draft.metaDescription} onChange={event => edit("metaDescription", event.target.value)} /></label><label>Descrição · {draft.description.length}/12000<textarea maxLength={12000} rows={9} value={draft.description} onChange={event => edit("description", event.target.value)} /></label><label>Temas separados por vírgula · até 8<input value={tagsText} onChange={event => edit("tags", event.target.value)} /></label></div></div>
        <div className="seo-snippet"><small>Prévia aproximada do resultado de busca</small><span>comparacel.com.br{detail.page.path}</span><strong>{draft.title || detail.page.name} | Comparacel</strong><p>{draft.metaDescription || "A descrição será escolhida pelo mecanismo de busca."}</p></div><p>Revise nomes, versões e características. O Google pode reescrever o título e o resumo. Os temas aparecem na página; não são meta keywords.</p><div className="seo-actions"><button className="button primary" disabled={!changed}>Aplicar conteúdo revisado</button><button type="button" className="button secondary" disabled={!changed} onClick={() => setDraftFields(detail.page.fields)}>Descartar edição</button></div>
      </fieldset></form>
      {detail.history.length > 0 && <details><summary>Histórico e recuperação de versões</summary><ul className="seo-history">{detail.history.map(entry => <li key={entry.id}><div><strong>{new Date(entry.at).toLocaleString("pt-BR")}</strong><small>{entry.email}</small></div><button className="button secondary" disabled={Boolean(busy)} onClick={() => { if (changed && !window.confirm("Substituir a edição atual pela versão anterior?")) return; setDraftFields(entry.before); setNotice("Versão anterior carregada para revisão. Clique em aplicar para restaurar."); }}>Revisar versão anterior</button></li>)}</ul></details>}
    </section>}
    {report && <section className="admin-card"><div className="seo-filters"><label>Buscar<input value={search} onChange={event => { setSearch(event.target.value); setVisible(30); }} placeholder="Produto ou caminho" /></label><label>Tipo<select value={kind} onChange={event => { setKind(event.target.value); setVisible(30); }}><option value="all">Produtos e comparações</option><option value="product">Produtos</option><option value="comparison">Comparações</option></select></label><label>Prioridade<select value={filter} onChange={event => { setFilter(event.target.value); setVisible(30); }}><option value="all">Todas</option><option value="content">Conteúdo a melhorar</option><option value="opportunity">Oportunidades no Google</option><option value="good">Bom desempenho</option><option value="no-data">Sem dados no período</option></select></label></div><p>{pages.length} páginas encontradas. Comparações incluem pares conhecidos pelo site, salvos no módulo ou encontrados no Search Console.</p><div className="seo-table-wrap"><table className="seo-table"><thead><tr><th>Página</th><th>Conteúdo</th><th>Desempenho</th><th>Cliques</th><th>Impressões</th><th>CTR</th><th>Posição</th><th><span className="sr-only">Ação</span></th></tr></thead><tbody>{pages.slice(0, visible).map(page => <tr key={page.path}><td><strong>{page.name}</strong><small>{page.kind === "product" ? "Produto" : "Comparação"}{!page.active && " · Desativado"}</small></td><td><span className={`seo-score ${page.score >= 75 ? "good" : "attention"}`}>{page.score}/100</span></td><td>{page.performance}</td><td>{count(page.current?.clicks)}</td><td>{count(page.current?.impressions)}</td><td>{ctr(page.current?.ctr)}</td><td>{page.current?.position.toFixed(1) || "—"}</td><td><button className="button secondary" disabled={Boolean(busy)} onClick={() => void open(page.path)} aria-label={`Revisar SEO de ${page.name}`}>Revisar</button></td></tr>)}</tbody></table></div>{!pages.length && <p>Nenhuma página corresponde aos filtros.</p>}{pages.length > visible && <button className="button secondary" onClick={() => setVisible(value => value + 30)}>Mostrar mais páginas</button>}</section>}
  </div>;
}
