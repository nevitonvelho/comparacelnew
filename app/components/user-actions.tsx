"use client";
import { Notifications } from "./notifications";
import { UiIcon } from "./icons";
import Link from "next/link";
import Image from "next/image";
import { useState } from "react";
import { comparisonSlug } from "@/lib/product-model";
import { authError, useAuth } from "./auth-provider";
import { useLibrary, type LibraryKind } from "./library-provider";

function AccountAvatar({ name, photoURL }: { name: string; photoURL: string | null }) {
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  return <span className="user-initial">{photoURL && photoURL !== failedUrl
    ? <Image src={photoURL} width={30} height={30} alt="" unoptimized referrerPolicy="no-referrer" onError={() => setFailedUrl(photoURL)} />
    : name.slice(0, 1).toUpperCase()}</span>;
}

export function AuthControl() {
  const { user, loading, login } = useAuth();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  return <div className="auth-control">{user ? <div className="account-actions"><Link className="header-icon-button" href="/minha-conta?aba=favoritos" aria-label="Meus favoritos" title="Meus favoritos"><UiIcon name="heart" /></Link><Notifications /><Link className="account-link" href="/minha-conta" aria-label="Minha conta" title="Minha conta"><AccountAvatar name={user.displayName || "Você"} photoURL={user.photoURL} /></Link></div> : <button className="button secondary google-login" disabled={loading || busy} onClick={async () => { setBusy(true); setError(""); try { await login(); } catch (error) { setError(authError(error)); } finally { setBusy(false); } }}><Image className="google-icon" src="/brand/google-g.png" alt="" width={20} height={20} />{busy ? "Entrando…" : "Entrar com Google"}</button>}{error && <p role="alert" className="auth-error">{error}</p>}</div>;
}
export function LibraryButton({ kind, productIds, compact = false }: { kind: LibraryKind; productIds: string[]; compact?: boolean }) {
  const { user, loading: authLoading } = useAuth();
  const { items, loading, error, toggle } = useLibrary();
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [failed, setFailed] = useState(false);
  const id = kind === "likedProducts" ? productIds[0] : comparisonSlug(productIds);
  const active = items[kind].some(item => item.id === id);
  const save = kind === "savedComparisons";
  const label = save ? active ? "Comparação salva" : "Salvar comparação" : active ? "Favoritado" : "Favoritar";
  const accessible = save ? active ? "Remover comparação salva" : "Salvar comparação" : kind === "likedProducts" ? active ? "Remover produto dos favoritos" : "Favoritar produto" : active ? "Remover comparação dos favoritos" : "Favoritar comparação";
  return <div className={`library-action ${compact ? "compact" : ""}`}><button className={`library-button ${active ? "is-liked" : ""}`} aria-label={accessible} aria-pressed={active} disabled={busy || authLoading || Boolean(user && (loading || error))} title={!user ? "Entre com Google para guardar na sua conta" : accessible} onClick={async () => {
    setBusy(true); setFeedback(""); setFailed(false);
    try { await toggle(kind, productIds); setFeedback(active ? "Removido da sua conta." : save ? "Comparação salva na sua conta." : "Adicionado aos seus favoritos."); }
    catch (error) { setFailed(true); setFeedback(authError(error)); }
    finally { setBusy(false); }
  }}><span aria-hidden="true"><UiIcon name={save ? active ? "bookmarkFilled" : "bookmark" : active ? "heartFilled" : "heart"} /></span>{!compact && <span>{busy ? "Salvando…" : label}</span>}</button>{feedback && <span className="library-feedback" role={failed ? "alert" : "status"}>{feedback}</span>}</div>;
}
