// もう一回対戦（再戦）の進み具合。Firebase に依存しない純粋な関数（テストしやすいように分けている）
//
// 流れ：対局が終わる → 2人とも「もう一回対戦」を押す（rematchVotes）
//      → それぞれデッキを選ぶ（nextParties[uid]）→ 2人とも選んだら同じ部屋で次の対局が始まる
import type { Party } from '../engine';

export interface RematchFields {
  status: 'waiting' | 'playing' | 'finished';
  hostUid: string;
  guestUid: string | null;
  senteUid: string | null;
  /** 何局目か（古い部屋には無い → 1局目） */
  gameNo?: number;
  /** 「もう一回対戦」を押した人の uid */
  rematchVotes?: string[];
  /** 次の対局で使うデッキ（uid → 編成） */
  nextParties?: Record<string, Party>;
  /** 再戦しないで退出した人の uid */
  declined?: string | null;
}

export type RematchPhase =
  | 'notFinished' // まだ対局中
  | 'declined' // 相手（か自分）が退出した
  | 'askMe' // 自分はまだ押していない（相手も押していない）
  | 'opponentWants' // 相手が押していて、自分はまだ
  | 'waitOpponentVote' // 自分は押した、相手の返事待ち
  | 'chooseDeck' // 2人とも同意 → 自分がデッキを選ぶ
  | 'waitOpponentDeck' // 自分は選んだ、相手のデッキ待ち
  | 'ready'; // 2人とも選んだ → 次の対局を始められる

export function rematchPhase(room: RematchFields, uid: string): RematchPhase {
  if (room.status !== 'finished' || !room.guestUid) return 'notFinished';
  if (room.declined) return 'declined';
  const opp = room.hostUid === uid ? room.guestUid : room.hostUid;
  const votes = room.rematchVotes ?? [];
  const meVoted = votes.includes(uid);
  const oppVoted = votes.includes(opp);
  if (!meVoted) return oppVoted ? 'opponentWants' : 'askMe';
  if (!oppVoted) return 'waitOpponentVote';
  const next = room.nextParties ?? {};
  if (!next[uid]) return 'chooseDeck';
  if (!next[opp]) return 'waitOpponentDeck';
  return 'ready';
}

/** 次の対局の部屋の中身（先手・後手は入れ替える） */
export function nextGameFields(room: RematchFields) {
  const next = room.nextParties ?? {};
  const guest = room.guestUid!;
  return {
    status: 'playing' as const,
    hostParty: next[room.hostUid],
    guestParty: next[guest],
    senteUid: room.senteUid === room.hostUid ? guest : room.hostUid,
    moves: [],
    result: null,
    gameNo: (room.gameNo ?? 1) + 1,
    rematchVotes: [],
    nextParties: {},
    declined: null,
  };
}
