"use client";
import { useEffect, useRef, useState, type ReactNode } from "react";

export function HomeCarousel({id,label,count,children}:{id:string;label:string;count:number;children:ReactNode}) {
  const viewport=useRef<HTMLDivElement>(null);
  const [edges,setEdges]=useState({start:true,end:count<2});
  useEffect(()=>{
    const element=viewport.current;
    if(!element)return;
    const update=()=>setEdges({start:element.scrollLeft<=2,end:element.scrollLeft+element.clientWidth>=element.scrollWidth-2});
    const frame=requestAnimationFrame(update);
    element.addEventListener("scroll",update,{passive:true});
    const observer=new ResizeObserver(update);observer.observe(element);
    return()=>{cancelAnimationFrame(frame);element.removeEventListener("scroll",update);observer.disconnect();};
  },[count]);
  function move(direction:number) {
    const element=viewport.current;
    if(!element)return;
    const first=element.firstElementChild as HTMLElement|null;
    const gap=parseFloat(getComputedStyle(element).columnGap) || 0;
    const width=first?.getBoundingClientRect().width ?? element.clientWidth;
    const visible=Math.max(1,Math.floor((element.clientWidth+gap)/(width+gap)));
    element.scrollBy({left:direction*visible*(width+gap),behavior:matchMedia("(prefers-reduced-motion: reduce)").matches?"instant":"smooth"});
  }
  return <div className="home-carousel" role="region" aria-label={label} aria-roledescription="carrossel"><div className="home-carousel-stage"><div id={id} ref={viewport} className="home-carousel-track">{children}</div>{count>0 && <div className="home-carousel-controls"><button className="home-carousel-previous" type="button" aria-label={`Produtos anteriores em ${label}`} aria-controls={id} disabled={edges.start} onClick={()=>move(-1)}><svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m14 6-6 6 6 6" /></svg></button><button className="home-carousel-next" type="button" aria-label={`Próximos produtos em ${label}`} aria-controls={id} disabled={edges.end} onClick={()=>move(1)}><svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m10 6 6 6-6 6" /></svg></button></div>}</div>{count>0 && <p className="home-carousel-count">{count} {count===1?"produto":"produtos"}</p>}</div>;
}
