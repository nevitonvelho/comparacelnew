import { Suspense } from "react";
import { AdminPanel } from "../components/admin-panel";
import { pageMetadata } from "@/lib/seo";
export const metadata = { ...pageMetadata("Administração", "Painel administrativo do Comparacel.", "/admin"), robots: { index: false, follow: false } };
export default function Page() {
  return <Suspense fallback={<main id="conteudo" className="admin-access"><p role="status">Carregando administração…</p></main>}><AdminPanel /></Suspense>;
}
