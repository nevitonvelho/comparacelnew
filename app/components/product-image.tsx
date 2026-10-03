"use client";
import { UiIcon } from "./icons";

import Image from "next/image";
import { useState } from "react";

export function ProductImage({ name, url, large = false, sizes }: { name: string; url: string | null; large?: boolean; sizes?: string }) {
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  return <div className={`product-photo ${large ? "large" : ""}`}>
    {url && failedUrl !== url ? <Image
      src={url}
      alt={name}
      fill
      sizes={sizes ?? (large ? "(max-width: 520px) 80vw, 400px" : "(max-width: 520px) 80vw, (max-width: 1200px) 40vw, 500px")}
      style={{ objectFit: "contain" }}
      onError={() => setFailedUrl(url)}
    /> : <span className="image-placeholder"><span aria-hidden="true"><UiIcon name="image" /></span>Imagem indisponível</span>}
  </div>;
}
