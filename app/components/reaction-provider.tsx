"use client";
import { usePathname } from "next/navigation";
import { createContext,useContext,useEffect,useState,type ReactNode } from "react";
import { collection,onSnapshot } from "firebase/firestore";
import { getDatabase } from "@/lib/firebase/client";
import { pageIdentity,type PageKind } from "@/lib/engagement-model";
import { type Reaction,validReaction } from "@/lib/reaction-model";
import { useAuth } from "./auth-provider";

type ContextValue={votes:Record<string,Reaction|null>;loading:boolean;error:boolean;busy:string|null;react:(kind:PageKind,ids:string[],reaction:Reaction)=>Promise<Reaction|null>};
const Context=createContext<ContextValue|null>(null);
export function ReactionProvider({children}:{children:ReactNode}) {
  const {user,login,loading:authLoading}=useAuth();
  const inAdmin=usePathname().startsWith("/admin");
  const [state,setState]=useState<{uid:string;votes:Record<string,Reaction|null>;error:boolean}|null>(null);
  const [busy,setBusy]=useState<{uid:string;key:string}|null>(null);
  useEffect(()=>{
    if(!user||inAdmin)return;
    const uid=user.uid;
    return onSnapshot(collection(getDatabase(),"users",uid,"reactions"),snapshot=>{
      const votes:Record<string,Reaction|null>={};
      for(const document of snapshot.docs){const value=document.data().reaction;if(validReaction(value))votes[document.id]=value;}
      setState({uid,votes,error:false});
    },()=>setState({uid,votes:{},error:true}));
  },[user,inAdmin]);
  const current=user&&state?.uid===user.uid?state:null;
  async function react(kind:PageKind,ids:string[],reaction:Reaction) {
    const identity=pageIdentity(kind,ids);
    if(!identity)throw new Error("Produto ou comparação inválida.");
    const account=user??await login();
    const previous=account.uid===user?.uid?current?.votes[identity.key]:undefined;
    const value=previous===reaction?null:reaction;
    setBusy({uid:account.uid,key:identity.key});
    try {
      const token=await account.getIdToken();
      const response=await fetch("/api/reactions",{method:"POST",headers:{"Content-Type":"application/json",Authorization:`Bearer ${token}`},body:JSON.stringify({kind,productIds:identity.ids,reaction:value})});
      const result=await response.json();
      if(!response.ok)throw new Error(result.error??"Não foi possível registrar a reação.");
      return result.reaction as Reaction|null;
    }finally{setBusy(null);}
  }
  return <Context.Provider value={{votes:current?.votes??{},loading:authLoading||Boolean(user&&!current),error:current?.error??false,busy:busy?.uid===user?.uid?busy?.key??null:null,react}}>{children}</Context.Provider>;
}
export function useReactions(){const value=useContext(Context);if(!value)throw new Error("ReactionProvider ausente");return value;}
