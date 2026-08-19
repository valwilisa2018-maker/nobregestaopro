import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

// Shared singleton — avoids each useAuth() consumer opening its own
// onAuthStateChange subscription and firing redundant getSession() → /user calls.
let currentSession: Session | null = null;
let initialized = false;
let initPromise: Promise<void> | null = null;
const listeners = new Set<(s: Session | null) => void>();

function ensureInit() {
  if (initialized || initPromise) return initPromise;
  supabase.auth.onAuthStateChange((_e, s) => {
    currentSession = s;
    listeners.forEach((l) => l(s));
  });
  initPromise = supabase.auth.getSession().then(({ data }) => {
    currentSession = data.session;
    initialized = true;
    listeners.forEach((l) => l(data.session));
  });
  return initPromise;
}

export function useAuth() {
  const [session, setSession] = useState<Session | null>(currentSession);
  const [loading, setLoading] = useState(!initialized);

  useEffect(() => {
    listeners.add(setSession);
    ensureInit()?.then(() => setLoading(false));
    if (initialized) setLoading(false);
    return () => {
      listeners.delete(setSession);
    };
  }, []);

  return { session, user: session?.user ?? null, loading };
}
