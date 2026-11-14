// マイデッキ（users/{uid}/decks/{deckId}）
import { useEffect, useState } from 'react';
import { addDoc, collection, deleteDoc, doc, onSnapshot, orderBy, query, serverTimestamp, updateDoc } from 'firebase/firestore';
import { db } from './firebase';
import type { Party } from '../engine';

export interface Deck {
  id: string;
  name: string;
  party: Party;
  updatedAt?: { toMillis(): number } | null;
}

const decksCol = (uid: string) => collection(db, 'users', uid, 'decks');

export function useDecks(uid: string | null): { decks: Deck[]; loading: boolean; error: string | null } {
  const [decks, setDecks] = useState<Deck[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!uid) {
      setDecks([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    return onSnapshot(
      query(decksCol(uid), orderBy('updatedAt', 'desc')),
      (snap) => {
        setDecks(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Deck, 'id'>) })));
        setLoading(false);
        setError(null);
      },
      (e) => {
        setError(String(e.message ?? e));
        setLoading(false);
      },
    );
  }, [uid]);
  return { decks, loading, error };
}

export async function createDeck(uid: string, name: string, party: Party): Promise<string> {
  const ref = await addDoc(decksCol(uid), { name, party, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
  return ref.id;
}

export async function saveDeck(uid: string, id: string, name: string, party: Party) {
  await updateDoc(doc(db, 'users', uid, 'decks', id), { name, party, updatedAt: serverTimestamp() });
}

export async function deleteDeck(uid: string, id: string) {
  await deleteDoc(doc(db, 'users', uid, 'decks', id));
}
