import { makeRules } from '../src/data';
import { PRESET_PARTIES, createGame, legalMoves, applyMove, samePos } from '../src/engine';
import type { GameConfig, GameState, Move, Player, Pos, Rules } from '../src/engine';

export function rules(cfg: Partial<GameConfig> = {}): Rules {
  return makeRules(cfg);
}

/** 盤を空にした局面（HPは初期編成のまま） */
export function emptyGame(r: Rules, turn: Player = 0): GameState {
  const { state } = createGame(r, [PRESET_PARTIES[0].party, PRESET_PARTIES[1].party]);
  state.pieces = [];
  state.turn = turn;
  state.history = {};
  state.players[0].turnCount = 1;
  state.players[1].turnCount = turn === 1 ? 1 : 0;
  return state;
}

export function place(state: GameState, cardId: string, owner: Player, x: number, y: number, promoted = false): number {
  const uid = state.nextUid++;
  state.pieces.push({
    uid,
    cardId,
    owner,
    originalOwner: owner,
    promoted,
    pos: { x, y },
    statuses: [],
    atkFlat: 0,
    atkPctPerm: 0,
    upgraded: false,
    onceUsed: false,
    campLeftAt: null,
    excluded: false,
  });
  return uid;
}

export function toHand(state: GameState, cardId: string, owner: Player): number {
  const uid = place(state, cardId, owner, 0, 0);
  state.pieces.find((p) => p.uid === uid)!.pos = null;
  return uid;
}

/** 王2枚だけ置いた局面（王がいないと勝敗判定がおかしくなるので） */
export function withKings(r: Rules, turn: Player = 0, k0 = 'king_05', k1 = 'king_05'): GameState {
  const s = emptyGame(r, turn);
  place(s, k0, 0, 0, 0);
  place(s, k1, 1, 4, 8);
  return s;
}

export function find(r: Rules, s: GameState, uid: number, to: Pos, extra: Partial<{ promote: boolean; retreat: Pos }> = {}): Move {
  const ms = legalMoves(r, s).filter(
    (m) =>
      (m.type === 'move' || m.type === 'drop') &&
      m.uid === uid &&
      samePos(m.to, to) &&
      (m.type !== 'move' || extra.promote === undefined || m.promote === extra.promote) &&
      (m.type !== 'move' || (extra.retreat ? samePos(m.retreat, extra.retreat) : !m.retreat)),
  );
  if (ms.length === 0) throw new Error(`手が見つかりません uid=${uid} to=${JSON.stringify(to)}`);
  return ms[0];
}

export function play(r: Rules, s: GameState, m: Move) {
  return applyMove(r, s, m);
}

export const piece = (s: GameState, uid: number) => s.pieces.find((p) => p.uid === uid)!;
