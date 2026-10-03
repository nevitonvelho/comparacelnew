"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "./auth-provider";
import { adminRequest } from "./admin-client";
import { UiIcon } from "./icons";
export function AdminLink() {
  const { user } = useAuth();
  const [allowedUid, setAllowedUid] = useState<string | null>(null);
  useEffect(() => {
    if (!user) return;
    let active = true;
    void adminRequest(user, "session").then(() => { if (active) setAllowedUid(user.uid); }).catch(() => { if (active) setAllowedUid(null); });
    return () => { active = false; };
  }, [user]);
  return user && allowedUid === user.uid ? <Link href="/admin" className="button secondary"><UiIcon name="shield" />Administração</Link> : null;
}
