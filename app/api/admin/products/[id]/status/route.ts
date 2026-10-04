import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { adminFailure, adminHeaders, readAdminJson, requireAdministrator } from "@/lib/admin-api";
import { getAdminDatabase } from "@/lib/firebase/admin";
import { setAdminProductActive } from "@/lib/admin-product-status";
import { invalidateServerCatalog } from "@/lib/server-catalog";
export const runtime="nodejs";
export async function PATCH(request:NextRequest,{params}:{params:Promise<{id:string}>}) {
  try {
    const account=await requireAdministrator(request,"products.edit");
    const product=await setAdminProductActive(getAdminDatabase(),account,(await params).id,await readAdminJson(request));
    invalidateServerCatalog();revalidatePath("/","layout");
    return NextResponse.json({product},{headers:adminHeaders});
  } catch(error){return adminFailure(error);}
}
