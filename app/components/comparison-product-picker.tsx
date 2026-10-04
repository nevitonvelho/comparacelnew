"use client";
import { useState } from "react";
import type { Product } from "@/lib/product-model";
import { money } from "@/lib/product-model";
import { ProductImage } from "./product-image";
import { UiIcon } from "./icons";

export function ComparisonProductPicker({index,product,choices,onChoose,disabled=false}:{index:number;product?:Product;choices:Product[];onChoose:(id:string)=>void;disabled?:boolean}) {
  const [search,setSearch]=useState("");
  const [editing,setEditing]=useState(false);
  const normalize=(value:string)=>value.normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase();
  const results=choices.filter(item=>normalize(`${item.name} ${item.brand}`).includes(normalize(search)));
  return <section className={`compare-choice ${product?"has-product":""}`} aria-label={`Escolher produto ${index+1}`}>
    <div className="compare-choice-heading"><span className="compare-slot-number">0{index+1}</span><div><h2>Produto {index+1}</h2><p>{product?"Pronto para comparar":"Encontre seu próximo candidato"}</p></div>{product&&<button className="text-button" onClick={()=>setEditing(value=>!value)}>{editing?"Fechar":"Trocar"}</button>}</div>
    {disabled?<div className="compare-await-first"><UiIcon name="compare"/><h3>Qual será o outro produto?</h3><p>Escolha o primeiro produto ao lado. Depois, encontre uma alternativa para comparar.</p></div>:product&&!editing?<div className="compare-selected-product"><ProductImage name={product.name} url={product.imageUrl} sizes="200px"/><span className="eyebrow">{product.brand}</span><h3>{product.name}</h3><strong>{product.price===null?"Preço indisponível":money(product.price)}</strong><small>{product.specs.length} especificações para comparar</small></div>:<><label className="compare-product-search"><UiIcon name="search"/><input aria-label={`Buscar produto ${index+1}`} placeholder="Busque por nome, marca ou modelo…" value={search} onChange={event=>setSearch(event.target.value)}/></label><div className="compare-choice-results">{results.map(item=><button key={item.id} className="compare-product-option" onClick={()=>{onChoose(item.id);setEditing(false);setSearch("");}} aria-label={`Selecionar ${item.name} como produto ${index+1}`}><ProductImage name={item.name} url={item.imageUrl} sizes="64px"/><span><small>{item.brand}</small><strong>{item.name}</strong><b>{item.price===null?"Preço indisponível":money(item.price)}</b></span><UiIcon name="add"/></button>)}{!results.length&&<p className="compare-search-empty">Nenhum produto encontrado. Tente outro nome ou modelo.</p>}</div><small className="compare-result-count">{results.length} produtos nesta categoria</small></>}
  </section>;
}
