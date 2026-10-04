import { comparisonSlug, type Product } from "./product-model";

export type ComparisonSuggestion = { id:string; product:Product; alternative:Product; reason:string; createdAt:number; href:string };
export function comparisonRecommendations(products:Product[], favorites:{productIds:string[];createdAt:number}[], saved:{productIds:string[]}[], now:number):ComparisonSuggestion[] {
  const existing = new Set(saved.map(item=>comparisonSlug(item.productIds)));
  const used = new Set<string>();
  const suggestions:ComparisonSuggestion[]=[];
  for (const favorite of [...favorites].sort((a,b)=>b.createdAt-a.createdAt)) {
    if (!Number.isFinite(favorite.createdAt) || favorite.createdAt<=0 || now<favorite.createdAt) continue;
    const product=products.find(item=>item.id===favorite.productIds[0]);
    if(!product) continue;
    const keys=new Set(product.specs.map(spec=>spec.slug));
    const candidates=products.filter(item=>item.category===product.category && item.id!==product.id && !existing.has(comparisonSlug([product.id,item.id]))).map(item=>{
      const shared=item.specs.filter(spec=>keys.has(spec.slug)).length;
      const overlap=shared/Math.max(keys.size,item.specs.length,1);
      const priceSimilarity=product.price!==null && product.price>0 && item.price!==null && item.price>0 ? Math.min(product.price,item.price)/Math.max(product.price,item.price) : 0;
      return {item,score:priceSimilarity*0.65+overlap*0.3+(item.brand===product.brand?0.05:0),priceSimilarity,overlap};
    }).sort((a,b)=>b.score-a.score || a.item.id.localeCompare(b.item.id));
    if(!candidates.length) continue;
    const candidate=candidates[0];
    const pair=comparisonSlug([product.id,candidate.item.id]);
    if(used.has(pair)) continue;
    used.add(pair);
    suggestions.push({id:pair,product,alternative:candidate.item,reason:candidate.priceSimilarity>=0.75?"Da mesma categoria e com preço próximo.":candidate.overlap>=0.5?"Da mesma categoria e com características em comum.":"Uma alternativa da mesma categoria para você comparar.",createdAt:now,href:`/comparar/${pair}`});
  }
  return suggestions.sort((a,b)=>b.createdAt-a.createdAt).slice(0,6);
}

export const suggestionSpacing = 10 * 60 * 1000;
export const suggestionLifetime = 2 * 86400000;
export type NoticeLedger = { day:string; count:number; lastAt:number; issued:string[]; messages:{pair:string;createdAt:number}[]; shownDay:string };
export function localNoticeDay(now:number) { const date=new Date(now);return `${date.getFullYear()}-${date.getMonth()+1}-${date.getDate()}`; }
export function cleanNoticeLedger(value:unknown, now:number):NoticeLedger {
  const day=localNoticeDay(now);const data=value && typeof value==='object'?value as Partial<NoticeLedger>:{};
  const sameDay=data.day===day;
  const messages=Array.isArray(data.messages)?data.messages.filter(item=>item && typeof item.pair==='string' && Number.isFinite(item.createdAt) && item.createdAt<=now && now-item.createdAt<suggestionLifetime).slice(-12):[];
  return {day,count:sameDay && Number.isInteger(data.count)?Math.max(0,Math.min(6,data.count!)):0,lastAt:Number.isFinite(data.lastAt)?data.lastAt!:0,issued:sameDay && Array.isArray(data.issued)?data.issued.filter(item=>typeof item==='string').slice(0,6):[],messages,shownDay:typeof data.shownDay==='string'?data.shownDay:''};
}
export function appendNotice(ledger:NoticeLedger, pair:string, now:number):boolean {
  if(ledger.count>=6 || ledger.lastAt>0 && now-ledger.lastAt<suggestionSpacing || ledger.issued.includes(pair) || ledger.messages.some(item=>item.pair===pair))return false;
  ledger.messages.push({pair,createdAt:now});ledger.issued.push(pair);ledger.count++;ledger.lastAt=now;return true;
}
