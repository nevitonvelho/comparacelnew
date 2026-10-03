"use client";
import { useEffect, useState } from "react";
import { collection, doc, limit, onSnapshot, orderBy, query, where } from "firebase/firestore";
import { getDatabase } from "@/lib/firebase/client";
import { googlePhoto, type PublicProfile, type SocialPost } from "@/lib/social";
export function usePublicProfile(uid: string | undefined) {
  const [state,setState]=useState<{uid:string;profile:PublicProfile|null;error:boolean}|null>(null);
  useEffect(()=>{
    if(!uid)return;
    return onSnapshot(doc(getDatabase(),"profiles",uid),snapshot=>{const data=snapshot.data();setState({uid,profile:data?{uid,displayName:data.displayName,bio:data.bio,photoURL:googlePhoto(data.photoURL)}:null,error:false});},()=>setState({uid,profile:null,error:true}));
  },[uid]);
  const current=state?.uid===uid?state:null;
  return {profile:current?.profile??null,loading:Boolean(uid&&!current),error:current?.error??false};
}
function post(id: string, data: Record<string, unknown>): SocialPost {
  return {...data,id,authorPhoto:googlePhoto(data.authorPhoto),createdAt:(data.createdAt as {toMillis?:()=>number})?.toMillis?.()??0} as SocialPost;
}
export function usePublicPosts({category="todas",authorUid,count=20}:{category?:string;authorUid?:string;count?:number}) {
  const key=JSON.stringify([category,authorUid,count]);
  const [state,setState]=useState<{key:string;posts:SocialPost[];error:boolean}|null>(null);
  useEffect(()=>{
    const conditions=[where("status","==","published")];
    if(category!=="todas")conditions.push(where("category","==",category));
    if(authorUid)conditions.push(where("authorUid","==",authorUid));
    return onSnapshot(query(collection(getDatabase(),"socialPosts"),...conditions,orderBy("createdAt","desc"),limit(count)),snapshot=>setState({key,posts:snapshot.docs.map(document=>post(document.id,document.data())),error:false}),()=>setState({key,posts:[],error:true}));
  },[category,authorUid,count,key]);
  const current=state?.key===key?state:null;
  return {posts:current?.posts??[],loading:!current,error:current?.error??false};
}
export function usePublicPost(id:string) {
  const [state,setState]=useState<{id:string;post:SocialPost|null;error:boolean}|null>(null);
  useEffect(()=>onSnapshot(doc(getDatabase(),"socialPosts",id),snapshot=>setState({id,post:snapshot.exists()?post(snapshot.id,snapshot.data()):null,error:false}),()=>setState({id,post:null,error:true})),[id]);
  const current=state?.id===id?state:null;
  return {post:current?.post??null,loading:!current,error:current?.error??false};
}
