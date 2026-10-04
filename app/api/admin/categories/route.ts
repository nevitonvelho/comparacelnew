import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { adminFailure, adminHeaders, readAdminJson, requireAdministrator } from "@/lib/admin-api";
import { AdminError, slugify } from "@/lib/admin-model";
import { getAdminDatabase } from "@/lib/firebase/admin";
export const runtime = "nodejs";
const reserved = new Set(["admin","api","produto","catalogo","comparar","comunidade","conta","marcas","busca","compare","comparacoes","login","privacidade","termos","minha-conta","marca","perfil"]);
export async function POST(request: NextRequest) {
  try {
    const actor = await requireAdministrator(request, "categories.manage");
    const input = await readAdminJson(request) as { name?: unknown; slug?: unknown; categories?: unknown; homeLimit?: unknown };
    const db = getAdminDatabase();
    if (typeof input.name === "string") {
      const name = input.name.trim(); const slug = typeof input.slug === "string" ? input.slug : slugify(name);
      if (!name || name.length > 120 || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) || slug.length > 140 || reserved.has(slug)) throw new AdminError("Confira o nome e a URL da categoria.");
      await db.runTransaction(async tx => {
        const ref = db.collection("categories").doc(slug);
        const existing = await tx.get(db.collection("categories").where("slug","==",slug).limit(1));
        const direct = await tx.get(ref);
        if (!existing.empty || direct.exists) throw new AdminError("Já existe uma categoria com essa URL.",409);
        tx.create(ref,{name,slug,showOnHome:true,homeOrder:100});
        tx.create(db.collection("adminAudit").doc(),{action:"category-created",name,actorUid:actor.uid,actorEmail:actor.email ?? "",createdAt:new Date()});
      });
    } else {
      if (!Number.isInteger(input.homeLimit) || Number(input.homeLimit)<0 || Number(input.homeLimit)>100 || !Array.isArray(input.categories) || input.categories.length>100) throw new AdminError("Defina uma quantidade entre 0 e 100 categorias.");
      const entries = input.categories as {id:string;showOnHome:boolean;order:number}[];
      if (entries.some(item=> !item || typeof item.id!=="string" || typeof item.showOnHome!=="boolean" || !Number.isInteger(item.order) || item.order<0 || item.order>999) || new Set(entries.map(item=>item.id)).size!==entries.length) throw new AdminError("Confira a ordem e a visibilidade das categorias.");
      await db.runTransaction(async tx=>{
        const snapshot=await tx.get(db.collection("categories"));
        const refs=new Map(snapshot.docs.map(doc=>[String(doc.data().slug ?? doc.id),doc.ref]));
        if(entries.some(item=>!refs.has(item.id))) throw new AdminError("Categoria não encontrada. Atualize o painel.");
        for(const item of entries) tx.update(refs.get(item.id)!,{showOnHome:item.showOnHome,homeOrder:item.order});
        tx.set(db.doc("siteSettings/categories"),{homeLimit:input.homeLimit});
        tx.create(db.collection("adminAudit").doc(),{action:"categories-home-updated",name:"Categorias da home",actorUid:actor.uid,actorEmail:actor.email ?? "",createdAt:new Date()});
      });
    }
    revalidatePath("/","layout");
    return NextResponse.json({saved:true},{headers:adminHeaders});
  } catch(error){return adminFailure(error);}
}
