import type { ReactNode } from "react";

export type SkeletonVariant = "catalog" | "product" | "comparison" | "account" | "article";

function Block({ className = "" }: { className?: string }) {
  return <span className={`skeleton-block ${className}`} />;
}

function LoadingRegion({ label, children }: { label: string; children: ReactNode }) {
  return <div className="skeleton-region" role="status" aria-live="polite" aria-busy="true">
    <span className="sr-only">{label}</span><div aria-hidden="true">{children}</div>
  </div>;
}

function Heading() {
  return <div className="skeleton-heading"><Block className="skeleton-eyebrow" /><Block className="skeleton-title" /><Block className="skeleton-line skeleton-wide" /></div>;
}

function Card() {
  return <div className="skeleton-card"><Block className="skeleton-image" /><div className="skeleton-card-body"><Block className="skeleton-line" /><Block className="skeleton-line skeleton-wide" /><Block className="skeleton-price" /><Block className="skeleton-button" /></div></div>;
}

export function CardsSkeleton({ count = 6, label = "Carregando produtos…" }: { count?: number; label?: string }) {
  return <LoadingRegion label={label}><div className="product-grid skeleton-cards">{Array.from({ length: count }, (_, index) => <Card key={index} />)}</div></LoadingRegion>;
}

export function ContentSkeleton({ variant = "article" }: { variant?: SkeletonVariant }) {
  const labels: Record<SkeletonVariant, string> = { catalog: "Carregando catálogo…", product: "Carregando produto…", comparison: "Carregando comparação…", account: "Carregando sua conta…", article: "Carregando página…" };
  return <LoadingRegion label={labels[variant]}><div className={`skeleton-content skeleton-${variant}`}>
    <Block className="skeleton-breadcrumb" /><Heading />
    {variant === "catalog" || variant === "account" ? <>
      <div className="skeleton-filters">{Array.from({ length: variant === "account" ? 3 : 4 }, (_, index) => <Block className="skeleton-control" key={index} />)}</div>
      <div className="product-grid skeleton-cards">{Array.from({ length: 6 }, (_, index) => <Card key={index} />)}</div>
    </> : variant === "product" ? <>
      <div className="skeleton-product-overview"><Block className="skeleton-product-image" /><div className="skeleton-product-info"><Block className="skeleton-line skeleton-wide" /><Block className="skeleton-line" /><Block className="skeleton-price" /><Block className="skeleton-button" /><Block className="skeleton-line skeleton-wide" /></div></div>
      <div className="skeleton-panel"><Block className="skeleton-subtitle" />{Array.from({ length: 4 }, (_, index) => <Block key={index} className="skeleton-row" />)}</div>
    </> : variant === "comparison" ? <>
      <div className="skeleton-comparison-pair"><Card /><Card /></div>
      <div className="skeleton-panel">{Array.from({ length: 5 }, (_, index) => <Block className="skeleton-row" key={index} />)}</div>
    </> : <div className="skeleton-article">{Array.from({ length: 3 }, (_, index) => <div className="skeleton-panel" key={index}><Block className="skeleton-subtitle" /><Block className="skeleton-line" /><Block className="skeleton-line" /><Block className="skeleton-line skeleton-wide" /></div>)}</div>}
  </div></LoadingRegion>;
}

export function PageSkeleton({ variant = "article" }: { variant?: SkeletonVariant }) {
  return <main id="conteudo"><ContentSkeleton variant={variant} /></main>;
}
