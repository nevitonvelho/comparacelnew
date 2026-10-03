import type { Firestore } from "firebase-admin/firestore";
export const DAY_MS=24*60*60*1000;
export function activityDays(now:number,previous:Record<string,number>={},increment=false) {
  const today=new Date(now).toISOString().slice(0,10);
  const start=new Date(now-6*DAY_MS).toISOString().slice(0,10);
  const days=Object.fromEntries(Object.entries(previous).filter(([day,count])=>day>=start&&day<=today&&Number.isFinite(count)&&count>0));
  if(increment)days[today]=(days[today]??0)+1;
  return days;
}
export async function readPopularComparisons(db:Firestore,now:number) {
  const today=new Date(now).toISOString().slice(0,10);
  const start=new Date(new Date(`${today}T00:00:00.000Z`).getTime()-6*DAY_MS);
  const snapshot=await db.collection("comparisonActivity").where("updatedAt",">=",start).get();
  return snapshot.docs.map(document=>{
    const data=document.data();
    return {id:document.id,productIds:data.productIds as string[],category:data.category as string,views:Object.values(activityDays(now,data.dailyViews)).reduce((total,count)=>total+count,0),updatedAt:data.updatedAt.toMillis() as number};
  }).filter(item=>item.views>0).sort((a,b)=>b.views-a.views||b.updatedAt-a.updatedAt||a.id.localeCompare(b.id));
}
