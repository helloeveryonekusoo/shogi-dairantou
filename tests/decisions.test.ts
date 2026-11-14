// 要確認リストの回答（2026-11-14）に合わせた挙動
import { describe, expect, it } from 'vitest';
import { applyMove, legalMoves, nextChoice } from '../src/engine';
import type { Move } from '../src/engine';
import { find, piece, place, play, rules, withKings } from './helpers';

const R = rules();

describe('要確認リストの決定事項', () => {
  it('既定値：隣は前後左右4マス・軽減はかけ算', () => {
    expect(R.config.adjacency).toBe('four');
    expect(R.config.reductionStacking).toBe('multiplicative');
  });

  it('軽減はかけ算で重なる（−20% と −20% → −36%）', () => {
    const s = withKings(R, 0, 'king_06', 'king_06');
    const a = place(s, 'pawn_12', 0, 2, 4);
    place(s, 'pawn_05', 1, 2, 5);
    place(s, 'pawn_02', 1, 1, 5);
    place(s, 'pawn_02', 1, 3, 5);
    const hp = s.players[1].hp;
    expect(play(R, s, find(R, s, a, { x: 2, y: 5 })).state.players[1].hp).toBe(hp - 1280);
  });

  it('軽減の能力は、その駒自身が取られたときにも効く', () => {
    const s = withKings(R, 0, 'king_06', 'king_06');
    const a = place(s, 'pawn_12', 0, 2, 4);
    place(s, 'pawn_02', 1, 2, 5); // マザー・テレサ自身
    const hp = s.players[1].hp;
    expect(play(R, s, find(R, s, a, { x: 2, y: 5 })).state.players[1].hp).toBe(hp - 1600);
  });

  it('斜めは「隣」ではない', () => {
    const s = withKings(R);
    const m = place(s, 'pawn_01', 0, 1, 5);
    place(s, 'gold_04', 1, 2, 6); // 斜め前のビスマルク
    expect(legalMoves(R, s).some((x) => x.type === 'move' && x.uid === m && x.to.x === 0)).toBe(true);
  });

  it('対象が2体以上なら指した人が選ぶ（ゼノンの覚醒）', () => {
    const s = withKings(R, 0, 'king_06', 'king_06');
    const z = place(s, 'silver_06', 0, 2, 5);
    const left = place(s, 'pawn_05', 1, 1, 6);
    const right = place(s, 'pawn_07', 1, 3, 6);
    const base = find(R, s, z, { x: 2, y: 6 }, { promote: true }) as Extract<Move, { type: 'move' }>;
    const req = nextChoice(R, s, base);
    expect(req?.candidates.sort()).toEqual([left, right].sort());
    const st = applyMove(R, s, { ...base, choices: [left] }).state;
    expect(piece(st, left).statuses.some((x) => x.kind === 'immobile')).toBe(true);
    expect(piece(st, right).statuses.some((x) => x.kind === 'immobile')).toBe(false);
    expect(nextChoice(R, s, { ...base, choices: [left] })).toBeNull();
  });

  it('候補が1体だけなら選ばない', () => {
    const s = withKings(R, 0, 'king_06', 'king_06');
    const z = place(s, 'silver_06', 0, 2, 5);
    place(s, 'pawn_05', 1, 1, 6);
    expect(nextChoice(R, s, find(R, s, z, { x: 2, y: 6 }, { promote: true }))).toBeNull();
  });
});
