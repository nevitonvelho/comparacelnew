import { randomUUID } from "node:crypto";
import { getDownloadURL } from "firebase-admin/storage";
import { NextRequest, NextResponse } from "next/server";
import { extensionHeaders, requireExtension } from "@/lib/extension-auth";
import { AdminError } from "@/lib/admin-model";
import { readAdminJson } from "@/lib/admin-api";
import { getAdminBucket, getAdminDatabase } from "@/lib/firebase/admin";
import { validateProductCapture, collectedFromProductCapture } from "@/lib/product-capture";
import { persistImportedProduct, type ExtensionUpdateMode } from "@/lib/admin-import-store";
import { fetchImportResource } from "@/lib/admin-import-fetch";
import { inspectAdminImage } from "@/lib/admin-image";
import { invalidateServerCatalog } from "@/lib/server-catalog";
import { adminProductFromData } from "@/lib/admin-store";
import { extensionProductIdentity, offerBelongsToSource, offerMatchesIdentity, extensionProductSummary, lookupExtensionProduct, suggestExtensionProducts, searchExtensionProducts } from "@/lib/extension-products";
import { revalidatePath } from "next/cache";
export const runtime="nodejs";
export const maxDuration=60;
export async function OPTIONS(request:NextRequest) {
  try{return new NextResponse(null,{status:204,headers:extensionHeaders(request)});}
  catch{return new NextResponse(null,{status:403});}
}
export async function GET(request:NextRequest) {
  let headers={};
  try {
    headers=extensionHeaders(request);await requireExtension(request);
    const db=getAdminDatabase();const params=request.nextUrl.searchParams;
    if(params.has("pageUrl")) {
      const source=params.get("source");const pageUrl=params.get("pageUrl") ?? "";
      if(!["amazon","mercadolivre"].includes(source ?? "") || pageUrl.length>4500)throw new AdminError("Página inválida.");
      const identity=extensionProductIdentity(pageUrl,source as "amazon"|"mercadolivre");
      const product=await lookupExtensionProduct(db,source as "amazon"|"mercadolivre",identity);
      const name=params.get("name") ?? "";
      if(name.length>300)throw new AdminError("Nome muito longo.");
      const suggestions=product || !name?[]:await suggestExtensionProducts(db,name);
      return NextResponse.json({product:product?extensionProductSummary(product):null,suggestions,automaticSuggestions:true},{headers});
    }
    if(params.has("q")) {
      const query=params.get("q") ?? "";
      if(query.length>300)throw new AdminError("Busca muito longa.");
      return NextResponse.json({products:await searchExtensionProducts(db,query)},{headers});
    }
    const result=await db.collection("categories").get();
    return NextResponse.json({categories:result.docs.map(doc=>({id:String(doc.data().slug ?? doc.id),name:String(doc.data().name ?? doc.id)}))},{headers});
  }
  catch(error){return NextResponse.json({error:error instanceof AdminError?error.message:"Não foi possível conectar."},{status:error instanceof AdminError?error.status:503,headers});}
}
export async function POST(request:NextRequest) {
  let headers={};let release:(()=>Promise<unknown>)|undefined;
  try {
    headers=extensionHeaders(request);
    const actor=await requireExtension(request);
    const input=await readAdminJson(request);
    const mode=(input.mode ?? "import") as ExtensionUpdateMode;
    if(!["import","price","full","offer","unavailable"].includes(mode))throw new AdminError("Operação inválida.");
    const capture=validateProductCapture(input.capture,Date.now(),mode==="unavailable");
    const db=getAdminDatabase();
    const identity=extensionProductIdentity(capture.pageUrl,capture.source);
    const matched=await lookupExtensionProduct(db,capture.source,identity);
    let existing=matched;
    if(input.productId !== undefined) {
      if(typeof input.productId!=="string" || input.productId.length>400 || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(input.productId))throw new AdminError("Produto inválido.");
      if(matched && matched.id!==input.productId)throw new AdminError("Este anúncio já pertence a outro produto.",409);
      const doc=await db.doc(`products/${input.productId}`).get();
      if(!doc.exists)throw new AdminError("Produto não encontrado.",404);
      existing=adminProductFromData(doc.id,doc.data()!);
    }
    if(mode!=="import" && !existing)throw new AdminError("Selecione um produto cadastrado.");
    if(mode==="unavailable" && (!matched || matched.id!==existing?.id || !existing.offers.some(offer=>offerMatchesIdentity(offer,capture.source,identity))))throw new AdminError("Adicione este anúncio à ficha antes de atualizar só o preço.");
    const categorySlug=existing?.category ?? input.category;
    if(typeof categorySlug!=="string" || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(categorySlug))throw new AdminError("Escolha a categoria.");
    const category=await db.collection("categories").where("slug","==",categorySlug).limit(1).get();
    if(category.empty)throw new AdminError("Categoria não cadastrada.");
    if(input.affiliateUrl!==undefined && (typeof input.affiliateUrl!=="string" || input.affiliateUrl.length>2000))throw new AdminError("Link de afiliado inválido.");
    const savedPriceOffer=mode==="price" ? existing?.offers.find(offer=>offerBelongsToSource(offer,capture.source)) : undefined;
    const affiliateUrl=(mode==="unavailable" || (mode==="price" && (matched || savedPriceOffer)))?capture.pageUrl:(input.affiliateUrl?.trim() || matched?.offers.find(offer=>offerMatchesIdentity(offer,capture.source,identity))?.url);
    if(!affiliateUrl)throw new AdminError("Informe o link de afiliado desta loja.");
    const line=capture.source==="amazon"?affiliateUrl:`${affiliateUrl} ${capture.pageUrl}`;
    const collected=collectedFromProductCapture(capture,line);
    const budget=db.doc(`adminImportBudgets/${actor.uid}`);const lease=randomUUID();
    await db.runTransaction(async tx=>{
      const old=(await tx.get(budget)).data() ?? {};const now=Date.now();const same=now-Number(old.windowAt ?? 0)<3600000;
      if(Number(old.lockUntil)>now || now-Number(old.lastAt ?? 0)<4000)throw new AdminError("Aguarde a importação em andamento e tente novamente.",429);
      if(same && Number(old.count)>=200)throw new AdminError("Limite de 200 importações por hora.",429);
      tx.set(budget,{lease,lockUntil:now+90000,lastAt:now,windowAt:same?old.windowAt:now,count:same?Number(old.count ?? 0)+1:1});
    });
    release=()=>db.runTransaction(async tx=>{if((await tx.get(budget)).data()?.lease===lease)tx.update(budget,{lockUntil:0});});
    const warnings:string[]=[];let imageUrl="";
    if((mode==="import" || mode==="full") && !collected.specs.length)warnings.push("Ficha técnica não encontrada. Abra as características na loja e colete novamente para completar este produto.");
    if((mode==="import" || mode==="full") && !collected.highlights?.length && !existing?.highlights.length)warnings.push("Nenhum destaque técnico pôde ser confirmado; preencha os pontos positivos e de atenção na edição.");
    if((mode==="full" || (mode==="import" && !existing?.imageUrl)) && collected.imageUrl)try {
      const image=await fetchImportResource(collected.imageUrl,"image");const info=await inspectAdminImage(image.bytes,image.contentType);
      const file=getAdminBucket().file(`products/import/${randomUUID()}.${info.extension}`);
      await file.save(image.bytes,{resumable:false,preconditionOpts:{ifGenerationMatch:0},metadata:{contentType:image.contentType,cacheControl:"public,max-age=31536000,immutable",metadata:{firebaseStorageDownloadTokens:randomUUID()}}});
      imageUrl=await getDownloadURL(file);
    }catch{warnings.push("Imagem não importada. Envie a imagem na edição do produto.");}
    const result=await persistImportedProduct(db,actor,capture.source,collected,existing,categorySlug,imageUrl,mode);
    invalidateServerCatalog();revalidatePath(`/produto/${result.product.id}`);
    return NextResponse.json({product:extensionProductSummary(result.product),created:result.created,name:result.product.name,editPath:`/admin?produto=${encodeURIComponent(result.product.id)}`,warnings,message:result.created?"Rascunho importado. Confira no painel antes de ativar.":mode==="unavailable"?"Oferta desta loja marcada como indisponível. Link e outras lojas preservados.":mode==="price"?"Preço atualizado. Link de afiliado e ficha preservados.":mode==="offer"?"Oferta e link de afiliado salvos; as outras lojas foram mantidas.":mode==="full"?"Informações e oferta atualizadas. Publicação, avaliação e outras lojas preservadas.":"Produto atualizado; publicação e campos manuais preservados."},{headers});
  }catch(error){return NextResponse.json({error:error instanceof AdminError?error.message:"Não foi possível importar. Tente novamente."},{status:error instanceof AdminError?error.status:503,headers});}
  finally {await release?.().catch(()=>{});}
}
