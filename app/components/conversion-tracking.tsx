"use client";
import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { conversionPayload, type ConversionEvent } from "@/lib/conversion-events";

export function ConversionTracking() {
  const pathname = usePathname();
  const visit = useRef<{ pathname: string; seen: Set<string> } | null>(null);
  useEffect(() => {
    if (visit.current?.pathname !== pathname) visit.current = { pathname, seen: new Set<string>() };
    const seen = visit.current.seen;
    const watched = new WeakSet<Element>();
    const target = window as Window & { dataLayer?: Record<string, unknown>[] };
    function send(event: ConversionEvent, element: HTMLElement) {
      target.dataLayer ??= [];
      const context = element.closest<HTMLElement>("[data-page-type]")?.dataset.pageType;
      target.dataLayer.push(conversionPayload(event, { ...element.dataset, pageType: context }, pathname));
    }
    function click(event: MouseEvent) {
      if (event.type === "auxclick" && event.button !== 1) return;
      const link = event.target instanceof Element ? event.target.closest<HTMLElement>("a[data-affiliate-link]") : null;
      if (link) send("affiliate_click", link);
    }
    const observer = new IntersectionObserver(entries => {
      for (const entry of entries) {
        if (!entry.isIntersecting || entry.intersectionRatio < 0.1) continue;
        const element = entry.target as HTMLElement;
        const event = element.dataset.analyticsView as ConversionEvent;
        const key = [event, element.dataset.productId, element.dataset.offerId, element.dataset.comparisonId].join(":");
        if (!seen.has(key)) { seen.add(key); send(event, element); }
        observer.unobserve(element);
      }
    }, { threshold: 0.1 });
    function watch(root: ParentNode) {
      const elements = [...root.querySelectorAll<HTMLElement>("[data-analytics-view]")];
      if (root instanceof HTMLElement && root.matches("[data-analytics-view]")) elements.push(root);
      for (const element of elements) {
        if (watched.has(element)) continue;
        watched.add(element);
        const event = element.dataset.analyticsView;
        if (event === "offer_view") observer.observe(element);
        else if (event === "product_view" || event === "comparison_view") {
          const key = [event, element.dataset.productId, element.dataset.comparisonId].join(":");
          if (!seen.has(key)) { seen.add(key); send(event, element); }
        }
      }
    }
    watch(document);
    const mutations = new MutationObserver(records => {
      for (const record of records) for (const node of record.addedNodes) if (node instanceof HTMLElement) watch(node);
    });
    mutations.observe(document.body, { childList: true, subtree: true });
    document.addEventListener("click", click, true);
    document.addEventListener("auxclick", click, true);
    return () => {
      observer.disconnect(); mutations.disconnect();
      document.removeEventListener("click", click, true);
      document.removeEventListener("auxclick", click, true);
    };
  }, [pathname]);
  return null;
}
