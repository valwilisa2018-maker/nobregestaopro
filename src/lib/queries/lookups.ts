import { queryOptions } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

/**
 * Camada de acesso a dados para as tabelas de apoio (lookups).
 * Centraliza as consultas duplicadas em várias telas, mantendo
 * exatamente as mesmas queryKeys, filtros e formatos de retorno.
 */

export type LookupRow = { id: string; name: string };

async function runLookup<T>(
  table: "sellers" | "producers" | "service_types" | "packages",
  columns: string,
  errorMessage: string,
  refine?: (q: any) => any,
): Promise<T[]> {
  let query: any = supabase.from(table).select(columns);
  if (refine) query = refine(query);
  const { data, error } = await query;
  if (error) {
    toast.error(errorMessage);
    throw error;
  }
  return (data ?? []) as T[];
}

/* ------------------------------ Vendedores ------------------------------ */

export const activeSellersQuery = () =>
  queryOptions({
    queryKey: ["sellers-all"],
    queryFn: () =>
      runLookup<LookupRow>("sellers", "id,name", "Erro ao carregar vendedores", (q) =>
        q.eq("active", true),
      ),
  });

export const sellersMinQuery = () =>
  queryOptions({
    queryKey: ["sellers-min"],
    queryFn: () => runLookup<LookupRow>("sellers", "id, name", "Erro ao carregar vendedores"),
  });

/* ------------------------------ Produtores ------------------------------ */

export const activeProducersQuery = () =>
  queryOptions({
    queryKey: ["producers-all"],
    queryFn: () =>
      runLookup<LookupRow>("producers", "id,name", "Erro ao carregar produtores", (q) =>
        q.eq("active", true),
      ),
  });

export const producersMinQuery = () =>
  queryOptions({
    queryKey: ["producers-min"],
    queryFn: () => runLookup<LookupRow>("producers", "id, name", "Erro ao carregar produtores"),
  });

/* --------------------------- Tipos de serviço --------------------------- */

export const activeServiceTypesQuery = () =>
  queryOptions({
    queryKey: ["st-all"],
    queryFn: () =>
      runLookup<LookupRow>(
        "service_types",
        "id,name",
        "Erro ao carregar tipos de serviço",
        (q) => q.eq("active", true).order("sort_order"),
      ),
  });

export const serviceTypesMinQuery = () =>
  queryOptions({
    queryKey: ["service-types-min"],
    queryFn: () => runLookup<LookupRow>("service_types", "id, name", "Erro ao carregar serviços"),
  });

/* ------------------------------- Pacotes -------------------------------- */

export type PackageRow = LookupRow & { quantity?: number | null };

export const activePackagesQuery = () =>
  queryOptions({
    queryKey: ["pkg-all"],
    queryFn: () =>
      runLookup<PackageRow>("packages", "id,name,quantity", "Erro ao carregar pacotes", (q) =>
        q.eq("active", true),
      ),
  });

export const packagesMinQuery = () =>
  queryOptions({
    queryKey: ["packages-min"],
    queryFn: () => runLookup<LookupRow>("packages", "id, name", "Erro ao carregar pacotes"),
  });
