import { Timestamp, type Firestore } from "firebase-admin/firestore";
import { AdminError } from "./admin-model";
export async function saveRefreshedPrice(db:Firestore,actor:{uid:string;email?:string},id:string,offerId:string,expectedUrl:string,price:number|null, expectedCents:number|null,condition:"pix"|"standard"="standard") {
  if(price!==null && (!Number.isFinite(price)||price<=0))throw new AdminError("Preço inválido retornado pela fonte.",502);
  return db.runTransaction(async tx=>{
    const ref=db.doc(`products/${id}`);const snap=await tx.get(ref);
    if(!snap.exists)throw new AdminError("Produto não encontrado.",404);
    const data=snap.data()!;const offers=Array.isArray(data.offers)?data.offers.map((item:Record<string,unknown>)=>({...item})):[];
    const offer=offers.find((item:Record<string,unknown>)=>String(item.id)===offerId);
    if(!offer || offer.url!==expectedUrl)throw new AdminError("A oferta mudou durante a consulta. Atualize a lista.",409);
    if((offer.priceCents ?? null)!==expectedCents)throw new AdminError("O preço foi editado durante a consulta. Atualize a lista.",409);
    if(price===null) {
      const now=Date.now();
      offer.is_available=false;
      offer.unavailableSince ??= Timestamp.fromMillis(now);
      offer.priceCheckedAt=Timestamp.fromMillis(now);
      const prices=offers.filter((item:Record<string,unknown>)=>item.is_available===true && typeof item.url==='string' && item.url.trim() && typeof item.priceCents==='number' && Number.isFinite(item.priceCents) && Number(item.priceCents)>0).map((item:Record<string,unknown>)=>Number(item.priceCents));
      tx.update(ref,{offers,bestPriceCents:prices.length?Math.min(...prices):null,...(!prices.length?{isActive:false,is_active:false}:{}),adminRevision:(Number(data.adminRevision)||0)+1,updatedAt:Timestamp.fromMillis(now),updated_at:new Date(now).toISOString()});
      tx.create(db.collection("adminAudit").doc(),{action:"offer.unavailable",productId:id,offerId,actorUid:actor.uid,actorEmail:actor.email ?? "",createdAt:Timestamp.fromMillis(now)});
      return {changed:true,message:prices.length?"Oferta sem preço desativada; demais ofertas preservadas.":"Oferta sem preço desativada. Produto desativado para revisão."};
    }
    const baselineRef=db.doc(`priceHistory/baseline-${id}-${offerId}-${new Date().toISOString().slice(0,10)}`);
    const baseline=await tx.get(baselineRef);
    const cents=Math.round(price*100);const previous=offer.priceCents;const now=Date.now();const date=new Date(now).toISOString();
    offer.is_available=true;offer.unavailableSince=null;offer.priceCondition=condition;offer.priceCents=cents;offer.price=price;offer.priceCheckedAt=Timestamp.fromMillis(now);
    const prices=offers.filter((item:Record<string,unknown>)=>item.is_available===true && typeof item.priceCents==='number').map((item:Record<string,unknown>)=>Number(item.priceCents));
    tx.update(ref,{offers,bestPriceCents:prices.length?Math.min(...prices):null,adminRevision:(Number(data.adminRevision)||0)+1,updatedAt:Timestamp.fromMillis(now),updated_at:date});
    if(previous!==cents) {
      tx.create(db.collection("priceHistory").doc(),{productSlug:id,offerId,storeId:String(offer.storeId ?? offer.store),store:offer.store ?? offer.storeId,priceCents:cents,price,priceCondition:condition,previousPriceCents:previous ?? null,recorded_at:date,source:"admin-refresh"});
      tx.create(db.collection("adminAudit").doc(),{action:"product.price",productId:id,name:String(data.name ?? id),actorUid:actor.uid,actorEmail:actor.email ?? "",createdAt:Timestamp.fromMillis(now)});
    }
    if(previous===cents && !baseline.exists)tx.create(baselineRef,{productSlug:id,offerId,storeId:String(offer.storeId ?? offer.store),store:offer.store ?? offer.storeId,priceCents:cents,price,priceCondition:condition,recorded_at:date,source:"admin-baseline"});
    return {changed:previous!==cents,message:previous===cents?"Preço conferido, sem alteração.":"Preço atualizado e registrado no histórico."};
  });
}
