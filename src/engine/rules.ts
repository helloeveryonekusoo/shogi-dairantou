// ルールの文脈（カードDB・設定・能力定義）と、局面から値を読む関数
import type { AbilityDef, CardAbilities, Condition, NumRef, PassiveAbility } from './abilityTypes';
import type { CardData, CardDB, GameState, PieceState, Player, Pos } from './types';
import type { GameConfig } from './config';
import type { MoveSet } from '../data/movements';
import { CARD_MOVES, STD_PROMOTED, STD_UNPROMOTED } from '../data/movements';
import {
  type BoardMap,
  FILES,
  RANKS,
  absVec,
  forward,
  inEnemyCamp,
  inOwnCamp,
  isAround8,
  isOrthAdjacent,
  onBoard,
  onBoardPieces,
  relRank,
  samePos,
} from './board';

export interface Rules {
  db: CardDB;
  config: GameConfig;
  abilities: Record<string, CardAbilities>;
  moves: typeof CARD_MOVES;
}

export type Slot = 'ability' | 'special';

export const cardOf = (r: Rules, p: PieceState): CardData => r.db.cards[p.cardId];

// ───────── 動き ─────────

export function unpromotedSet(r: Rules, cardId: string): MoveSet {
  const c = r.db.cards[cardId];
  return r.moves[cardId]?.before ?? STD_UNPROMOTED[c.piece];
}

/** 成った後の動き。null = 成らない */
export function promotedSet(r: Rules, cardId: string): MoveSet | null {
  const c = r.db.cards[cardId];
  const custom = r.moves[cardId];
  if (custom && 'after' in custom) return custom.after ?? null;
  return STD_PROMOTED[c.piece];
}

export function moveSetOf(r: Rules, p: PieceState): MoveSet {
  if (p.promoted) return promotedSet(r, p.cardId) ?? unpromotedSet(r, p.cardId);
  return unpromotedSet(r, p.cardId);
}

export const canPromote = (r: Rules, p: PieceState) => !p.promoted && promotedSet(r, p.cardId) !== null;

/** 盤に他の駒が無いとして、その位置から1つでも動ける先があるか（行き所のない駒の判定） */
export function hasAnyGeometricMove(set: MoveSet, owner: Player, pos: Pos): boolean {
  for (const c of set.comps) {
    if (c.k === 'step' || c.k === 'slide' || c.k === 'jump') {
      const [dx, dy] = absVec(owner, c.d);
      if (onBoard(pos.x + dx, pos.y + dy)) return true;
    }
  }
  return false;
}

// ───────── 数値 ─────────

const numCache = new Map<string, number[]>();
export function textNumbers(text: string | null | undefined): number[] {
  if (!text) return [];
  let v = numCache.get(text);
  if (!v) {
    v = (text.match(/\d+(?:\.\d+)?/g) ?? []).map(Number);
    numCache.set(text, v);
  }
  return v;
}

export function resolveNum(r: Rules, cardId: string, ref: NumRef): number {
  if (typeof ref === 'number') return ref;
  const c = r.db.cards[cardId];
  const text = ref.src === 'a' ? c.ability : c.special.text;
  const v = textNumbers(text)[ref.i];
  if (v === undefined) throw new Error(`${c.id}（${c.name}）: テキストに${ref.i}番目の数字がありません`);
  return v;
}

// ───────── 状態 ─────────

export const hasStatus = (p: PieceState, kind: 'immobile' | 'seal') =>
  p.statuses.some((s) => s.kind === kind && s.remaining > 0);
export const isSealed = (p: PieceState) => hasStatus(p, 'seal');
export const isImmobile = (p: PieceState) => hasStatus(p, 'immobile');
export const statusTurns = (p: PieceState, kind: 'immobile' | 'seal' | 'atkPct') =>
  p.statuses.filter((s) => s.kind === kind).reduce((m, s) => Math.max(m, s.remaining), 0);

export const isAdjacent = (r: Rules, a: Pos, b: Pos) =>
  r.config.adjacency === 'eight' ? isAround8(a, b) : isOrthAdjacent(a, b);

export function kingOf(state: GameState, r: Rules, player: Player): PieceState | undefined {
  return state.pieces.find((p) => p.pos && !p.excluded && p.owner === player && r.db.cards[p.cardId].piece === '王');
}

// ───────── 能力の有効／無効 ─────────

export const defsOf = (r: Rules, p: PieceState, slot: Slot): AbilityDef[] => r.abilities[p.cardId]?.[slot] ?? [];

/** 縦の利き（上下それぞれ最初にぶつかる駒のマス） */
export function verticalSightHits(board: BoardMap, pos: Pos): Pos[] {
  const hits: Pos[] = [];
  for (const dy of [1, -1]) {
    for (let y = pos.y + dy; y >= 0 && y < RANKS; y += dy) {
      if (board[pos.x][y]) {
        hits.push({ x: pos.x, y });
        break;
      }
    }
  }
  return hits;
}

/** 斜めの利き（4方向それぞれ最初にぶつかる駒のマス） */
export function diagonalSightHits(board: BoardMap, pos: Pos): Pos[] {
  const hits: Pos[] = [];
  for (const [dx, dy] of [
    [1, 1],
    [1, -1],
    [-1, 1],
    [-1, -1],
  ]) {
    for (let x = pos.x + dx, y = pos.y + dy; x >= 0 && x < FILES && y >= 0 && y < RANKS; x += dx, y += dy) {
      if (board[x][y]) {
        hits.push({ x, y });
        break;
      }
    }
  }
  return hits;
}

/** ハンニバル：この駒の縦の利きにいる敵は能力が発動しない */
export function suppressedByVerticalSight(r: Rules, state: GameState, board: BoardMap, owner: Player, pos: Pos): boolean {
  for (const h of onBoardPieces(state)) {
    if (h.owner === owner || isSealed(h)) continue;
    if (!defsOf(r, h, 'ability').some((d) => d.type === 'passive' && d.p === 'disableAbilitiesInVerticalSight')) continue;
    if (verticalSightHits(board, h.pos!).some((hp) => samePos(hp, pos))) return true;
  }
  return false;
}

/** その駒の能力（ability か special）が今発動できるか */
export function isActive(r: Rules, state: GameState, board: BoardMap, p: PieceState, slot: Slot): boolean {
  if (!p.pos || p.excluded) return false;
  if (slot === 'special' && !r.config.sealBlocksSpecial) return true;
  if (isSealed(p)) return false;
  return !suppressedByVerticalSight(r, state, board, p.owner, p.pos);
}

/** 有効な passive 能力を列挙 */
export function activePassives(
  r: Rules,
  state: GameState,
  board: BoardMap,
  p: PieceState,
): { def: PassiveAbility; slot: Slot }[] {
  const out: { def: PassiveAbility; slot: Slot }[] = [];
  for (const slot of ['ability', 'special'] as const) {
    const defs = defsOf(r, p, slot);
    if (!defs.some((d) => d.type === 'passive')) continue;
    if (!isActive(r, state, board, p, slot)) continue;
    for (const d of defs) if (d.type === 'passive') out.push({ def: d, slot });
  }
  return out;
}

// ───────── リーダー倍率 ─────────

export function leaderMult(r: Rules, state: GameState, player: Player): number {
  const king = kingOf(state, r, player);
  if (!king?.pos) return 1;
  const rank = relRank(player, king.pos.y);
  return r.config.leaderMultiplier.find((m) => rank <= m.maxRank)?.mult ?? 1;
}

/** その能力の数値にリーダー倍率をかける（リーダースキルのときだけ） */
export function scaleIfLeader(r: Rules, state: GameState, p: PieceState, slot: Slot, v: number): number {
  if (slot === 'special' && cardOf(r, p).special.type === 'leader') return v * leaderMult(r, state, p.owner);
  return v;
}

// ───────── 条件 ─────────

export interface MoveInfo {
  from: Pos;
  to: Pos;
  kind: 'step' | 'slide' | 'jump';
  /** 持ち主から見た向き（step/slide は1マスぶんの単位ベクトル、jump は跳ぶベクトル） */
  d: [number, number];
  /** 何マス動いたか */
  dist: number;
}

export interface CondCtx {
  source: PieceState;
  /** source の持ち主（取られた駒のときは取られる前の持ち主） */
  owner: Player;
  /** 条件を調べる局面（source の位置もここで見る） */
  state: GameState;
  board: BoardMap;
  move?: MoveInfo;
  victim?: PieceState;
  victimPos?: Pos;
  capturer?: PieceState;
}

export function checkCondition(r: Rules, c: Condition, ctx: CondCtx): boolean {
  const pos = ctx.source.pos;
  const m = ctx.move;
  switch (c.c) {
    case 'verticalMoveAtLeast':
      return !!m && m.kind !== 'jump' && m.d[0] === 0 && m.dist >= resolveNum(r, ctx.source.cardId, c.n);
    case 'moveDistanceAtLeast':
      return !!m && m.dist >= resolveNum(r, ctx.source.cardId, c.n);
    case 'forwardMoveAtLeast':
      return !!m && m.kind !== 'jump' && m.d[0] === 0 && m.d[1] > 0 && m.dist >= resolveNum(r, ctx.source.cardId, c.n);
    case 'diagonalMove':
      return !!m && m.kind !== 'jump' && m.d[0] !== 0 && Math.abs(m.d[0]) === Math.abs(m.d[1]);
    case 'verticalMove':
      return !!m && m.kind !== 'jump' && m.d[0] === 0;
    case 'diagonalForwardMove':
      return !!m && m.kind !== 'jump' && m.d[0] !== 0 && Math.abs(m.d[0]) === Math.abs(m.d[1]) && m.d[1] > 0;
    case 'jumpMove':
      return !!m && m.kind === 'jump';
    case 'selfInOwnCamp':
      return !!pos && inOwnCamp(ctx.owner, pos.y);
    case 'selfInEnemyCamp':
      return !!pos && inEnemyCamp(ctx.owner, pos.y);
    case 'selfAdjacentToKing': {
      const k = kingOf(ctx.state, r, ctx.owner);
      return !!pos && !!k?.pos && k.uid !== ctx.source.uid && isAdjacent(r, pos, k.pos);
    }
    case 'victimAround8':
      return !!pos && !!ctx.victimPos && isAround8(pos, ctx.victimPos);
    case 'victimAdjacent':
      return !!pos && !!ctx.victimPos && isAdjacent(r, pos, ctx.victimPos);
    case 'victimKind':
      return !!ctx.victim && r.db.cards[ctx.victim.cardId].piece === c.kind;
    case 'capturerAttribute':
      return !!ctx.capturer && r.db.cards[ctx.capturer.cardId].attribute === c.attr;
    case 'oncePerGame':
      return !ctx.source.onceUsed;
  }
}

export const checkAll = (r: Rules, cs: Condition[], ctx: CondCtx) => cs.every((c) => checkCondition(r, c, ctx));

// ───────── ATK・ダメージ計算 ─────────

/** 今の ATK（基本＋加算 → ％補正） */
export function effectiveAtk(r: Rules, state: GameState, board: BoardMap, p: PieceState): number {
  const card = cardOf(r, p);
  const base = card.atk + p.atkFlat;
  let pct = p.atkPctPerm;
  for (const s of p.statuses) if (s.kind === 'atkPct' && s.remaining > 0) pct += s.value ?? 0;
  if (p.pos) {
    // 自分の能力（コロンブスなど）
    for (const { def, slot } of activePassives(r, state, board, p)) {
      if (def.p === 'atkPct' && def.scope === 'self' && checkAll(r, def.conditions, { source: p, owner: p.owner, state, board })) {
        pct += scaleIfLeader(r, state, p, slot, resolveNum(r, p.cardId, def.pct));
      }
    }
    // 王のリーダー（攻属性 ATK+% など）
    const king = kingOf(state, r, p.owner);
    if (king) {
      for (const { def, slot } of activePassives(r, state, board, king)) {
        if (def.p === 'atkPct' && def.scope !== 'self' && def.scope.attr === card.attribute) {
          pct += scaleIfLeader(r, state, king, slot, resolveNum(r, king.cardId, def.pct));
        }
      }
    }
  }
  return Math.max(0, Math.round(base * (1 + pct / 100)));
}

export function combineReductions(r: Rules, pcts: number[]): number {
  if (pcts.length === 0) return 0;
  if (r.config.reductionStacking === 'multiplicative') {
    return 100 * (1 - pcts.reduce((acc, v) => acc * (1 - Math.min(100, v) / 100), 1));
  }
  return Math.min(r.config.reductionCapPct, pcts.reduce((a, b) => a + b, 0));
}

/** 取られた駒の味方による撃破ダメージ軽減（取られる直前の局面で調べる） */
export function captureReductions(
  r: Rules,
  pre: GameState,
  preBoard: BoardMap,
  victim: PieceState,
): { pct: number; cardId: string }[] {
  const out: { pct: number; cardId: string }[] = [];
  const vpos = victim.pos!;
  for (const a of onBoardPieces(pre)) {
    if (a.owner !== victim.owner) continue;
    // 軽減の能力は、その駒自身が取られたときにも効く
    const isSelf = a.uid === victim.uid;
    for (const { def, slot } of activePassives(r, pre, preBoard, a)) {
      if (def.p !== 'captureReduction') continue;
      if (!checkAll(r, def.conditions, { source: a, owner: a.owner, state: pre, board: preBoard })) continue;
      const apos = a.pos!;
      let inScope = isSelf;
      if (!inScope) switch (def.scope) {
        case 'allAllies':
          inScope = true;
          break;
        case 'alliesInOwnCamp':
          inScope = inOwnCamp(a.owner, vpos.y);
          break;
        case 'diagonalSight':
          inScope = diagonalSightHits(preBoard, apos).some((h) => samePos(h, vpos));
          break;
        case 'sameFileBehind':
          inScope = vpos.x === apos.x && (vpos.y - apos.y) * forward(a.owner) < 0;
          break;
        case 'adjacent':
          inScope = isAdjacent(r, apos, vpos);
          break;
      }
      if (inScope) out.push({ pct: scaleIfLeader(r, pre, a, slot, resolveNum(r, a.cardId, def.pct)), cardId: a.cardId });
    }
  }
  return out;
}

/** 撃破ダメージ増加（カエサルなど）。撃破した駒自身の能力 */
export function captureBonusPct(r: Rules, state: GameState, board: BoardMap, capturer: PieceState, move: MoveInfo): number {
  let pct = 0;
  for (const { def, slot } of activePassives(r, state, board, capturer)) {
    if (def.p !== 'captureBonus') continue;
    if (!checkAll(r, def.conditions, { source: capturer, owner: capturer.owner, state, board, move })) continue;
    pct += scaleIfLeader(r, state, capturer, slot, resolveNum(r, capturer.cardId, def.pct));
  }
  return pct;
}

/** 能力ダメージへのリーダー補正（ツタンカーメン：妨害属性の能力ダメージ+%） */
export function abilityDamageBonusPct(r: Rules, state: GameState, board: BoardMap, owner: Player, sourceCardId: string): number {
  const king = kingOf(state, r, owner);
  if (!king) return 0;
  const attr = r.db.cards[sourceCardId].attribute;
  let pct = 0;
  for (const { def, slot } of activePassives(r, state, board, king)) {
    if (def.p === 'abilityDamagePct' && def.attr === attr) pct += scaleIfLeader(r, state, king, slot, resolveNum(r, king.cardId, def.pct));
  }
  return pct;
}

/** 駒を打つときの自傷ダメージ（消費はしない） */
export function dropSelfDamage(r: Rules, state: GameState, board: BoardMap, player: Player, p: PieceState): number {
  const base = cardOf(r, p).hp;
  let flat = state.players[player].nextDropPenalty;
  let pct = 0;
  for (const e of onBoardPieces(state)) {
    if (e.owner === player) continue;
    for (const { def, slot } of activePassives(r, state, board, e)) {
      if (def.p === 'dropPenaltyFlat') {
        const ref = e.upgraded && def.upgradedAmount !== undefined ? def.upgradedAmount : def.amount;
        flat += scaleIfLeader(r, state, e, slot, resolveNum(r, e.cardId, ref));
      } else if (def.p === 'dropPenaltyPct') {
        pct += scaleIfLeader(r, state, e, slot, resolveNum(r, e.cardId, def.pct));
      }
    }
  }
  return Math.round((base + flat) * (1 + pct / 100));
}
