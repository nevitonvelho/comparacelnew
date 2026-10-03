import type { Metadata } from "next";
import { categoryNames, type Product } from "./product-model";

export const siteUrl = new URL(process.env.NEXT_PUBLIC_SITE_URL || "https://comparacel.com.br").origin;
export const siteName = "Comparacel";
export const absoluteUrl = (path: string) => new URL(path, siteUrl).href;
export function pageMetadata(title: string, description: string, path: string, image?: string | null): Metadata {
  const images = [{ url: image || absoluteUrl("/brand/comparacel.png"), alt: image ? title : siteName }];
  return {
    title, description, alternates: { canonical: absoluteUrl(path) },
    openGraph: { type: "website", locale: "pt_BR", siteName, title: `${title} | ${siteName}`, description, url: absoluteUrl(path), images },
    twitter: { card: "summary_large_image", title: `${title} | ${siteName}`, description, images: images.map(item => item.url) },
  };
}
export function productDescription(product: Product) {
  return `Confira preços, ofertas e a ficha técnica de ${product.name}. Compare com outros produtos de ${categoryNames[product.category] ?? product.category} no Comparacel.`;
}
export function productSchema(product: Product) {
  const offers = product.offers.filter(offer => offer.available && offer.url && offer.price !== null && offer.price > 0);
  return {
    "@context": "https://schema.org", "@type": "Product", "@id": `${absoluteUrl(`/produto/${product.id}`)}#product`,
    name: product.name, url: absoluteUrl(`/produto/${product.id}`), description: productDescription(product),
    ...(product.brand !== "—" ? { brand: { "@type": "Brand", name: product.brand } } : {}),
    ...(product.imageUrl ? { image: [product.imageUrl] } : {}),
    ...(offers.length ? { offers: { "@type": "AggregateOffer", priceCurrency: "BRL", lowPrice: Math.min(...offers.map(offer => offer.price!)), highPrice: Math.max(...offers.map(offer => offer.price!)), offerCount: offers.length, offers: offers.map(offer => ({ "@type": "Offer", url: offer.url, price: offer.price, priceCurrency: "BRL", seller: { "@type": "Organization", name: offer.store } })) } } : {}),
  };
}
export function breadcrumbs(items: { name: string; path: string }[]) {
  return { "@context": "https://schema.org", "@type": "BreadcrumbList", itemListElement: items.map((item, index) => ({ "@type": "ListItem", position: index + 1, name: item.name, item: absoluteUrl(item.path) })) };
}
export const serializeJsonLd = (value: unknown) => JSON.stringify(value).replace(/</g, "\\u003c");
