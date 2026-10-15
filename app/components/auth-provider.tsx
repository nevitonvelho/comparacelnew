"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { getAuth, GoogleAuthProvider, onAuthStateChanged, signInWithPopup, signOut, type User } from "firebase/auth";
import { getFirebaseApp } from "@/lib/firebase/client";
import { syncLaravelSession, endLaravelSession } from "@/lib/laravel-auth-client";

type Session = { user: User | null; loading: boolean; login: () => Promise<User>; logout: () => Promise<void> };
const Context = createContext<Session | null>(null);
export function authError(error: unknown): string {
  const code = typeof error === "object" && error && "code" in error ? String(error.code) : "";
  if (code === "auth/popup-closed-by-user" || code === "auth/cancelled-popup-request") return "O login foi cancelado. Tente novamente quando quiser.";
  if (code === "auth/popup-blocked") return "Permita a janela de login no navegador e tente novamente.";
  if (code === "auth/unauthorized-domain") return "O login ainda não está disponível neste endereço.";
  if (code === "permission-denied") return "Não foi possível acessar seus itens. Tente novamente em instantes.";
  if (code === "auth/network-request-failed") return "Confira sua conexão e tente novamente.";
  return "Não foi possível concluir a operação. Tente novamente.";
}
export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let active = true;
    let version = 0;
    const unsubscribe = onAuthStateChanged(getAuth(getFirebaseApp()), current => {
      const requestVersion = ++version;
      if (!current) { setUser(null); setLoading(false); return; }
      setLoading(true);
      void syncLaravelSession(current).then(() => {
        if (active && version === requestVersion) setUser(current);
      }).catch(() => {
        if (active && version === requestVersion) setUser(null);
      }).finally(() => {
        if (active && version === requestVersion) setLoading(false);
      });
    }, () => { if (active) { setUser(null); setLoading(false); } });
    return () => { active = false; unsubscribe(); };
  }, []);
  async function login() {
    const provider = new GoogleAuthProvider();
    provider.setCustomParameters({ prompt: "select_account" });
    const account = (await signInWithPopup(getAuth(getFirebaseApp()), provider)).user;
    await syncLaravelSession(account);
    return account;
  }
  async function logout() {
    try { await endLaravelSession(); }
    finally { await signOut(getAuth(getFirebaseApp())); }
  }
  return <Context.Provider value={{ user, loading, login, logout }}>{children}</Context.Provider>;
}
export function useAuth() { const context = useContext(Context); if (!context) throw new Error("AuthProvider ausente"); return context; }
