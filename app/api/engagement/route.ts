import { createHash, createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { getAdminDatabase } from "@/lib/firebase/admin";
import { pageIdentity } from "@/lib/engagement-model";

import { recordVisit, readCounts } from "@/lib/engagement-store";

export const runtime = "nodejs";
const cookieName = "comparacel_visitor";
const headers = { "Cache-Control":"no-store" };
function visitor(request: NextRequest) {
  const secret = process.env.VIEWS_COOKIE_SECRET;
  if (!secret) throw new Error("VIEWS_COOKIE_SECRET ausente");
  const sign = (id:string) => createHmac("sha256",secret).update(id).digest("hex");
  const [id,signature] = (request.cookies.get(cookieName)?.value ?? "").split(".");
  if (id && /^[0-9a-f-]{36}$/.test(id) && signature && /^[0-9a-f]{64}$/.test(signature)
    && timingSafeEqual(Buffer.from(signature),Buffer.from(sign(id)))) return {id,value:null};
  const newId=randomUUID();
  return {id:newId,value:`${newId}.${sign(newId)}`};
}
export async function POST(request:NextRequest) {
  if (request.headers.get("origin") !== request.nextUrl.origin) return NextResponse.json({error:"Origem inválida"},{status:403,headers});
  try {
    if(Number(request.headers.get("content-length")??0)>4096) return NextResponse.json({error:"Pedido inválido"},{status:400,headers});
    const raw=await request.text();
    if(raw.length>4096)return NextResponse.json({error:"Pedido inválido"},{status:400,headers});
    let body;
    try { body=JSON.parse(raw); } catch { return NextResponse.json({error:"Pedido inválido"},{status:400,headers}); }
    const identity=pageIdentity(body?.kind,body?.productIds);
    if(!identity)return NextResponse.json({error:"Página inválida"},{status:400,headers});
    const db=getAdminDatabase();
    const account=visitor(request);
    const now=Date.now();
    const valid=await recordVisit(db,identity,createHash("sha256").update(account.id).digest("hex"),now);
    if(!valid)return NextResponse.json({error:"Página indisponível"},{status:404,headers});
    const response=NextResponse.json(await readCounts(db,identity),{headers});
    if(account.value)response.cookies.set(cookieName,account.value,{httpOnly:true,sameSite:"lax",secure:request.nextUrl.protocol==="https:",path:"/",maxAge:365*24*60*60});
    return response;
  } catch(error) {
    console.error("Falha no contador de visitas",error instanceof Error?error.message:"erro desconhecido");
    return NextResponse.json({error:"Estatísticas indisponíveis"},{status:503,headers});
  }
}
