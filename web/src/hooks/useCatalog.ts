import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { getItems } from "@/api/catalog";
import type { Item } from "@/types/game";

export const CATALOG_QUERY_KEY = ["catalog", "items"] as const;

export function useCatalog() {
  return useQuery({
    queryKey: CATALOG_QUERY_KEY,
    queryFn: ({ signal }) => getItems(signal),
    staleTime: Infinity,
  });
}

export function useItemIndex(): Record<string, Item> {
  const { data } = useCatalog();
  return useMemo(() => {
    const m: Record<string, Item> = {};
    for (const it of data ?? []) m[it.id] = it;
    return m;
  }, [data]);
}
