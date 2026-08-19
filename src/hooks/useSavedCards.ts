import { useCallback, useEffect, useState } from 'react';
import type { GradingSession } from '../lib/session';
import {
  deleteSavedCard,
  listSavedCards,
  saveCardToLibrary,
  updateSavedCardLabel,
  type SavedCardRecord,
} from '../lib/saved-cards';

export function useSavedCards() {
  const [cards, setCards] = useState<SavedCardRecord[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      setCards(await listSavedCards());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const save = useCallback(
    async (session: GradingSession, label?: string) => {
      const record = await saveCardToLibrary(session, label);
      setCards((prev) => [record, ...prev.filter((c) => c.id !== record.id)]);
      return record;
    },
    [],
  );

  const remove = useCallback(async (id: string) => {
    await deleteSavedCard(id);
    setCards((prev) => prev.filter((c) => c.id !== id));
  }, []);

  const update = useCallback(async (id: string, label: string) => {
    await updateSavedCardLabel(id, label);
    setCards((prev) => prev.map((c) => (c.id === id ? { ...c, label } : c)));
  }, []);

  return { cards, loading, refresh, save, remove, update };
}
