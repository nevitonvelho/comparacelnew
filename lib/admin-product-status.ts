import { Timestamp, type Firestore } from "firebase-admin/firestore";
import { AdminError } from "./admin-model";
import { adminProductFromData } from "./admin-store";
export async function setAdminProductActive(db: Firestore, actor: { uid:string;email?:string }, id:string, value:unknown) {
  const input=value as {revision?:unknown;isActive?:unknown};
  if(!input || typeof input.isActive!=="boolean" || !Number.isInteger(input.revision) || Number(input.revision)<0) throw new AdminError("Confira a situação do produto.");
  if(!id || id.includes("/") || id.length>400) throw new AdminError("Produto inválido.");
  return db.runTransaction(async tx=>{
    const ref=db.collection("products").doc(id);const snapshot=await tx.get(ref);
    if(!snapshot.exists) throw new AdminError("Produto não encontrado.",404);
    const old=snapshot.data()!;
    if((Number(old.adminRevision)||0)!==input.revision) throw new AdminError("O produto foi alterado em outra aba. Atualize a lista antes de tentar novamente.",409);
    const now=Date.now();
    const patch={isActive:input.isActive,is_active:input.isActive,adminRevision:Number(input.revision)+1,updatedAt:Timestamp.fromMillis(now),updated_at:new Date(now).toISOString()};
    tx.update(ref,patch);
    tx.create(db.collection("adminAudit").doc(),{action:"product.status",name:typeof old.name === "string" ? old.name : "Produto",productId:id,actorUid:actor.uid,actorEmail:actor.email ?? "",createdAt:Timestamp.fromMillis(now),isActive:input.isActive});
    return adminProductFromData(id,{...old,...patch});
  });
}
