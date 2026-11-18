"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";
import { DeckItem } from "@/lib/deck";

// The Dashboard deck, which is the shared queue as the backend has it. `items` is
// the deck as it was when this page opened (the record's place in it); `refresh`
// reads the queue again, as it stands after a decision.
export function useDeck(enabled: boolean): { items: DeckItem[] | null; refresh: () => Promise<DeckItem[] | null> } {
  const [items, setItems] = useState<DeckItem[] | null>(null);
  const read = useCallback(async () => {
    try {
      return (await api.get<{ action_queue: DeckItem[] }>("/api/dashboard")).action_queue ?? [];
    } catch {
      return null;
    }
  }, []);
  useEffect(() => {
    if (!enabled || items !== null) return;
    let live = true;
    read().then((q) => { if (live && q) setItems(q); });
    return () => { live = false; };
  }, [enabled, items, read]);
  return { items, refresh: read };
}
