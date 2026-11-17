"use client";

import { useEffect, useState } from "react";
import { useFetch } from "@/lib/useFetch";
import { DeckItem, openItems } from "@/lib/deck";
import { getMyDecisions, getPipeline } from "@/lib/myWorkspace";

// The Dashboard deck as it was when this page opened: the same records in the
// same order the Dashboard shows. It isn't refetched after a decision, so "Next"
// is the card that followed this one when it was opened.
export function useDeck(enabled: boolean): DeckItem[] | null {
  const { data } = useFetch<{ action_queue: DeckItem[] }>(enabled ? "/api/dashboard" : null);
  const [items, setItems] = useState<DeckItem[] | null>(null);
  useEffect(() => {
    if (data && items === null) setItems(openItems(data.action_queue ?? [], getMyDecisions(), getPipeline()));
  }, [data, items]);
  return items;
}
