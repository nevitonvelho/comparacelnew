import { NextRequest,NextResponse } from "next/server";
import { getAdminDatabase } from "@/lib/firebase/admin";
import { readPopularComparisons } from "@/lib/comparison-activity";
import { categoryNames } from "@/lib/product-model";
export const runtime="nodejs";
let pending:Promise<Awaited<ReturnType<typeof readPopularComparisons>>>|null=null;
export async function GET(request:NextRequest) {
  const category=request.nextUrl.searchParams.get("category")??"todas";
  if(category!=="todas"&&!Object.hasOwn(categoryNames,category))return NextResponse.json({error:"Categoria inválida"},{status:400});
  try {
    pending??=readPopularComparisons(getAdminDatabase(),Date.now());
    let items;
    try { items=await pending; } finally { pending=null; }
    return NextResponse.json({comparisons:items.filter(item=>category==="todas"||item.category===category).slice(0,12),periodDays:7},{headers:{"Cache-Control":"no-store"}});
  }catch(error){
    console.error("Falha no ranking de comparações",error instanceof Error?error.message:"erro desconhecido");
    return NextResponse.json({error:"Comparações indisponíveis"},{status:503});
  }
}
