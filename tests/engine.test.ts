import { describe, expect, it } from 'vitest';
import {
  PRESET_PARTIES,
  SLOTS,
  applyMove,
  createGame,
  legalMoves,
  partyHp,
  positionKey,
  randomParty,
  resolveNum,
  validateParty,
} from '../src/engine';
import type { GameState, Move, Rules } from '../src/engine';
import { CARD_DB } from '../src/data';
import { ABILITIES } from '../src/data/abilities';
import { emptyGame, find, piece, place, play, rules, toHand, withKings } from './helpers';

const R = rules();

/** 王を1マス動かすだけの手（時間を進めるため） */
function kingShuffle(r: Rules, s: GameState): Move {
  const me = s.turn;
  const king = s.pieces.find((p) => p.owner === me && p.pos && r.db.cards[p.cardId].piece === '王')!;
  const m = legalMoves(r, s).find((mv) => mv.type === 'move' && mv.uid === king.uid);
  if (!m) throw new Error('王が動けない');
  return m;
}

describe('盤と駒', () => {
  it('初期配置とパーティHP', () => {
    const parties = [PRESET_PARTIES[0].party, PRESET_PARTIES[1].party] as const;
    const { state } = createGame(R, [parties[0], parties[1]]);
    expect(state.pieces).toHaveLength(24);
    const king0 = state.pieces.find((p) => p.cardId === parties[0].king)!;
    const king1 = state.pieces.find((p) => p.cardId === parties[1].king)!;
    expect(king0.pos).toEqual({ x: 2, y: 0 });
    expect(king1.pos).toEqual({ x: 2, y: 8 });
    expect(state.players[0].hp).toBe(partyHp(CARD_DB, parties[0]));
    expect(state.players[0].turnCount).toBe(1);
  });

  it('プリセット編成はどれもコスト上限以内', () => {
    for (const p of PRESET_PARTIES) expect(validateParty(CARD_DB, p.party, R.config)).toEqual([]);
    for (let i = 0; i < 20; i++) expect(validateParty(CARD_DB, randomParty(CARD_DB, R.config), R.config)).toEqual([]);
  });

  it('二歩は打てない・最終段に歩は打てない', () => {
    const s = withKings(R);
    place(s, 'pawn_05', 0, 1, 2);
    const h = toHand(s, 'pawn_07', 0);
    const drops = legalMoves(R, s).filter((m) => m.type === 'drop' && m.uid === h);
    expect(drops.some((m) => m.type === 'drop' && m.to.x === 1)).toBe(false);
    expect(drops.some((m) => m.type === 'drop' && m.to.x === 2 && m.to.y === 4)).toBe(true);
    expect(drops.some((m) => m.type === 'drop' && m.to.y === 8)).toBe(false);
  });

  it('後ろに動ける歩（パスツール）は最終段に打てる', () => {
    const s = withKings(R);
    const h = toHand(s, 'pawn_04', 0);
    expect(legalMoves(R, s).some((m) => m.type === 'drop' && m.uid === h && m.to.y === 8)).toBe(true);
  });

  it('桂は8段目に行くと必ず成る', () => {
    const s = withKings(R);
    const n = place(s, 'knight_05', 0, 1, 5);
    const to7 = legalMoves(R, s).filter((m) => m.type === 'move' && m.uid === n && m.to.y === 7);
    expect(to7.length).toBeGreaterThan(0);
    expect(to7.every((m) => m.type === 'move' && m.promote)).toBe(true);
  });

  it('敵陣に入るときは成る・成らないを選べる', () => {
    const s = withKings(R);
    const p = place(s, 'pawn_12', 0, 2, 5);
    const ms = legalMoves(R, s).filter((m) => m.type === 'move' && m.uid === p);
    expect(ms.map((m) => m.type === 'move' && m.promote).sort()).toEqual([false, true]);
  });
});

describe('ダメージと勝敗', () => {
  it('撃破ダメージ＝取った駒のATK。取った駒は持ち駒になる', () => {
    const s = withKings(R, 0, 'king_06', 'king_06');
    const a = place(s, 'pawn_12', 0, 2, 4);
    const v = place(s, 'pawn_05', 1, 2, 5);
    const hp = s.players[1].hp;
    const { state } = play(R, s, find(R, s, a, { x: 2, y: 5 }));
    expect(state.players[1].hp).toBe(hp - 2000);
    expect(piece(state, v).owner).toBe(0);
    expect(piece(state, v).pos).toBeNull();
  });

  it('打つと、その駒のHPぶん自傷ダメージ', () => {
    const s = withKings(R, 0, 'king_06', 'king_06');
    const h = toHand(s, 'pawn_05', 0);
    const hp = s.players[0].hp;
    const { state } = play(R, s, find(R, s, h, { x: 2, y: 4 }));
    expect(state.players[0].hp).toBe(hp - 1700);
  });

  it('メディチ（+300）とクレオパトラ（+10%）で自傷ダメージが増える', () => {
    const s = withKings(R, 0, 'king_06', 'king_04');
    place(s, 'pawn_18', 1, 0, 6);
    const h = toHand(s, 'pawn_05', 0);
    const hp = s.players[0].hp;
    const { state } = play(R, s, find(R, s, h, { x: 2, y: 4 }));
    expect(state.players[0].hp).toBe(hp - Math.round((1700 + 300) * 1.1));
  });

  it('リーダー倍率：ナポレオン（攻ATK+10%）は王が前に出るほど強い', () => {
    const s = withKings(R, 0, 'king_03', 'king_06');
    const a = place(s, 'pawn_12', 0, 2, 4);
    place(s, 'pawn_05', 1, 2, 5);
    const hp = s.players[1].hp;
    expect(play(R, s, find(R, s, a, { x: 2, y: 5 })).state.players[1].hp).toBe(hp - 2200);
    // 王を4段目へ → ×1.7 → +17%
    s.pieces.find((p) => p.cardId === 'king_03')!.pos = { x: 0, y: 3 };
    expect(play(R, s, find(R, s, a, { x: 2, y: 5 })).state.players[1].hp).toBe(hp - 2340);
  });

  it('マザー・テレサ：隣の味方が取られたときの撃破ダメージ−20%', () => {
    const s = withKings(R, 0, 'king_06', 'king_06');
    const a = place(s, 'pawn_12', 0, 2, 4);
    place(s, 'pawn_05', 1, 2, 5);
    place(s, 'pawn_02', 1, 3, 5);
    const hp = s.players[1].hp;
    expect(play(R, s, find(R, s, a, { x: 2, y: 5 })).state.players[1].hp).toBe(hp - 1600);
  });

  it('王を取ったら勝ち', () => {
    const s = withKings(R);
    const rk = place(s, 'rook_05', 0, 4, 1);
    const { state } = play(R, s, find(R, s, rk, { x: 4, y: 8 }));
    expect(state.result).toMatchObject({ winner: 0, reason: 'king' });
  });

  it('相手のHPを0にしたら勝ち', () => {
    const s = withKings(R, 0, 'king_06', 'king_06');
    const a = place(s, 'pawn_12', 0, 2, 4);
    place(s, 'pawn_05', 1, 2, 5);
    s.players[1].hp = 100;
    expect(play(R, s, find(R, s, a, { x: 2, y: 5 })).state.result).toMatchObject({ winner: 0, reason: 'hp' });
  });

  it('打った自傷ダメージで自分のHPが0になったら負け', () => {
    const s = withKings(R, 0, 'king_06', 'king_06');
    const h = toHand(s, 'pawn_05', 0);
    s.players[0].hp = 100;
    expect(play(R, s, find(R, s, h, { x: 2, y: 4 })).state.result).toMatchObject({ winner: 1, reason: 'hp' });
  });

  it('千日手：同じ局面4回で、HP割合が同じなら後手の勝ち', () => {
    let s = withKings(R);
    s.history[positionKey(s)] = 1;
    for (let i = 0; i < 12 && !s.result; i++) {
      const me = s.turn;
      const king = s.pieces.find((p) => p.owner === me && R.db.cards[p.cardId].piece === '王')!;
      const home = me === 0 ? { x: 0, y: 0 } : { x: 4, y: 8 };
      const away = me === 0 ? { x: 0, y: 1 } : { x: 4, y: 7 };
      const to = king.pos!.x === home.x && king.pos!.y === home.y ? away : home;
      s = play(R, s, find(R, s, king.uid, to)).state;
    }
    expect(s.result).toMatchObject({ winner: 1, reason: 'repetition' });
  });
});

describe('能力', () => {
  it('成ったとき覚醒（マゼラン：1000ダメージ）', () => {
    const s = withKings(R, 0, 'king_06', 'king_06');
    const p = place(s, 'pawn_12', 0, 2, 5);
    const hp = s.players[1].hp;
    const { state } = play(R, s, find(R, s, p, { x: 2, y: 6 }, { promote: true }));
    expect(state.players[1].hp).toBe(hp - 1000);
    expect(piece(state, p).promoted).toBe(true);
  });

  it('【罠】アガサ：取った駒は持ち主の手番2回ぶん動けない', () => {
    let s = withKings(R, 0, 'king_06', 'king_06');
    const a = place(s, 'pawn_12', 0, 2, 4);
    place(s, 'silver_04', 1, 2, 5);
    s = play(R, s, find(R, s, a, { x: 2, y: 5 })).state;
    const canMove = () => legalMoves(R, s).some((m) => m.type === 'move' && m.uid === a);
    s = play(R, s, kingShuffle(R, s)).state; // 後手
    expect(canMove()).toBe(false); // 先手1回目
    s = play(R, s, kingShuffle(R, s)).state;
    s = play(R, s, kingShuffle(R, s)).state;
    expect(canMove()).toBe(false); // 先手2回目
    s = play(R, s, kingShuffle(R, s)).state;
    s = play(R, s, kingShuffle(R, s)).state;
    expect(canMove()).toBe(true); // 先手3回目
  });

  it('ハンニバルの縦の利きにいる敵は【罠】が発動しない', () => {
    const s = withKings(R, 0, 'king_06', 'king_06');
    const rk = place(s, 'rook_04', 0, 2, 2);
    place(s, 'silver_04', 1, 2, 5);
    const st = play(R, s, find(R, s, rk, { x: 2, y: 5 })).state;
    expect(piece(st, rk).statuses.some((x) => x.kind === 'immobile')).toBe(false);

    const s2 = withKings(R, 0, 'king_06', 'king_06');
    const rk2 = place(s2, 'rook_05', 0, 2, 2);
    place(s2, 'silver_04', 1, 2, 5);
    const st2 = play(R, s2, find(R, s2, rk2, { x: 2, y: 5 })).state;
    expect(piece(st2, rk2).statuses.some((x) => x.kind === 'immobile')).toBe(true);
  });

  it('毒：相手の手番開始時に3回ダメージ', () => {
    let s = withKings(R, 0, 'king_05', 'king_05');
    const b = place(s, 'bishop_04', 0, 1, 1);
    place(s, 'pawn_05', 1, 3, 3);
    const hp0 = s.players[1].hp;
    s = play(R, s, find(R, s, b, { x: 3, y: 3 })).state;
    // 撃破ダメージ3500 + 後手の手番開始で毒400
    expect(s.players[1].hp).toBe(hp0 - 3500 - 400);
    for (let i = 0; i < 6; i++) s = play(R, s, kingShuffle(R, s)).state;
    expect(s.players[1].hp).toBe(hp0 - 3500 - 1200);
  });

  it('ツタンカーメン：妨害属性の能力ダメージ+10%（毒にも乗る）', () => {
    const s = withKings(R, 0, 'king_06', 'king_05');
    const b = place(s, 'bishop_04', 0, 1, 1);
    place(s, 'pawn_05', 1, 3, 3);
    const hp0 = s.players[1].hp;
    const st = play(R, s, find(R, s, b, { x: 3, y: 3 })).state;
    expect(st.players[1].hp).toBe(hp0 - 3500 - 440);
  });

  it('金の敵陣効果は、敵陣を出てから2手番たたないと再発動しない', () => {
    let s = withKings(R, 0, 'king_06', 'king_06');
    const g = place(s, 'gold_05', 0, 2, 5);
    const hp = () => s.players[1].hp;
    const h0 = hp();
    s = play(R, s, find(R, s, g, { x: 2, y: 6 })).state; // T1 入る → 800
    expect(hp()).toBe(h0 - 800);
    s = play(R, s, kingShuffle(R, s)).state;
    s = play(R, s, find(R, s, g, { x: 2, y: 5 })).state; // T2 出る
    s = play(R, s, kingShuffle(R, s)).state;
    s = play(R, s, find(R, s, g, { x: 2, y: 6 })).state; // T3 入る → 発動しない
    expect(hp()).toBe(h0 - 800);
    s = play(R, s, kingShuffle(R, s)).state;
    s = play(R, s, find(R, s, g, { x: 2, y: 5 })).state; // T4 出る
    s = play(R, s, kingShuffle(R, s)).state;
    s = play(R, s, kingShuffle(R, s)).state; // T5 待つ
    s = play(R, s, kingShuffle(R, s)).state;
    s = play(R, s, find(R, s, g, { x: 2, y: 6 })).state; // T6 入る → 発動
    expect(hp()).toBe(h0 - 1600);
  });

  it('ビスマルクの隣の敵は横に動けない', () => {
    const s = withKings(R);
    const m = place(s, 'pawn_01', 0, 1, 5);
    expect(legalMoves(R, s).some((x) => x.type === 'move' && x.uid === m && x.to.x === 0)).toBe(true);
    place(s, 'gold_04', 1, 2, 5);
    const ms = legalMoves(R, s).filter((x) => x.type === 'move' && x.uid === m);
    expect(ms.some((x) => x.type === 'move' && x.to.y === 5)).toBe(false);
    expect(ms.some((x) => x.type === 'move' && x.to.y === 6)).toBe(true);
  });

  it('ダルタニャン：撃破した後に斜め後ろへ下がれる', () => {
    const s = withKings(R);
    const d = place(s, 'silver_01', 0, 2, 4);
    place(s, 'pawn_05', 1, 3, 5);
    const st = play(R, s, find(R, s, d, { x: 3, y: 5 }, { retreat: { x: 4, y: 4 } })).state;
    expect(piece(st, d).pos).toEqual({ x: 4, y: 4 });
  });

  it('クレオパトラ：王手をかけた駒を行動不能にする（1回だけ）', () => {
    let s = withKings(R, 0, 'king_06', 'king_04');
    s.pieces.find((p) => p.cardId === 'king_04')!.pos = { x: 2, y: 8 };
    const rk = place(s, 'rook_05', 0, 4, 1);
    s = play(R, s, find(R, s, rk, { x: 2, y: 1 })).state;
    expect(piece(s, rk).statuses.some((x) => x.kind === 'immobile')).toBe(true);
    s = play(R, s, kingShuffle(R, s)).state;
    expect(legalMoves(R, s).some((m) => m.type === 'move' && m.uid === rk)).toBe(false);
  });

  it('ジェロニモ：跳び越えた敵1体につき600ダメージ', () => {
    const s = withKings(R, 0, 'king_06', 'king_06');
    const n = place(s, 'knight_03', 0, 2, 2);
    place(s, 'pawn_05', 1, 2, 3);
    place(s, 'pawn_07', 1, 1, 3);
    const hp = s.players[1].hp;
    expect(play(R, s, find(R, s, n, { x: 1, y: 4 })).state.players[1].hp).toBe(hp - 1200);
  });

  it('ピカソ：撃破したとき隣の敵を後ろへ押し出す', () => {
    const s = withKings(R, 0, 'king_06', 'king_06');
    const n = place(s, 'knight_04', 0, 2, 2);
    place(s, 'pawn_05', 1, 1, 4);
    const e = place(s, 'pawn_07', 1, 1, 5);
    const st = play(R, s, find(R, s, n, { x: 1, y: 4 })).state;
    expect(piece(st, e).pos).toEqual({ x: 1, y: 6 });
  });
});

describe('データ', () => {
  it('全カードの能力定義があり、数値の参照がテキストにある', () => {
    for (const card of CARD_DB.list) {
      const def = ABILITIES[card.id];
      expect(def, card.id).toBeDefined();
      if (card.ability) expect(def.ability.length, `${card.id} ability`).toBeGreaterThan(0);
      expect(def.special.length, `${card.id} special`).toBeGreaterThan(0);
      const walk = (o: unknown) => {
        if (!o || typeof o !== 'object') return;
        const rec = o as Record<string, unknown>;
        if ((rec.src === 'a' || rec.src === 's') && typeof rec.i === 'number') {
          expect(() => resolveNum(R, card.id, rec as { src: 'a' | 's'; i: number })).not.toThrow();
          return;
        }
        for (const v of Object.values(rec)) walk(v);
      };
      walk(def);
    }
  });
});

describe('ランダム対局（落ちないこと）', () => {
  it('ランダムな手で多数の対局を最後まで進められる', () => {
    let seed = 12345;
    const rand = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
    let finished = 0;
    for (let g = 0; g < 60; g++) {
      const parties = [randomParty(CARD_DB, R.config, rand), randomParty(CARD_DB, R.config, rand)] as const;
      let { state } = createGame(R, [parties[0], parties[1]]);
      for (let ply = 0; ply < 300 && !state.result; ply++) {
        const ms = legalMoves(R, state);
        const m = ms[Math.floor(rand() * ms.length)];
        state = applyMove(R, state, m, { skipLegalCheck: true }).state;
        // 1マスに2枚いないこと
        const seen = new Set<string>();
        for (const p of state.pieces) {
          if (!p.pos) continue;
          const k = `${p.pos.x},${p.pos.y}`;
          expect(seen.has(k)).toBe(false);
          seen.add(k);
        }
        expect(state.pieces.filter((p) => !p.excluded)).toHaveLength(state.pieces.filter((p) => !p.excluded).length);
      }
      if (state.result) finished++;
    }
    expect(finished).toBeGreaterThan(0);
    expect(SLOTS).toHaveLength(12);
  });
});

void emptyGame;
