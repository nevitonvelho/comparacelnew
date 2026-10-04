import type { Firestore } from "firebase-admin/firestore";
import { adminProductFromData } from "./admin-store";
import { readCategorySettings } from "./category-settings";
function iso(value:unknown):string|undefined {
  if(typeof value==='string' && Number.isFinite(Date.parse(value)))return new Date(value).toISOString();
  const timestamp=value as {toDate?:()=>Date;seconds?:number;_seconds?:number}|null;
  if(timestamp?.toDate)return timestamp.toDate().toISOString();
  const seconds=timestamp?.seconds ?? timestamp?._seconds;
  return typeof seconds==='number' && Number.isFinite(seconds)?new Date(seconds*1000).toISOString():undefined;
}
export async function readAdminCatalogWithDates(db:Firestore) {
  const [products,brands,stores,settings]=await Promise.all([db.collection('products').get(),db.collection('brands').get(),db.collection('stores').get(),readCategorySettings(db)]);
  const references=(snapshot:typeof stores)=>snapshot.docs.map(doc=>({id:doc.id,name:String(doc.data().name ?? ''),slug:String(doc.data().slug ?? ''),website:String(doc.data().website ?? '')})).sort((a,b)=>a.name.localeCompare(b.name,'pt-BR'));
  return {...settings,brands:references(brands),stores:references(stores),products:products.docs.map(doc=>{
    const raw=doc.data();const product=adminProductFromData(doc.id,raw);
    return {...product,updatedAt:iso(raw.updatedAt ?? raw.updated_at),offers:product.offers.map((offer,index)=>({...offer,priceUpdatedAt:iso(raw.offers?.[index]?.priceCheckedAt)}))};
  }).sort((a,b)=>a.name.localeCompare(b.name,'pt-BR'))};
}
