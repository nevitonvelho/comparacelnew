import "server-only";
import { cache } from "react";
import { getAdminDatabase } from "./firebase/admin";
import { productFromData } from "./product-data";
function date(value:unknown):string|undefined {
  if(typeof value==='string' && Number.isFinite(Date.parse(value)))return new Date(value).toISOString();
  const stamp=value as {toDate?:()=>Date;seconds?:number;_seconds?:number}|null;
  if(stamp?.toDate)return stamp.toDate().toISOString();
  const seconds=stamp?.seconds ?? stamp?._seconds;
  return typeof seconds==='number' && Number.isFinite(seconds)?new Date(seconds*1000).toISOString():undefined;
}
// Product pages read their own document, independently of the catalog cache.
export const readServerProduct=cache(async(id:string)=>{
  if(!id || id.includes('/'))return undefined;
  const snapshot=await getAdminDatabase().collection('products').doc(id).get();
  const data=snapshot.data();
  if(!data || data.isActive!==true)return undefined;
  const product=productFromData(id,data);
  return {...product,updatedAt:date(data.updatedAt ?? data.updated_at),offers:product.offers.map((offer,index)=>({...offer,priceUpdatedAt:date(data.offers?.[index]?.priceCheckedAt)}))};
});
