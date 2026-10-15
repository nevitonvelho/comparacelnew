import { NextRequest,NextResponse } from "next/server";
import { getServerPopularComparisons } from "@/lib/server-metrics";
import { categoryNames } from "@/lib/product-model";
export const runtime="nodejs";
export async function GET(request:NextRequest) {
  const category=request.nextUrl.searchParams.get("category")??"todas";
  if(category!=="todas"&&!Object.hasOwn(categoryNames,category))return NextResponse.json({error:"Categoria inválida"},{status:400});
  try {
    const items=await getServerPopularComparisons();
    return NextResponse.json({comparisons:items.filter(item=>category==="todas"||item.category===category).slice(0,12),periodDays:7},{headers:{"Cache-Control":"no-store"}});
  }catch(error){
    console.error("Falha no ranking de comparações",error instanceof Error?error.message:"erro desconhecido");
    return NextResponse.json({error:"Comparações indisponíveis"},{status:503});
  }
}
