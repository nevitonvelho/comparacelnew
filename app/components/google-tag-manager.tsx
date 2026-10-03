"use client";
import Script from "next/script";
import { useEffect, useRef } from "react";
import { usePathname, useSearchParams } from "next/navigation";

export const tagManagerId = process.env.NEXT_PUBLIC_GTM_ID || "GTM-PN53J4BW";
export function GoogleTagManager() {
  const lastPath = useRef<string | null>(null);
  const pathname = usePathname();
  const search = useSearchParams().toString();
  useEffect(() => {
    if (!/^GTM-[A-Z0-9]+$/.test(tagManagerId)) return;
    const path = `${pathname}${search ? `?${search}` : ""}`;
    if (lastPath.current === path) return;
    lastPath.current = path;
    const target = window as Window & { dataLayer?: Record<string, unknown>[] };
    target.dataLayer ??= [];
    target.dataLayer.push({ event: "comparacel_page_view", page_path: path, page_location: window.location.href, page_title: document.title });
  }, [pathname, search]);
  if (!/^GTM-[A-Z0-9]+$/.test(tagManagerId)) return null;
  return <Script id="google-tag-manager" strategy="afterInteractive">{`(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src='https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);})(window,document,'script','dataLayer','${tagManagerId}');`}</Script>;
}
