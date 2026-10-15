import "server-only";
import { cache } from "react";
import { unstable_cache } from "next/cache";
import { publicCacheOptions } from "./public-cache";
import { getAdminDatabase } from "./firebase/admin";
import { productFromData, PUBLIC_PRODUCT_FIELDS } from "./product-data";
function date(value:unknown):string|undefined {
  if(typeof value==='string' && Number.isFinite(Date.parse(value)))return new Date(value).toISOString();
  const stamp=value as {toDate?:()=>Date;seconds?:number;_seconds?:number}|null;
  if(stamp?.toDate)return stamp.toDate().toISOString();
  const seconds=stamp?.seconds ?? stamp?._seconds;
  return typeof seconds==='number' && Number.isFinite(seconds)?new Date(seconds*1000).toISOString():undefined;
}
// Cache individual documents without loading the entire catalog.
export const readServerProduct=cache(unstable_cache(async(id:string)=>{
  if(!id || id.includes('/'))return null;
  const db=getAdminDatabase();
  const [snapshot]=await db.getAll(db.collection('products').doc(id), {fieldMask:PUBLIC_PRODUCT_FIELDS});
  const data=snapshot.data();
  if(!data || data.isActive!==true)return null;
  const product=productFromData(id,data);
  return {...product,updatedAt:date(data.updatedAt ?? data.updated_at),offers:product.offers.map((offer,index)=>({...offer,priceUpdatedAt:date(data.offers?.[index]?.priceCheckedAt)}))};
}, ["public-product-mysql-v2"], publicCacheOptions));
