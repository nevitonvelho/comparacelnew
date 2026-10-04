import { NextRequest, NextResponse } from "next/server";
import { adminFailure, adminHeaders, readAdminJson, requireAdministrator } from "@/lib/admin-api";
import { readAdminUsers, saveUserAccess } from "@/lib/admin-users";
export const runtime="nodejs";
export async function GET(request:NextRequest) {
  try {await requireAdministrator(request,"users.manage");return NextResponse.json({users:await readAdminUsers()},{headers:adminHeaders});}
  catch(error){return adminFailure(error);}
}
export async function PATCH(request:NextRequest) {
  try {const actor=await requireAdministrator(request,"users.manage");await saveUserAccess(actor,await readAdminJson(request));return NextResponse.json({saved:true},{headers:adminHeaders});}
  catch(error){return adminFailure(error);}
}
