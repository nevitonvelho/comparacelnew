import type { Firestore } from "firebase-admin/firestore";
export async function readProductMetrics(db:Firestore,id:string) {
  const [visits,favorites,saves]=await Promise.all([
    db.doc(`pageStats/product:${id}`).get(),
    db.collectionGroup("likedProducts").where("productId","==",id).count().get(),
    db.collectionGroup("savedComparisons").where("productIds","array-contains",id).select().get(),
  ]);
  const savers=new Set(saves.docs.filter(document=>/^users\/[^/]+\/savedComparisons\/[^/]+$/.test(document.ref.path)).map(document=>document.ref.parent.parent!.id));
  return {views:visits.data()?.views??0,favorites:favorites.data().count,saved:savers.size};
}
