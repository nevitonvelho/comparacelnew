import { NextRequest,NextResponse } from "next/server";
import { getAdminDatabase } from "@/lib/firebase/admin";
import { pageIdentity } from "@/lib/engagement-model";
import { readProductMetrics } from "@/lib/product-metrics-store";
export const runtime="nodejs";
const headers={"Cache-Control":"no-store"};
export async function POST(request:NextRequest) {
  if(request.headers.get("origin")!==request.nextUrl.origin)return NextResponse.json({error:"Origem inválida"},{status:403,headers});
  try {
    const raw=await request.text();
    if(raw.length>12000)return NextResponse.json({error:"Pedido inválido"},{status:400,headers});
    let body;
    try{body=JSON.parse(raw);}catch{return NextResponse.json({error:"Pedido inválido"},{status:400,headers});}
    if(!Array.isArray(body?.ids)||!body.ids.length||body.ids.length>24||body.ids.some((id:unknown)=>!pageIdentity("product",[id])))return NextResponse.json({error:"Produtos inválidos"},{status:400,headers});
    const ids=[...new Set(body.ids)] as string[];
    const db=getAdminDatabase();
    const products=await db.getAll(...ids.map(id=>db.doc(`products/${id}`)));
    const active=products.filter(product=>product.data()?.isActive===true);
    const results=await Promise.all(active.map(async product=>[product.id,await readProductMetrics(db,product.id)] as const));
    return NextResponse.json({products:Object.fromEntries(results)},{headers});
  }catch(error){
    console.error("Falha nas métricas de produto",error instanceof Error?error.message:"erro desconhecido");
    return NextResponse.json({error:"Métricas indisponíveis"},{status:503,headers});
  }
}
