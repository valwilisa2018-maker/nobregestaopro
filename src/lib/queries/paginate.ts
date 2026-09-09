/**
 * Busca TODAS as linhas de uma consulta Supabase em blocos, evitando o limite
 * padrão do Data API (1000 linhas) que silenciosamente corta registros e faz
 * relatórios/dashboards mostrarem valores menores do que o real.
 *
 * Uso:
 *   const rows = await fetchAllPaged((from, to) =>
 *     supabase.from("sales").select("id,total_amount").range(from, to),
 *   );
 */
export async function fetchAllPaged<T>(
  build: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>,
  pageSize = 1000,
): Promise<T[]> {
  const out: T[] = [];
  let from = 0;

  // Trava de segurança: no máximo 100 páginas (100k linhas).
  for (let page = 0; page < 100; page++) {
    const { data, error } = await build(from, from + pageSize - 1);
    if (error) throw error;
    const chunk = data ?? [];
    out.push(...chunk);
    if (chunk.length < pageSize) break;
    from += pageSize;
  }

  return out;
}
