import { Timestamp, type Firestore } from "firebase-admin/firestore";
import { type PageKind } from "./engagement-model";
import { emptyReactions,REACTION_DAILY_LIMIT,REACTION_WINDOW_MS,REACTION_GLOBAL_COOLDOWN_MS,REACTION_CHANGE_COOLDOWN_MS,type Reaction } from "./reaction-model";

type Identity={kind:PageKind;ids:string[];key:string};
export class ReactionError extends Error {
  constructor(public status:number,message:string,public retryAfter=0) {super(message);}
}
export async function recordReaction(db:Firestore,uid:string,identity:Identity,reaction:Reaction|null,now:number) {
  const reference=db.collection("reactionStats").doc(identity.key);
  const vote=db.collection("users").doc(uid).collection("reactions").doc(identity.key);
  const budget=db.collection("reactionBudgets").doc(uid);
  return db.runTransaction(async transaction=>{
    const products=await transaction.getAll(...identity.ids.map(id=>db.collection("products").doc(id)));
    if(products.some(product=>!product.exists||product.data()?.isActive!==true)
      || (products.length===2&&products[0].data()?.categorySlug!==products[1].data()?.categorySlug)) throw new ReactionError(404,"Produto ou comparação indisponível.");
    const [stats,previous,quota]=await transaction.getAll(reference,vote,budget);
    const old=previous.data()?.reaction as Reaction|undefined;
    const counts={...emptyReactions,...stats.data()?.counts};
    if((old??null)===reaction)return {counts,reaction};
    const quotaData=quota.data();
    const inWindow=quota.exists&&now-quotaData?.windowStartedAt.toMillis()<REACTION_WINDOW_MS;
    const actions=inWindow?quotaData?.actions??0:0;
    if(reaction!==null) {
      if(actions>=REACTION_DAILY_LIMIT)throw new ReactionError(429,"Você chegou ao limite de 20 reações ou alterações em 24 horas. Tente novamente mais tarde.",Math.ceil((quotaData!.windowStartedAt.toMillis()+REACTION_WINDOW_MS-now)/1000));
      const lastAction=quotaData?.lastActionAt?.toMillis();
      const lastChange=previous.data()?.updatedAt?.toMillis();
      const delay=Math.max(lastAction===undefined?0:REACTION_GLOBAL_COOLDOWN_MS-(now-lastAction),lastChange===undefined?0:REACTION_CHANGE_COOLDOWN_MS-(now-lastChange));
      if(delay>0)throw new ReactionError(429,`Aguarde ${Math.ceil(delay/1000)} segundos antes de reagir novamente.`,Math.ceil(delay/1000));
      transaction.set(budget,{windowStartedAt:inWindow?quotaData!.windowStartedAt:Timestamp.fromMillis(now),actions:actions+1,lastActionAt:Timestamp.fromMillis(now)});
    }
    if(old)counts[old]=Math.max(0,counts[old]-1);
    if(reaction)counts[reaction]+=1;
    transaction.set(reference,{counts,total:counts.sad+counts.happy+counts.delighted,updatedAt:Timestamp.fromMillis(now)});
    // Keep withdrawal as a tombstone: removing and adding cannot bypass cooldown.
    transaction.set(vote,{kind:identity.kind,productIds:identity.ids,reaction,updatedAt:Timestamp.fromMillis(now)});
    return {counts,reaction};
  });
}
