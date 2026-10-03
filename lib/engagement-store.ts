import { Timestamp, type Firestore } from "firebase-admin/firestore";
import { activityDays } from "./comparison-activity";
import { shouldCountVisit, type PageKind } from "./engagement-model";

type Identity={kind:PageKind;ids:string[];key:string};
export async function recordVisit(db:Firestore,identity:Identity,visitorHash:string,now:number) {
  const reference=db.collection("pageStats").doc(identity.key);
  const receipt=reference.collection("visitors").doc(visitorHash);
  return db.runTransaction(async transaction=>{
    const products=await transaction.getAll(...identity.ids.map(id=>db.collection("products").doc(id)));
    if(products.some(product=>!product.exists||product.data()?.isActive!==true)
      || (products.length===2&&products[0].data()?.categorySlug!==products[1].data()?.categorySlug)) return false;
    const [stats,last]=await transaction.getAll(reference,receipt);
    const activity=identity.kind==="comparison"?db.collection("comparisonActivity").doc(identity.ids.join("-vs-")):null;
    const previousActivity=activity?await transaction.get(activity):null;
    const countView=shouldCountVisit(last.data()?.lastSeen?.toMillis(),now);
    const countComparison=activity&&shouldCountVisit(last.data()?.activityCountedAt?.toMillis(),now);
    if(countView)transaction.set(reference,{views:(stats.data()?.views??0)+1,updatedAt:Timestamp.fromMillis(now)},{merge:true});
    if(countComparison)transaction.set(activity!,{productIds:identity.ids,category:products[0].data()!.categorySlug,dailyViews:activityDays(now,previousActivity?.data()?.dailyViews,true),updatedAt:Timestamp.fromMillis(now)});
    if(countView||countComparison)transaction.set(receipt,{
      ...(countView?{lastSeen:Timestamp.fromMillis(now)}:{}),
      ...(countComparison?{activityCountedAt:Timestamp.fromMillis(now)}:{}),
      expiresAt:Timestamp.fromMillis(now+7*24*60*60*1000),
    },{merge:true});
    return true;
  });
}
export async function readCounts(db:Firestore,{kind,ids,key}:Identity) {
  const likes=kind==="product"
    ? db.collectionGroup("likedProducts").where("productId","==",ids[0])
    : db.collectionGroup("likedComparisons").where("productIds","==",ids);
  const [stats,count]=await Promise.all([db.collection("pageStats").doc(key).get(),likes.count().get()]);
  return {views:stats.data()?.views??0,likes:count.data().count};
}
