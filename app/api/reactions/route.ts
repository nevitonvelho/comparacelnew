import { NextRequest, NextResponse } from "next/server";
import { getAdminAuth,getAdminDatabase } from "@/lib/firebase/admin";
import { pageIdentity } from "@/lib/engagement-model";
import { validReaction } from "@/lib/reaction-model";
import { ReactionError,recordReaction } from "@/lib/reaction-store";
export const runtime="nodejs";
const headers={"Cache-Control":"no-store"};
export async function POST(request:NextRequest) {
  if(request.headers.get("origin")!==request.nextUrl.origin)return NextResponse.json({error:"Origem inválida."},{status:403,headers});
  const authorization=request.headers.get("authorization");
  if(!authorization?.startsWith("Bearer "))return NextResponse.json({error:"Entre com Google para reagir."},{status:401,headers});
  try {
    const raw=await request.text();
    if(raw.length>4096) return NextResponse.json({error:"Pedido inválido."},{status:400,headers});
    let body;
    try {body=JSON.parse(raw);}catch{return NextResponse.json({error:"Pedido inválido."},{status:400,headers});}
    const identity=pageIdentity(body?.kind,body?.productIds);
    if(!identity||identity.kind!=="product"||!validReaction(body?.reaction))return NextResponse.json({error:"Reação inválida."},{status:400,headers});
    let account;
    try {account=await getAdminAuth().verifyIdToken(authorization.slice(7),true);}catch{return NextResponse.json({error:"Sua sessão expirou. Entre novamente para reagir."},{status:401,headers});}
    if(account.firebase.sign_in_provider!=="google.com"||account.email_verified!==true)return NextResponse.json({error:"Use uma conta Google verificada para reagir."},{status:403,headers});
    const result=await recordReaction(getAdminDatabase(),account.uid,identity,body.reaction,Date.now());
    return NextResponse.json(result,{headers});
  }catch(error){
    if(error instanceof ReactionError)return NextResponse.json({error:error.message},{status:error.status,headers:{...headers,...(error.retryAfter?{"Retry-After":String(error.retryAfter)}:{})}});
    console.error("Falha ao registrar reação",error instanceof Error?error.message:"erro desconhecido");
    return NextResponse.json({error:"Não foi possível registrar sua reação. Tente novamente."},{status:503,headers});
  }
}
