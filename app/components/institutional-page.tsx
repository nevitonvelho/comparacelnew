import Link from "next/link";
import type { ReactNode } from "react";
import { institutionalPages } from "@/lib/institutional";

export function InstitutionalPage({ path, title, description, children }: {
  path: string; title: string; description: string; children: ReactNode;
}) {
  return <main id="conteudo" className="institutional-page">
    <nav className="institutional-breadcrumb" aria-label="Caminho da página"><Link href="/">Início</Link><span aria-hidden="true">/</span><span>{title}</span></nav>
    <header className="institutional-header"><span className="eyebrow">COMPARACEL • INSTITUCIONAL</span><h1>{title}</h1><p>{description}</p><small>Atualizado em <time dateTime="2026-10-17">17 de outubro de 2026</time></small></header>
    <div className="institutional-layout"><aside><nav className="institutional-nav" aria-label="Páginas institucionais">{institutionalPages.map(page => <Link key={page.path} href={page.path} aria-current={page.path === path ? "page" : undefined}>{page.title}</Link>)}</nav></aside><article className="institutional-content">{children}</article></div>
  </main>;
}
