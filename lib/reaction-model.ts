import type { PageKind } from "./engagement-model";
export type Reaction = "sad" | "happy" | "delighted";
export type ReactionCounts = Record<Reaction,number>;
export const emptyReactions: ReactionCounts = { sad:0, happy:0, delighted:0 };
export const REACTION_DAILY_LIMIT=20;
export const REACTION_GLOBAL_COOLDOWN_MS=10_000;
export const REACTION_CHANGE_COOLDOWN_MS=60_000;
export const REACTION_WINDOW_MS=24*60*60*1000;
export function validReaction(value:unknown):value is Reaction|null {
  return value===null||value==="sad"||value==="happy"||value==="delighted";
}
export function reactionSummary(counts:ReactionCounts) {
  const total=counts.sad+counts.happy+counts.delighted;
  // Ten prior opinions at 60% temper the effect of small samples.
  const score=(6+counts.happy*0.75+counts.delighted)/(10+total);
  const status=total<10?"pending":score>=0.65?"high":score<=0.4?"low":"mixed";
  const label=status==="pending"?"Aguardando opiniões":status==="high"?"Em alta":status==="low"?"Em baixa":"Opiniões variadas";
  return { total, score, status, label };
}
export function reactionOptions(kind:PageKind) {
  return [
    {key:"sad" as const,label:kind==="product"?"Não gostei":"Não ajudou"},
    {key:"happy" as const,label:kind==="product"?"Gostei":"Ajuda"},
    {key:"delighted" as const,label:kind==="product"?"Adorei":"Muito útil"},
  ];
}
