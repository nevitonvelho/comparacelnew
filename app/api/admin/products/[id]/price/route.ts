import { fetchMercadoBrowserPrice } from "@/lib/mercado-browser-price";
import { readMercadoPriceCache, writeMercadoPriceCache } from "@/lib/mercado-price-cache";
import { priceBudgetWait, sourceAccessBlocked, PRICE_SOURCE_COOLDOWN_MS } from "@/lib/admin-price-guard";
import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { adminFailure, adminHeaders, readAdminJson, requireAdministrator } from "@/lib/admin-api";
import { AdminError } from "@/lib/admin-model";
import { getAdminDatabase } from "@/lib/firebase/admin";
import { parseImportLine, type ImportEntry } from "@/lib/admin-import-model";
import { fetchAmazonProduct } from "@/lib/admin-import-amazon";
import { fetchMercadoApiProduct } from "@/lib/admin-import-mercado-api";
import { getMercadoToken } from "@/lib/mercado-token";
import { saveRefreshedPrice } from "@/lib/admin-price-update";
import { invalidateServerCatalog } from "@/lib/server-catalog";
import { revalidatePath } from "next/cache";
export const runtime="nodejs";
export const maxDuration=120;
export async function POST(request:NextRequest,{params}:{params:Promise<{id:string}>}) {
  let release:(()=>Promise<unknown>)|undefined;
  let sourceGuard:ReturnType<ReturnType<typeof getAdminDatabase>["doc"]>|undefined;
  try {
    const actor=await requireAdministrator(request,"products.edit");const {id}=await params;
    const input=await readAdminJson(request);
    if(!id || id.includes("/") || id.length>400 || typeof input?.offerId!=="string")throw new AdminError("Oferta inválida.");
    const db=getAdminDatabase();const data=(await db.doc(`products/${id}`).get()).data();
    if(!data)throw new AdminError("Produto não encontrado.",404);
    const offer=(Array.isArray(data.offers)?data.offers:[]).find(item=>String(item.id)===input.offerId);
    if(!offer?.url || offer.is_available!==true)throw new AdminError("Oferta indisponível para atualização.");
    const store=(await db.doc(`stores/${offer.storeId ?? offer.store}`).get()).data();
    const name=String(store?.name ?? offer.storeName ?? "").toLowerCase();
    const source=name.includes("amazon")?"amazon":name.includes("mercado livre")?"mercadolivre":null;
    if(!source)return NextResponse.json({changed:false,skipped:true,message:"Atualização automática disponível para Amazon e Mercado Livre."},{headers:adminHeaders});
    let external=String(offer.external_id ?? "");
    if(!external && offer.external_id === undefined && source==="mercadolivre") {
      const mappings=await db.collection("adminImportSources").where("productId","==",id).get();
      external=String(mappings.docs.find(doc=>doc.id.startsWith("mercadolivre-") && doc.data().storeId===String(offer.storeId ?? offer.store))?.data().externalId ?? "");
      // Older imports do not store storeId on the mapping; use the single matching source.
      if(!external){const matching=mappings.docs.filter(doc=>doc.id.startsWith("mercadolivre-"));if(matching.length===1)external=String(matching[0].data().externalId ?? "");}
    }
    let entry:ImportEntry;
    if(source==="mercadolivre" && /^(?:item-)?MLB\d+$/.test(external))entry={buyUrl:offer.url,productUrl:offer.url,externalId:external.replace(/^item-/,""),kind:external.startsWith("item-")?"item":"catalog"};
    else {try{entry=parseImportLine(offer.url,source);}catch{return NextResponse.json({changed:false,skipped:true,message:"Oferta sem identificador da fonte. Reimporte com a URL original para habilitar atualização."},{headers:adminHeaders});}}
    if(source==="mercadolivre" && !entry.externalId)return NextResponse.json({changed:false,skipped:true,message:"Link curto sem vínculo de origem; reimporte com a URL do produto."},{headers:adminHeaders});
    const browserMode=source==="mercadolivre" && process.env.ML_PRICE_SOURCE==="browser";
    const cacheSource=browserMode?"browser":"api";
    if(source==="mercadolivre") {
      const cached=await readMercadoPriceCache(db,entry,cacheSource);
      if(cached)return NextResponse.json({changed:false,cached:true,attempts:0,checkedAt:new Date(cached.checkedAt).toISOString(),expiresAt:new Date(cached.expiresAt).toISOString(),message:`Preço já consultado nas últimas 24 horas; valor cadastrado preservado. Nova consulta disponível em ${new Intl.DateTimeFormat("pt-BR",{dateStyle:"short",timeStyle:"short",timeZone:"America/Bahia"}).format(cached.expiresAt)}.`},{headers:adminHeaders});
    }
    sourceGuard=db.doc(`adminPriceSourceStatus/${source}-${source==="mercadolivre"?"api":"http"}`);
    const sourceStatus=(await sourceGuard.get()).data();
    if(Number(sourceStatus?.blockedUntil)>Date.now())return NextResponse.json({changed:false,skipped:true,blocked:true,attempts:0,message:`${source==="amazon"?"Amazon":"Mercado Livre"}: consultas temporariamente suspensas após bloqueio de acesso. Tente depois de ${new Intl.DateTimeFormat("pt-BR",{timeStyle:"short",timeZone:"America/Bahia"}).format(Number(sourceStatus!.blockedUntil))}. Último preço preservado.`},{headers:adminHeaders});
    const lease=randomUUID();const budget=db.doc("adminPriceBudgets/global");
    await db.runTransaction(async tx=>{
      const old=(await tx.get(budget)).data() ?? {};const now=Date.now();
      const wait=priceBudgetWait(old,now);
      if(wait>0){const error=new AdminError("Aguarde o intervalo ou a atualização em andamento antes de consultar esta oferta.",429);error.retryAfterMs=wait+250;throw error;}
      const same=now-Number(old.windowAt ?? 0)<3600000;
      tx.set(budget,{lease,lockUntil:now+120000,lastAt:now,windowAt:same?old.windowAt:now,count:same?Number(old.count ?? 0)+1:1});
    });
    release=()=>db.runTransaction(async tx=>{if((await tx.get(budget)).data()?.lease===lease)tx.update(budget,{lockUntil:0});});
    let price:number|null=null;
    let attempts=1;
    let priceCondition: "pix"|"standard" = "standard";
    let usedBrowser=false;
    let sourceWarning="";
    if(source==="mercadolivre") {
      const apiAttempts=browserMode?1:2;
      for(attempts=1;attempts<=apiAttempts;attempts++) {
        try {price=(await fetchMercadoApiProduct(entry,getMercadoToken,true)).price;if(price!==null || attempts===apiAttempts)break;}
        catch(error){if(attempts===apiAttempts)throw new AdminError(`${error instanceof Error?error.message:"Falha na fonte."} (${attempts} tentativa${attempts===1?"":"s"}; último preço preservado.)`,error instanceof AdminError?error.status:502);}
        await new Promise(resolve=>setTimeout(resolve,4100));
      }
      if(price===null && browserMode) {
        const browserGuard=db.doc("adminPriceSourceStatus/mercadolivre-browser");
        const browserStatus=(await browserGuard.get()).data();
        if(Number(browserStatus?.blockedUntil)>Date.now())sourceWarning=" O navegador está temporariamente indisponível após bloqueio de acesso.";
        else try {
          await new Promise(resolve=>setTimeout(resolve,4100));
          const result=await fetchMercadoBrowserPrice(entry,1);price=result.price;priceCondition=result.condition;attempts+=result.attempts;usedBrowser=true;
        }catch(error) {
          attempts++;
          sourceWarning=` ${error instanceof Error?error.message:"O navegador não confirmou o preço."}`;
          if(sourceAccessBlocked(sourceWarning))await browserGuard.set({blockedUntil:Date.now()+PRICE_SOURCE_COOLDOWN_MS,message:sourceWarning}).catch(()=>{});
        }
      }
    } else {const collected=await fetchAmazonProduct(entry);price=collected.price;attempts=collected.attempts ?? 1;}
    const result=await saveRefreshedPrice(db,actor,id,input.offerId,offer.url,price!,offer.priceCents ?? null,priceCondition);
    if(source==="mercadolivre" && price!==null)await writeMercadoPriceCache(db,entry,cacheSource,price,priceCondition,Date.now()).catch(()=>{});
    if(result.changed)invalidateServerCatalog();
    revalidatePath(`/produto/${id}`);
    return NextResponse.json({...result,attempts,message:`${source==="mercadolivre" && price===null ? "Preço não retornado para a oferta identificada; valor anterior preservado. Informe a URL do anúncio específico, com o identificador MLB do vendedor, ou edite o preço manualmente." : result.message}${source==="mercadolivre" && !usedBrowser && entry.kind!=="item" ? " Referência do catálogo; descontos no Pix e ofertas de outros vendedores podem diferir." : ""}${sourceWarning}${priceCondition==="pix"?" Preço no Pix.":""} (${attempts} tentativa${attempts===1?"":"s"}.)`},{headers:adminHeaders});
  }catch(error){
    if(error instanceof AdminError && error.retryAfterMs!==undefined)return NextResponse.json({error:error.message,retryAfterMs:error.retryAfterMs},{status:429,headers:{...adminHeaders,"Retry-After":String(Math.ceil(error.retryAfterMs/1000))}});
    if(error instanceof AdminError && sourceGuard && sourceAccessBlocked(error.message)) {
      await sourceGuard.set({blockedUntil:Date.now()+PRICE_SOURCE_COOLDOWN_MS,message:error.message}).catch(()=>{});
      return NextResponse.json({error:`${error.message} Novas consultas desta loja terão um intervalo de 15 minutos; o lote continua com as demais ofertas.`},{status:502,headers:adminHeaders});
    }
    return adminFailure(error);
  }
  finally{if(release)await release().catch(()=>{});}
}
