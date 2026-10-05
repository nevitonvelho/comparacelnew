import type { AdminProduct,AdminReference } from "@/lib/admin-model";
import { productPriceFreshness,priceAgeLabel,offerProductPage } from "@/lib/admin-price-freshness";
export function AdminPriceAge({product,stores,days,now}:{product:AdminProduct;stores:AdminReference[];days:number;now:number}) {
  const health=productPriceFreshness(product,days,now);
  const labels={fresh:"Preços recentes",attention:"Conferir em breve",due:"Atualizar preço",never:"Sem conferência","no-offers":"Sem oferta cadastrada",unavailable:"Oferta indisponível"};
  return <div className="admin-price-age"><span className={`price-age-badge price-age-${health.state}`}>{health.state==="fresh" && health.offers.every(entry=>!entry.offer.available)?"Conferência recente":labels[health.state]}</span><div className="admin-price-offer-links">{health.offers.map(entry=>{
    const name=stores.find(store=>store.id===entry.offer.storeId)?.name ?? "Loja";
    const url=offerProductPage(entry.offer,name);
    const label=entry.offer.available?priceAgeLabel(entry.ageDays):`Indisponível${entry.ageDays===null?"":` · ${priceAgeLabel(entry.ageDays)}`}`;
    return url?<a key={entry.offer.storeId} href={url} target="_blank" rel="noopener noreferrer" className={`price-age-link price-age-${entry.state}${entry.offer.available?"":" price-age-unavailable"}`} aria-label={`Abrir ${name} para conferir ${product.name}: ${label}`} title="Abra o anúncio e use a extensão para atualizar o preço"><span className="price-age-dot" aria-hidden="true" /><span className="price-age-store">{name}</span><span className="price-age-time">{label}</span><span className="price-age-external" aria-hidden="true">↗</span></a>:<small key={entry.offer.storeId}>{name} · {label}</small>;
  })}</div></div>;
}
