import { reactionSummary,type ReactionCounts } from "./reaction-model";
export type ProductMetrics={views:number;favorites:number;saved:number};
export function productScore(metrics:ProductMetrics,counts:ReactionCounts,price:number|null,median:number|null) {
  const reactions=reactionSummary(counts);
  const volume=(value:number,cap:number)=>0.5+0.5*Math.min(1,Math.log1p(Math.max(0,value))/Math.log1p(cap));
  const components={
    reactions:reactions.score,
    price:price!==null&&price>0&&median!==null&&median>0?median/(median+price):null,
    favorites:volume(metrics.favorites,50),saved:volume(metrics.saved,50),views:volume(metrics.views,1000),
  };
  const weights={reactions:0.5,price:0.2,favorites:0.15,saved:0.1,views:0.05};
  let sum=0,weight=0;
  for(const key of Object.keys(weights) as (keyof typeof weights)[])if(components[key]!==null){sum+=components[key]! * weights[key];weight+=weights[key];}
  const value=Math.max(1,Math.min(10,Math.round((1+9*sum/weight)*10)/10));
  return {value,provisional:reactions.total<10,components,weights};
}
export function medianPrice(prices:(number|null)[]) {
  const valid=prices.filter((price):price is number=>price!==null&&Number.isFinite(price)&&price>0).sort((a,b)=>a-b);
  if(!valid.length)return null;
  const middle=Math.floor(valid.length/2);
  return valid.length%2?valid[middle]:(valid[middle-1]+valid[middle])/2;
}
