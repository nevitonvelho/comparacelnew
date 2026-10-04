import { AdminError } from "./admin-model";
import { fetchImportResource } from "./admin-import-fetch";
import { parseAmazonProduct } from "./admin-import-parser";
import type { ImportEntry } from "./admin-import-model";
export async function fetchAmazonProduct(entry: ImportEntry) {
  for (let attempt=0;attempt<2;attempt++) {
    try {
      const page=await fetchImportResource(entry.productUrl,"amazon");
      const externalId=entry.externalId || page.url.match(/\/(?:dp|gp\/product|gp\/aw\/d)\/([A-Z0-9]{10})/i)?.[1].toUpperCase() || "";
      const result=parseAmazonProduct(page.bytes.toString("utf8"),{...entry,externalId});
      if(result.price===null && attempt===0){await new Promise(resolve=>setTimeout(resolve,8000));continue;}
      return {...result,attempts:attempt+1};
    } catch(error) {
      // At most two source requests, including challenges; never an unbounded retry.
      if(attempt===1 || !(error instanceof AdminError) || ![429,502].includes(error.status)) {
        if(error instanceof AdminError)throw new AdminError(`${error.message} (${attempt+1} tentativa${attempt===0?"":"s"}; último preço preservado.)`,error.status);
        throw error;
      }
      await new Promise(resolve=>setTimeout(resolve,8000));
    }
  }
  throw new AdminError("Não foi possível consultar a Amazon.",502);
}
