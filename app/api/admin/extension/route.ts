import { NextRequest, NextResponse } from "next/server";
import { adminFailure, adminHeaders, requireAdministrator } from "@/lib/admin-api";
import { createExtensionKey } from "@/lib/extension-auth";
import { getAdminDatabase } from "@/lib/firebase/admin";
export const runtime="nodejs";
export async function POST(request:NextRequest) {
  try {const actor=await requireAdministrator(request,"import.manage");return NextResponse.json(await createExtensionKey(actor.uid),{headers:adminHeaders});}
  catch(error){return adminFailure(error);}
}
export async function DELETE(request:NextRequest) {
  try {const actor=await requireAdministrator(request,"import.manage");await getAdminDatabase().doc(`adminExtensionKeys/${actor.uid}`).delete();return NextResponse.json({revoked:true},{headers:adminHeaders});}
  catch(error){return adminFailure(error);}
}
