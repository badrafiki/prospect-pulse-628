import { supabase } from "@/integrations/supabase/client";

type TableName = "companies" | "emails" | "people" | "searches" | "search_results" | "crawled_urls" | "profiles" | "user_roles";

/**
 * Fetches all rows from a Supabase table, bypassing the default 1000-row limit
 * by paginating with .range() calls.
 */
export async function fetchAllRows<T = any>(
  table: TableName,
  options?: {
    order?: { column: string; ascending: boolean };
    neq?: { column: string; value: string };
  }
): Promise<T[]> {
  const PAGE_SIZE = 1000;
  const all: T[] = [];
  let from = 0;

  while (true) {
    let query = supabase.from(table).select("*") as any;
    if (options?.neq) {
      query = query.neq(options.neq.column, options.neq.value);
    }
    if (options?.order) {
      query = query.order(options.order.column, { ascending: options.order.ascending });
    }
    query = query.range(from, from + PAGE_SIZE - 1);

    const { data, error } = await query;
    if (error) throw error;
    if (!data || data.length === 0) break;
    all.push(...(data as T[]));
    if (data.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }

  return all;
}
