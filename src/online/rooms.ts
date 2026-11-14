// オンライン対戦の部屋（rooms/{部屋コード}）
// エンジンは決まった手から必ず同じ局面になるので、部屋には「両者の編成」と「指した手の列」だけを保存し、
// 両方の端末が同じ手を順番に適用して局面をそろえる。
import { deleteDoc, doc, onSnapshot, runTransaction, serverTimestamp } from 'firebase/firestore';
import { db } from './firebase';
import type { GameResult, Move, Party, Player } from '../engine';
import { type RematchFields, nextGameFields, rematchPhase } from './rematch';

export interface Room extends RematchFields {
  code: string;
  status: 'waiting' | 'playing' | 'finished';
  hostUid: string;
  hostName: string;
  hostParty: Party;
  guestUid: string | null;
  guestName: string | null;
  guestParty: Party | null;
  /** 先手のプレイヤーの uid */
  senteUid: string | null;
  moves: Move[];
  result: GameResult | null;
}

const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const newCode = () => Array.from({ length: 6 }, () => CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]).join('');
export const normalizeCode = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]/g, '');

/** Firestore は undefined を保存できないので落とす */
const clean = <T,>(v: T): T => JSON.parse(JSON.stringify(v));

export async function createRoom(uid: string, name: string, party: Party): Promise<string> {
  for (let i = 0; i < 10; i++) {
    const code = newCode();
    const ref = doc(db, 'rooms', code);
    const ok = await runTransaction(db, async (tx) => {
      const snap = await tx.get(ref);
      if (snap.exists()) return false;
      tx.set(ref, {
        code,
        status: 'waiting',
        hostUid: uid,
        hostName: name,
        hostParty: clean(party),
        guestUid: null,
        guestName: null,
        guestParty: null,
        senteUid: null,
        moves: [],
        result: null,
        gameNo: 1,
        rematchVotes: [],
        nextParties: {},
        declined: null,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      return true;
    });
    if (ok) return code;
  }
  throw new Error('部屋コードを作れませんでした。もう一度お試しください');
}

export async function joinRoom(code: string, uid: string, name: string, party: Party): Promise<void> {
  const ref = doc(db, 'rooms', code);
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists()) throw new Error('その部屋コードの部屋はありません');
    const r = snap.data() as Room;
    if (r.hostUid === uid) throw new Error('自分の部屋には参加できません');
    if (r.status !== 'waiting' || r.guestUid) throw new Error('その部屋はもう対戦が始まっています');
    tx.update(ref, {
      guestUid: uid,
      guestName: name,
      guestParty: clean(party),
      // 先手はランダム
      senteUid: Math.random() < 0.5 ? r.hostUid : uid,
      status: 'playing',
      updatedAt: serverTimestamp(),
    });
  });
}

export function watchRoom(code: string, cb: (room: Room | null) => void, onError?: (e: Error) => void) {
  return onSnapshot(
    doc(db, 'rooms', code),
    (snap) => cb(snap.exists() ? (snap.data() as Room) : null),
    (e) => onError?.(e),
  );
}

/** 手を送る。ply = この手を指す前の手数（ずれていたら失敗する） */
export async function submitMove(code: string, ply: number, move: Move, result: GameResult | null) {
  const ref = doc(db, 'rooms', code);
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists()) throw new Error('部屋が見つかりません');
    const r = snap.data() as Room;
    if (r.status !== 'playing') throw new Error('対局は終わっています');
    if (r.moves.length !== ply) throw new Error('局面がずれました。読み込み直してください');
    tx.update(ref, {
      moves: [...r.moves, clean(move)],
      ...(result ? { status: 'finished', result: clean(result) } : {}),
      updatedAt: serverTimestamp(),
    });
  });
}

export async function resignRoom(code: string, result: GameResult) {
  const ref = doc(db, 'rooms', code);
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists()) return;
    const r = snap.data() as Room;
    if (r.status !== 'playing') return;
    tx.update(ref, { status: 'finished', result: clean(result), updatedAt: serverTimestamp() });
  });
}

// ───────── もう一回対戦 ─────────

async function updateFinished(code: string, fn: (r: Room) => Record<string, unknown> | null) {
  const ref = doc(db, 'rooms', code);
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists()) throw new Error('部屋が見つかりません');
    const r = snap.data() as Room;
    if (r.status !== 'finished') return; // もう次の対局が始まっている
    const patch = fn(r);
    if (patch) tx.update(ref, { ...patch, updatedAt: serverTimestamp() });
  });
}

/** 「もう一回対戦」を押す */
export const voteRematch = (code: string, uid: string) =>
  updateFinished(code, (r) => {
    const votes = r.rematchVotes ?? [];
    return votes.includes(uid) ? null : { rematchVotes: [...votes, uid] };
  });

/** 次の対局のデッキを決める */
export const chooseNextParty = (code: string, uid: string, party: Party) =>
  updateFinished(code, (r) => (rematchPhase(r, uid) === 'chooseDeck' ? { nextParties: { ...(r.nextParties ?? {}), [uid]: clean(party) } } : null));

/** 2人ともデッキを選んだら、次の対局を始める（どちらの端末が呼んでもよい。先に通った方だけが有効） */
export const startRematch = (code: string, uid: string) =>
  updateFinished(code, (r) => (rematchPhase(r, uid) === 'ready' ? clean(nextGameFields(r)) : null));

/** 再戦しないで退出する（相手に知らせる） */
export const declineRematch = (code: string, uid: string) => updateFinished(code, (r) => (r.declined ? null : { declined: uid }));

/** 待っている部屋をやめる */
export const cancelRoom = (code: string) => deleteDoc(doc(db, 'rooms', code));

/** 部屋から見た両者の情報 */
export function sides(room: Room): { parties: [Party, Party]; names: [string, string]; uids: [string, string] } | null {
  if (!room.guestUid || !room.guestParty || !room.senteUid) return null;
  const hostIsSente = room.senteUid === room.hostUid;
  const host = { party: room.hostParty, name: room.hostName, uid: room.hostUid };
  const guest = { party: room.guestParty, name: room.guestName ?? '相手', uid: room.guestUid };
  const [s, g] = hostIsSente ? [host, guest] : [guest, host];
  return { parties: [s.party, g.party], names: [s.name, g.name], uids: [s.uid, g.uid] };
}

export const mySide = (room: Room, uid: string): Player => (room.senteUid === uid ? 0 : 1);
