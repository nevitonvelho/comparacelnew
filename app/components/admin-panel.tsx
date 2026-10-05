"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth, authError } from "./auth-provider";
import { UiIcon } from "./icons";
import { ProductImage } from "./product-image";
import { AdminPriceAge } from "./admin-price-age";
import { productPriceFreshness } from "@/lib/admin-price-freshness";
import { PriceUpdated } from "./price-updated";
import { AdminUsers } from "./admin-users";
import type { StaffAccess } from "@/lib/admin-permissions";
import { AdminCategories } from "./admin-categories";
import { AdminExtension } from "./admin-extension";
import { AdminProductEditor } from "./admin-product-editor";
import { adminRequest, auditLabels, type AdminCatalog, type AdminDashboard } from "./admin-client";
import { AdminError, slugify, type AdminProduct } from "@/lib/admin-model";
import { money } from "@/lib/product-model";

type Tab = "users" | "categories" | "dashboard" | "products" | "references" | "audit" | "import";
type Loaded = { access: StaffAccess; uid: string; catalog: AdminCatalog; dashboard: AdminDashboard };
export function AdminPanel() {
  const initialProductId = useSearchParams().get("produto") ?? undefined;
  const openedProduct = useRef("");
  const { user, loading, login, logout } = useAuth();
  const router = useRouter();
  const [data, setData] = useState<Loaded | null>(null);
  const [failure, setFailure] = useState<{ uid: string; message: string; denied: boolean } | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [tab, setTab] = useState<Tab>("dashboard");
  const [editor, setEditor] = useState<{ product: AdminProduct | null } | null>(null);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("all");
  const [status, setStatus] = useState("all");
  const [priceFilter,setPriceFilter]=useState("all");
  const [priceDays,setPriceDays]=useState(7);
  const [productSort,setProductSort]=useState("priority");
  const [priceNow,setPriceNow]=useState(()=>Date.now());
  useEffect(()=>{
    const update=()=>setPriceNow(Date.now());
    const timer=setInterval(update,60000);
    const resume=()=>{if(document.visibilityState==="visible"){update();setAttempt(value=>value+1);}};
    window.addEventListener("focus",resume);
    return()=>{clearInterval(timer);window.removeEventListener("focus",resume);};
  },[]);
  const [notice, setNotice] = useState("");
  const [statusBusy,setStatusBusy] = useState<string | null>(null);
  const [deleteBusy,setDeleteBusy]=useState<string | null>(null);
  const deleteLock=useRef(false);
  const [pendingActive,setPendingActive] = useState(false);
  const statusLock = useRef(false);
  const [visible, setVisible] = useState(25);
  const [loginError, setLoginError] = useState("");
  const [loginBusy, setLoginBusy] = useState(false);
  const [kind, setKind] = useState("brands");
  const [reference, setReference] = useState({ name: "", slug: "", website: "" });
  const [referenceBusy, setReferenceBusy] = useState(false);
  const [referenceError, setReferenceError] = useState("");
  useEffect(() => {
    if (!user) return;
    let active = true;
    void (async () => {
      try {
        const session = await adminRequest<{access:StaffAccess}>(user, "session");
        const [catalog, dashboard] = await Promise.all([adminRequest<AdminCatalog>(user, "products"), adminRequest<AdminDashboard>(user, "dashboard")]);
        if (active) { setData({ uid: user.uid, catalog, dashboard, access:session.access }); setFailure(null);
          if (initialProductId && openedProduct.current !== `${user.uid}:${initialProductId}` && session.access.permissions.includes("products.view") && session.access.permissions.includes("products.edit")) {
            openedProduct.current = `${user.uid}:${initialProductId}`;
            const product = catalog.products.find(item => item.id === initialProductId);
            setTab("products");
            if (product) setEditor({ product });
            else setNotice("Produto não encontrado no catálogo.");
          }
        }
      } catch (error) { if (active) { setData(null); setFailure({ uid: user.uid, message: error instanceof Error ? error.message : "Não foi possível carregar o painel.", denied: error instanceof AdminError && error.status === 403 }); } }
    })();
    return () => { active = false; };
  }, [user, attempt, initialProductId]);
  const current = data?.uid === user?.uid ? data : null;
  const error = failure?.uid === user?.uid ? failure : null;
  if (loading || user && !current && !error) return <main id="conteudo" className="admin-access"><UiIcon name="shield" /><h1>Administração</h1><p role="status">Verificando acesso…</p></main>;
  if (!user || !current) return <main id="conteudo" className="admin-access"><div className="admin-access-icon"><UiIcon name="shield" /></div><span className="eyebrow">ADMINISTRAÇÃO COMPARACEL</span><h1>{error?.denied ? "Acesso restrito." : "Seu catálogo, em um só lugar."}</h1><p>{user ? error?.message : "Entre com a conta Google autorizada para administrar produtos, imagens e ofertas."}</p>{loginError && <p role="alert">{loginError}</p>}{user ? <div className="admin-access-actions"><button className="button secondary" onClick={() => { setFailure(null); setAttempt(value => value + 1); }}>Tentar novamente</button><button className="button primary" onClick={async () => { try { await logout(); setData(null); setEditor(null); } catch (error) { setLoginError(authError(error)); } }}>Usar outra conta</button></div> : <button className="button secondary google-login" disabled={loginBusy} onClick={async () => { setLoginBusy(true); setLoginError(""); try { await login(); } catch (error) { setLoginError(authError(error)); } finally { setLoginBusy(false); } }}><Image src="/brand/google-g.png" alt="" width={20} height={20} />{loginBusy ? "Entrando…" : "Entrar com Google"}</button>}<Link href="/" className="section-link">Voltar ao site <UiIcon name="right" /></Link></main>;
  const { catalog, dashboard, access } = current;
  const can = (permission: keyof typeof import("@/lib/admin-permissions").permissionLabels) => access.permissions.includes(permission);
  const matching = catalog.products.filter(product => (category === "all" || product.category === category) && (status === "all" || product.isActive === (status === "active")) && `${product.name} ${product.id}`.toLocaleLowerCase("pt-BR").includes(search.toLocaleLowerCase("pt-BR")));
  const priceHealth=new Map(matching.map(product=>[product.id,productPriceFreshness(product,priceDays,priceNow)]));
  const needsUpdate=(state:string)=>state==="due" || state==="never";
  const dueCount=matching.filter(product=>needsUpdate(priceHealth.get(product.id)!.state)).length;
  const neverCount=matching.filter(product=>priceHealth.get(product.id)!.state==="never").length;
  const filtered=matching.filter(product=>{
    const state=priceHealth.get(product.id)!.state;
    return priceFilter==="all" || (priceFilter==="due"?needsUpdate(state):priceFilter==="recent"?state==="fresh" || state==="attention":state===priceFilter);
  }).sort((a,b)=>{
    if(productSort==="name")return a.name.localeCompare(b.name,"pt-BR");
    const left=priceHealth.get(a.id)!,right=priceHealth.get(b.id)!;
    const rank={never:0,due:1,attention:2,fresh:3,unavailable:4,"no-offers":5};
    return rank[left.state]-rank[right.state] || (left.oldest ?? 0)-(right.oldest ?? 0) || a.name.localeCompare(b.name,"pt-BR");
  });
  const tabs = [{ id: "dashboard", name: "Visão geral", icon: "dashboard" }, { id: "products", name: "Produtos", icon: "product" }, { id: "import", name: "Extensão", icon: "add" }, { id: "categories", name: "Categorias", icon: "product" }, { id: "references", name: "Marcas e lojas", icon: "store" }, { id: "audit", name: "Atividade", icon: "chart" }, { id: "users", name: "Usuários e acessos", icon: "user" }] as const;
  const allowedTabs = tabs.filter(item => item.id === "dashboard" || item.id === "products" && can("products.view") || item.id === "import" && can("import.manage") || item.id === "categories" && can("categories.manage") || item.id === "references" && (can("brands.manage") || can("stores.manage")) || item.id === "audit" && can("audit.view") || item.id === "users" && access.role === "administrator");
  function switchTab(next: Tab) { if (!editor || window.confirm("Voltar ao painel? Alterações ainda não salvas serão descartadas.")) { setTab(next); setEditor(null); setNotice(""); } }
  async function refresh() { if (!user) return; const [catalog, dashboard] = await Promise.all([adminRequest<AdminCatalog>(user, "products"), adminRequest<AdminDashboard>(user, "dashboard")]); setData({ uid: user.uid, catalog, dashboard, access }); }
  async function removeProduct(product:AdminProduct) {
    if(!user || deleteLock.current || statusLock.current || !can("products.delete"))return;
    if(!window.confirm(`Excluir “${product.name}”?\n\nA ficha e suas ofertas serão removidas do site. Esta ação não pode ser desfeita.`))return;
    deleteLock.current=true;setDeleteBusy(product.id);setNotice("");
    try {
      await adminRequest(user,`products/${encodeURIComponent(product.id)}`,{method:"DELETE",body:JSON.stringify({revision:product.revision})});
      setData(old=>old?{...old,catalog:{...old.catalog,products:old.catalog.products.filter(item=>item.id!==product.id)}}:old);
      setNotice(`${product.name}: produto excluído.`);
      router.refresh();
      void refresh().catch(()=>{});
    } catch(error) {setNotice(error instanceof Error?error.message:"Não foi possível excluir o produto.");}
    finally {deleteLock.current=false;setDeleteBusy(null);}
  }
  async function toggleActive(product: AdminProduct) {
    if(!user || statusLock.current || deleteLock.current || !can("products.edit")) return;
    statusLock.current=true;setPendingActive(!product.isActive);setStatusBusy(product.id);setNotice("");
    try {
      const result=await adminRequest<{product:AdminProduct}>(user,`products/${encodeURIComponent(product.id)}/status`,{method:"PATCH",body:JSON.stringify({revision:product.revision,isActive:!product.isActive})});
      setData(old=>old?{...old,dashboard:{...old.dashboard,active:old.dashboard.active+(result.product.isActive?1:-1)},catalog:{...old.catalog,products:old.catalog.products.map(item=>item.id===result.product.id?result.product:item)}}:old);
      setNotice(`${result.product.name}: ${result.product.isActive?"ativado no site":"desativado"}.`);
      void adminRequest<AdminDashboard>(user,"dashboard").then(dashboard=>setData(old=>old?.uid===user.uid?{...old,dashboard}:old)).catch(()=>{});
      router.refresh();
    } catch(error){setNotice(error instanceof Error?error.message:"Não foi possível alterar a situação.");}
    finally{statusLock.current=false;setStatusBusy(null);}
  }
  const metrics = [...(dashboard.users !== null ? [["Usuários cadastrados", dashboard.users, "user"] as const] : []), ["Produtos", dashboard.total, "product"], ["Ativos no site", dashboard.active, "check"], ["Ofertas disponíveis", dashboard.offers, "store"], ["Visitas aos produtos", dashboard.productViews, "eye"], ["Visitas às comparações", dashboard.comparisonViews, "compare"], ["Reações", dashboard.reactions, "happy"]] as const;
  const references = kind === "brands" ? catalog.brands : catalog.stores;
  return <main id="conteudo" className="admin-page"><aside className="admin-sidebar"><span className="eyebrow">ADMINISTRAÇÃO</span><p>Cuide de cada escolha.</p><nav aria-label="Painel administrativo">{allowedTabs.map(item => <button key={item.id} className={tab === item.id ? "active" : ""} aria-current={tab === item.id ? "page" : undefined} onClick={() => switchTab(item.id)}><UiIcon name={item.icon} />{item.name}{item.id === "products" && <span>{dashboard.total}</span>}</button>)}</nav><div className="admin-sidebar-account"><strong>{user.displayName ?? "Administrador"}</strong><small>{user.email}</small><button className="text-button" onClick={async () => { if (editor && !window.confirm("Sair do painel? Alterações ainda não salvas serão descartadas.")) return; try { await logout(); setData(null); setEditor(null); } catch (error) { setLoginError(authError(error)); } }}>Sair da conta</button>{loginError && <p role="alert">{loginError}</p>}</div></aside><div className="admin-content"><div className="admin-page-heading"><div><span className="eyebrow">PAINEL COMPARACEL</span><h1>{tabs.find(item => item.id === tab)?.name}</h1></div><Link href="/" className="button secondary" target="_blank">Ver site <UiIcon name="external" /></Link></div>{notice && <p className="admin-notice" role="status">{notice}</p>}
    {tab === "dashboard" && <><div className="admin-metrics">{metrics.map(([name, value, icon]) => <article className="admin-metric" key={name}><UiIcon name={icon} /><span>{name}</span><strong>{value.toLocaleString("pt-BR")}</strong></article>)}</div><div className="admin-dashboard-grid"><section className="admin-card"><h2>Deixe o catálogo completo.</h2><p>Alguns detalhes ajudam as pessoas a comparar melhor.</p><button className="admin-attention" onClick={() => { setTab("products"); setSearch(""); setCategory("all"); setStatus("draft"); }}><span>Produtos desativados</span><strong>{dashboard.total - dashboard.active}</strong><UiIcon name="right" /></button><div className="admin-attention"><span>Produtos sem imagem</span><strong>{dashboard.noImage}</strong></div><div className="admin-attention"><span>Produtos sem preço disponível</span><strong>{dashboard.noPrice}</strong></div><button disabled={!can("products.create")} className="button primary" onClick={() => { setTab("products"); setEditor({ product: null }); }}><UiIcon name="add" />Cadastrar produto</button></section><section className="admin-card"><h2>Últimas alterações</h2>{!dashboard.audit.length ? <p>Nenhuma alteração registrada no painel.</p> : <AuditList entries={dashboard.audit.slice(0, 5)} />}</section></div></>}
    {tab === "products" && can("products.view") && (editor ? <AdminProductEditor key={`${editor.product?.id ?? "new"}:${editor.product?.revision ?? 0}`} product={editor.product} catalog={catalog} user={user} onClose={() => setEditor(null)} onSaved={product => { setEditor({ product }); setNotice("Produto salvo com sucesso."); setData(value => value ? { ...value, catalog: { ...value.catalog, products: [...value.catalog.products.filter(item => item.id !== product.id), product].sort((a, b) => a.name.localeCompare(b.name, "pt-BR")) } } : value); void refresh().catch(error => setNotice(`Produto salvo. ${error instanceof Error ? error.message : "Atualize o painel para recarregar os totais."}`)); router.refresh(); }} /> : <><div className="admin-inventory-heading"><p>{filtered.length} produtos encontrados</p><button disabled={!can("products.create")} className="button primary" onClick={() => { setEditor({ product: null }); setNotice(""); }}><UiIcon name="add" />Novo produto</button></div><div className="admin-filters"><label>Buscar produto<input placeholder="Nome ou URL do produto" value={search} onChange={event => { setSearch(event.target.value); setVisible(25); }} /></label><label>Categoria<select value={category} onChange={event => { setCategory(event.target.value); setVisible(25); }}><option value="all">Todas as categorias</option>{catalog.categories.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><label>Situação<select value={status} onChange={event => { setStatus(event.target.value); setVisible(25); }}><option value="all">Todos</option><option value="active">Ativos</option><option value="draft">Desativados</option></select></label></div><section className="admin-price-control" aria-label="Controle de atualização dos preços"><div><h2>Preços para conferir</h2><p>Priorize as ofertas mais antigas e confira cada loja pela extensão.</p></div><div className="admin-price-control-counts"><button type="button" aria-pressed={priceFilter==="due"} onClick={()=>{setPriceFilter("due");setVisible(25);}}><strong>{dueCount}</strong><span>Precisam de atualização</span></button><button type="button" aria-pressed={priceFilter==="never"} onClick={()=>{setPriceFilter("never");setVisible(25);}}><strong>{neverCount}</strong><span>Sem conferência registrada</span></button></div><div className="admin-filters"><label>Conferir a cada<select value={priceDays} onChange={event=>{setPriceDays(Number(event.target.value));setVisible(25);}}>{[1,3,7,14,30].map(days=><option key={days} value={days}>{days} {days===1?"dia":"dias"}</option>)}</select></label><label>Atualização dos preços<select value={priceFilter} onChange={event=>{setPriceFilter(event.target.value);setVisible(25);}}><option value="all">Todos</option><option value="due">Precisam de atualização</option><option value="never">Sem conferência registrada</option><option value="recent">Conferidos recentemente</option><option value="no-offers">Sem oferta cadastrada</option></select></label><label>Ordenar produtos<select value={productSort} onChange={event=>{setProductSort(event.target.value);setVisible(25);}}><option value="priority">Prioridade: preços mais antigos</option><option value="name">Nome: A–Z</option></select></label></div><p className="admin-helper">Clique na loja para abrir o anúncio e atualizar pela extensão. A lista recarrega ao voltar ao painel.</p></section><div className="admin-inventory">{!filtered.length && <p className="admin-empty">Nenhum produto encontrado.</p>}{filtered.slice(0, visible).map(product => { const prices = product.offers.filter(offer => offer.available && offer.price !== null).map(offer => offer.price!); return <article className="admin-product-row" key={product.id}><div className="admin-product-thumbnail"><ProductImage name={product.name} url={product.imageUrl || null} sizes="60px" /></div><div className="admin-product-name"><strong>{product.name}</strong><small>{catalog.brands.find(brand => brand.id === product.brandId)?.name ?? "Marca não informada"} · {catalog.categories.find(category => category.id === product.category)?.name ?? product.category}</small><PriceUpdated kind="product" dates={[product.updatedAt]} /></div><button type="button" role="switch" aria-checked={statusBusy === product.id ? pendingActive : product.isActive} aria-busy={statusBusy === product.id} aria-label={`Produto ativo no site: ${product.name}`} className={`admin-status-toggle ${(statusBusy === product.id ? pendingActive : product.isActive) ? "active" : ""}`} disabled={!can("products.edit") || statusBusy !== null || deleteBusy !== null} onClick={() => void toggleActive(product)}><span className="admin-toggle-track" aria-hidden="true"><span /></span><small>{statusBusy === product.id ? "Salvando…" : product.isActive ? "Ativo" : "Desativado"}</small></button><span className="admin-product-price">{prices.length ? money(Math.min(...prices)) : "Sem preço"}</span><div className="admin-product-actions"><Link className="button secondary" href={`/produto/${product.id}`} target="_blank" rel="noopener noreferrer" aria-label={`Ver ${product.name} no site`}><UiIcon name="external" />Ver produto</Link><button className="button secondary" disabled={!can("products.edit")} aria-label={`Editar ${product.name}`} onClick={() => { setEditor({ product }); setNotice(""); }}><UiIcon name="edit" />Editar</button>{can("products.delete") && <button type="button" className="button secondary admin-delete-product" disabled={deleteBusy!==null || statusBusy!==null} aria-label={`Excluir ${product.name}`} onClick={()=>void removeProduct(product)}><UiIcon name="remove" />{deleteBusy===product.id?"Excluindo…":"Excluir"}</button>}</div><AdminPriceAge product={product} stores={catalog.stores} days={priceDays} now={priceNow} /></article>; })}</div>{filtered.length > visible && <div className="load-more"><button className="button secondary" onClick={() => setVisible(value => value + 25)}>Mostrar mais produtos ({filtered.length - visible})</button></div>}</>)}
    {can("import.manage") && <div hidden={tab !== "import"}><AdminExtension key={user.uid} user={user} /></div>}
    {tab === "references" && (can("brands.manage") || can("stores.manage")) && <div className="admin-references"><section className="admin-card"><div className="admin-reference-tabs" role="group" aria-label="Tipo de cadastro"><button disabled={!can("brands.manage")} aria-pressed={kind === "brands"} onClick={() => { setKind("brands"); setReferenceError(""); }}>Marcas</button><button disabled={!can("stores.manage")} aria-pressed={kind === "stores"} onClick={() => { setKind("stores"); setReferenceError(""); }}>Lojas</button></div><h2>{kind === "brands" ? "Marcas cadastradas" : "Lojas cadastradas"}</h2><ul className="admin-reference-list">{references.map(item => <li key={item.id}><strong>{item.name}</strong><small>{item.slug}</small></li>)}</ul></section><form className="admin-card" onSubmit={async event => { event.preventDefault(); setReferenceBusy(true); setReferenceError(""); try { await adminRequest(user, "references", { method: "POST", body: JSON.stringify({ kind, ...reference }) }); await refresh(); setReference({ name: "", slug: "", website: "" }); setNotice(kind === "brands" ? "Marca cadastrada." : "Loja cadastrada."); } catch (error) { setReferenceError(error instanceof Error ? error.message : "Não foi possível cadastrar."); } finally { setReferenceBusy(false); } }}><h2>{kind === "brands" ? "Adicionar marca" : "Adicionar loja"}</h2>{referenceError && <p role="alert" className="admin-alert">{referenceError}</p>}<label>Nome<input required maxLength={120} value={reference.name} onChange={event => setReference(current => ({ ...current, name: event.target.value, slug: !current.slug || current.slug === slugify(current.name) ? slugify(event.target.value) : current.slug }))} /></label><label>Identificador<input required maxLength={140} value={reference.slug} onChange={event => setReference(current => ({ ...current, slug: event.target.value }))} /></label>{kind === "stores" && <label>Site da loja<input type="url" value={reference.website} onChange={event => setReference(current => ({ ...current, website: event.target.value }))} /></label>}<button className="button primary" disabled={referenceBusy || !(kind === "brands" ? can("brands.manage") : can("stores.manage"))}><UiIcon name="save" />{referenceBusy ? "Cadastrando…" : "Cadastrar"}</button></form></div>}
    {tab === "categories" && can("categories.manage") && <AdminCategories key={JSON.stringify([catalog.categories,catalog.homeLimit])} user={user} catalog={catalog} onSaved={async()=>{await refresh();router.refresh();}} />}
    {tab === "users" && access.role === "administrator" && <AdminUsers user={user} onSaved={refresh} />}
    {tab === "audit" && can("audit.view") && <section className="admin-card"><h2>Atividade do painel</h2><p>As últimas 20 alterações registradas.</p>{dashboard.audit.length ? <AuditList entries={dashboard.audit} /> : <p className="admin-empty">Nenhuma alteração registrada ainda.</p>}</section>}
  </div></main>;
}
function AuditList({ entries }: { entries: AdminDashboard["audit"] }) { return <ul className="admin-audit-list">{entries.map(entry => <li key={entry.id}><span><strong>{auditLabels[entry.action] ?? "Alteração registrada"}</strong><span>{entry.name}</span><small>{entry.email}</small></span><time dateTime={entry.at}>{entry.at ? new Date(entry.at).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : ""}</time></li>)}</ul>; }
