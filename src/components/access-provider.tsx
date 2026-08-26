/* eslint-disable @typescript-eslint/no-explicit-any */
import { createContext, useContext, useMemo, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { firstAllowedModulePath, moduleForPath, type PermissionAction } from "@/lib/access-control";
import { supabase } from "@/integrations/supabase/client";

type AccessContextValue = {
  loading: boolean;
  error: Error | null;
  profile: any | null;
  roles: string[];
  isAdmin: boolean;
  can: (module: string, action?: PermissionAction) => boolean;
  canVisit: (pathname: string) => boolean;
  firstAllowedPath: string | null;
};

const AccessContext = createContext<AccessContextValue | null>(null);

async function loadMyAccess(refreshSession = false) {
  if (refreshSession) {
    const { error } = await supabase.auth.refreshSession();
    if (error) throw error;
  }

  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
  if (sessionError || !sessionData.session?.user) {
    throw sessionError ?? new Error("Sessão não encontrada");
  }

  const userId = sessionData.session.user.id;
  const [profileResult, rolesResult, permissionsResult] = await Promise.all([
    supabase
      .from("profiles")
      .select("id,full_name,email,job_title,status,managed_access")
      .eq("id", userId)
      .single(),
    supabase.from("user_roles").select("role").eq("user_id", userId),
    supabase
      .from("user_permissions")
      .select("module,can_view,can_create,can_edit,can_delete")
      .eq("user_id", userId),
  ]);

  const error = profileResult.error ?? rolesResult.error ?? permissionsResult.error;
  if (error) throw error;
  if (!profileResult.data || profileResult.data.status !== "active") {
    throw new Error("Usuário inativo");
  }

  return {
    profile: profileResult.data,
    roles: (rolesResult.data ?? []).map((row) => row.role),
    permissions: permissionsResult.data ?? [],
  };
}

export function AccessProvider({ children }: { children: ReactNode }) {
  const query = useQuery({
    queryKey: ["my-access"],
    queryFn: async () => {
      try {
        return await loadMyAccess(false);
      } catch {
        // Tokens antigos podem continuar no armazenamento do navegador depois
        // de uma publicação. Renova a sessão uma vez e repete a leitura segura.
        return await loadMyAccess(true);
      }
    },
    staleTime: 30_000,
    retry: 1,
  });

  const value = useMemo<AccessContextValue>(() => {
    const data = query.data as any;
    const roles = data?.roles ?? [];
    const isAdmin = roles.includes("admin");
    const managed = Boolean(data?.profile?.managed_access);
    const permissionMap = new Map((data?.permissions ?? []).map((row: any) => [row.module, row]));
    const can = (module: string, action: PermissionAction = "view") => {
      if (isAdmin) return true;
      if (!managed) return true;
      const permission = permissionMap.get(module) as any;
      return Boolean(permission?.[`can_${action}`]);
    };
    return {
      loading: query.isLoading,
      error: query.error as Error | null,
      profile: data?.profile ?? null,
      roles,
      isAdmin,
      can,
      firstAllowedPath: firstAllowedModulePath((moduleKey) => can(moduleKey, "view")),
      canVisit: (pathname: string) => {
        const module = moduleForPath(pathname);
        return !module || can(module.key, "view");
      },
    };
  }, [query.data, query.error, query.isLoading]);

  return <AccessContext.Provider value={value}>{children}</AccessContext.Provider>;
}

export function useAccess() {
  const context = useContext(AccessContext);
  if (!context) throw new Error("useAccess deve ser usado dentro de AccessProvider");
  return context;
}
