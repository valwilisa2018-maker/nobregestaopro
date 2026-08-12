/* eslint-disable @typescript-eslint/no-explicit-any */
import { createContext, useContext, useMemo, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { getMyAccess } from "@/lib/access.functions";
import { moduleForPath, type PermissionAction } from "@/lib/access-control";

type AccessContextValue = {
  loading: boolean;
  error: Error | null;
  profile: any | null;
  roles: string[];
  isAdmin: boolean;
  can: (module: string, action?: PermissionAction) => boolean;
  canVisit: (pathname: string) => boolean;
};

const AccessContext = createContext<AccessContextValue | null>(null);

export function AccessProvider({ children }: { children: ReactNode }) {
  const query = useQuery({
    queryKey: ["my-access"],
    queryFn: () => getMyAccess(),
    staleTime: 30_000,
    retry: false,
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
