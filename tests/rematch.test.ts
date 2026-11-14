// もう一回対戦の進み方
import { describe, expect, it } from 'vitest';
import { nextGameFields, rematchPhase, type RematchFields } from '../src/online/rematch';
import { PRESET_PARTIES } from '../src/engine';

const A = PRESET_PARTIES[0].party;
const B = PRESET_PARTIES[1].party;
const base: RematchFields = { status: 'finished', hostUid: 'h', guestUid: 'g', senteUid: 'h', gameNo: 1, rematchVotes: [], nextParties: {}, declined: null };

describe('もう一回対戦', () => {
  it('対局中は何も出ない', () => {
    expect(rematchPhase({ ...base, status: 'playing' }, 'h')).toBe('notFinished');
  });

  it('同意 → デッキ選択 → 開始 の順に進む', () => {
    let r: RematchFields = { ...base };
    expect(rematchPhase(r, 'h')).toBe('askMe');
    r = { ...r, rematchVotes: ['h'] };
    expect(rematchPhase(r, 'h')).toBe('waitOpponentVote');
    expect(rematchPhase(r, 'g')).toBe('opponentWants');
    r = { ...r, rematchVotes: ['h', 'g'] };
    expect(rematchPhase(r, 'h')).toBe('chooseDeck');
    r = { ...r, nextParties: { g: B } };
    expect(rematchPhase(r, 'g')).toBe('waitOpponentDeck');
    expect(rematchPhase(r, 'h')).toBe('chooseDeck');
    r = { ...r, nextParties: { g: B, h: A } };
    expect(rematchPhase(r, 'h')).toBe('ready');
    expect(rematchPhase(r, 'g')).toBe('ready');
  });

  it('退出した人がいれば止まる', () => {
    expect(rematchPhase({ ...base, rematchVotes: ['h'], declined: 'g' }, 'h')).toBe('declined');
  });

  it('次の対局：選んだデッキ・先手後手は入れ替え・手は空・何局目が増える', () => {
    const r: RematchFields = { ...base, gameNo: 3, rematchVotes: ['h', 'g'], nextParties: { h: B, g: A } };
    const n = nextGameFields(r);
    expect(n).toMatchObject({ status: 'playing', hostParty: B, guestParty: A, senteUid: 'g', moves: [], result: null, gameNo: 4 });
    expect(n.rematchVotes).toEqual([]);
    expect(n.nextParties).toEqual({});
  });

  it('古い部屋（再戦の項目なし）でも動く', () => {
    const old: RematchFields = { status: 'finished', hostUid: 'h', guestUid: 'g', senteUid: 'g' };
    expect(rematchPhase(old, 'h')).toBe('askMe');
    expect(nextGameFields({ ...old, nextParties: { h: A, g: B } }).gameNo).toBe(2);
  });
});
