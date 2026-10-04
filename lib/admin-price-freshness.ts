import type { AdminOffer, AdminProduct } from "./admin-model";
export type PriceFreshness = "fresh" | "attention" | "due" | "never" | "no-offers";
export function offerPriceFreshness(offer:AdminOffer,days=7,now=Date.now()) {
  const date=offer.priceUpdatedAt?Date.parse(offer.priceUpdatedAt):NaN;
  if(!Number.isFinite(date) || date>now+60000)return {state:"never" as PriceFreshness,ageDays:null,checkedAt:null};
  const ageDays=Math.max(0,Math.floor((now-date)/86400000));
  const state:PriceFreshness=offer.price===null || ageDays>=days?"due":ageDays>=Math.max(1,Math.ceil(days/2))?"attention":"fresh";
  return {state,ageDays,checkedAt:date};
}
export function productPriceFreshness(product:AdminProduct,days=7,now=Date.now()) {
  const offers=product.offers.filter(offer=>offer.url);
  if(!offers.length)return {state:"no-offers" as PriceFreshness,oldest:null,offers:[]};
  const entries=offers.map(offer=>({offer,...offerPriceFreshness(offer,days,now)}));
  const priority={never:0,due:1,attention:2,fresh:3,"no-offers":4};
  entries.sort((a,b)=>priority[a.state]-priority[b.state] || (a.checkedAt ?? 0)-(b.checkedAt ?? 0));
  return {state:entries[0].state,oldest:entries[0].checkedAt,offers:entries};
}
export function priceAgeLabel(ageDays:number|null) {
  return ageDays===null?"Sem data de conferência":ageDays===0?"Conferido hoje":ageDays===1?"Há 1 dia":`Há ${ageDays} dias`;
}
export function offerProductPage(offer:AdminOffer,storeName:string) {
  const id=offer.externalId ?? "";
  if(/amazon/i.test(storeName) && /^[A-Z0-9]{10}$/.test(id))return `https://www.amazon.com.br/dp/${id}`;
  if(/^item-MLB\d+$/.test(id))return `https://produto.mercadolivre.com.br/MLB-${id.slice(8)}`;
  if(/^MLB\d+$/.test(id))return `https://www.mercadolivre.com.br/p/${id}`;
  try {const url=new URL(offer.url);return ["https:","http:"].includes(url.protocol)?url.href:"";}catch{return "";}
}
