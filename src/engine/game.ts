// 局面の作成と、手の適用（能力の発動を含む）
import type { Action, Effect, Target, TriggeredAbility, Trigger } from './abilityTypes';
import type { ApplyResult, GameEvent, GameResult, GameState, Move, PieceState, Player, Pos } from './types';
import { type Party, INITIAL_POSITIONS, SLOTS, partyHp } from './cards';
import {
  type BoardMap,
  absVec,
  buildBoard,
  forward,
  handPieces,
  inEnemyCamp,
  onBoard,
  onBoardPieces,
  other,
  samePos,
} from './board';
import {
  type MoveInfo,
  type Rules,
  type Slot,
  abilityDamageBonusPct,
  activePassives,
  captureBonusPct,
  captureReductions,
  cardOf,
  checkAll,
  combineReductions,
  defsOf,
  dropSelfDamage,
  effectiveAtk,
  isActive,
  isAdjacent,
  isSealed,
  kingOf,
  resolveNum,
  scaleIfLeader,
} from './rules';
import { attackers, destinations, legalMoves, movesEqual } from './movegen';

// ───────── 局面の作成 ─────────

function newPiece(uid: number, cardId: string, owner: Player, pos: Pos): PieceState {
  return {
    uid,
    cardId,
    owner,
    originalOwner: owner,
    promoted: false,
    pos,
    statuses: [],
    atkFlat: 0,
    atkPctPerm: 0,
    upgraded: false,
    onceUsed: false,
    campLeftAt: null,
    excluded: false,
  };
}

export function positionKey(state: GameState): string {
  const board = onBoardPieces(state)
    .map((p) => `${p.pos!.x}${p.pos!.y}${p.cardId}${p.owner}${p.promoted ? 1 : 0}`)
    .sort()
    .join('|');
  const hands = ([0, 1] as const)
    .map((pl) =>
      handPieces(state, pl)
        .map((p) => p.cardId)
        .sort()
        .join(','),
    )
    .join('/');
  return `${state.turn}#${board}#${hands}`;
}

export function createGame(r: Rules, parties: [Party, Party]): ApplyResult {
  const pieces: PieceState[] = [];
  let uid = 1;
  for (const pl of [0, 1] as const) {
    for (const slot of SLOTS) {
      const base = INITIAL_POSITIONS[pl][slot.id];
      const pos = pl === 0 ? { ...base } : { x: 4 - base.x, y: 8 - base.y };
      pieces.push(newPiece(uid++, parties[pl][slot.id], pl, pos));
    }
  }
  const hp0 = partyHp(r.db, parties[0]);
  const hp1 = partyHp(r.db, parties[1]);
  const mkPlayer = (hp: number) => ({ hp, maxHp: hp, poisons: [], nextDropPenalty: 0, captureShields: [], turnCount: 0 });
  const state: GameState = {
    pieces,
    turn: 0,
    ply: 0,
    players: [mkPlayer(hp0), mkPlayer(hp1)],
    history: {},
    result: null,
    nextUid: uid,
  };
  state.history[positionKey(state)] = 1;
  const R = new Resolver(r, state, structuredClone(state));
  R.startTurn(0);
  return { state, events: R.events };
}

// ───────── 能力の解決 ─────────

interface FireCtx {
  /** 能力の持ち主（取られた駒は取られる前の持ち主） */
  owner: Player;
  move?: MoveInfo;
  jumped?: Pos[];
  victim?: PieceState;
  victimPos?: Pos;
  capturer?: PieceState;
  checkers?: PieceState[];
}

type Targets = { player: Player; pieces?: undefined } | { pieces: PieceState[]; player?: undefined };

/** 能力の対象を選ぶ必要があるとき（UI がプレイヤーに選ばせる） */
export interface ChoiceRequest {
  /** この手の中で何番目の選択か（Move.choices の添字） */
  index: number;
  sourceUid: number;
  cardId: string;
  /** 選ぶプレイヤー */
  chooser: Player;
  kind: 'board' | 'hand';
  candidates: number[];
  prompt: string;
}

export class ChoiceNeeded extends Error {
  constructor(public request: ChoiceRequest) {
    super('choice needed');
  }
}

function effectVerb(effects: Effect[]): string {
  const v: Record<string, string> = {
    immobile: '行動不能にする',
    seal: '封印する',
    push: '押し出す',
    excludeHand: '除外する',
    damage: 'ダメージを与える',
  };
  const words = effects.map((e) => v[e.e]).filter(Boolean);
  return words.length ? words.join('・') : '';
}

class Resolver {
  events: GameEvent[] = [];
  preBoard: BoardMap;
  choiceIdx = 0;

  constructor(
    public r: Rules,
    public st: GameState,
    public pre: GameState,
    public choices: number[] = [],
    public probe = false,
  ) {
    this.preBoard = buildBoard(pre);
  }

  get board(): BoardMap {
    return buildBoard(this.st);
  }

  piece(uid: number): PieceState {
    const p = this.st.pieces.find((q) => q.uid === uid);
    if (!p) throw new Error(`駒 ${uid} が見つかりません`);
    return p;
  }

  emit(e: GameEvent) {
    this.events.push(e);
  }

  damage(player: Player, amount: number, sourceCardId: string | undefined, reason: string, at?: Pos | null) {
    const v = Math.round(amount);
    if (v <= 0) return;
    this.st.players[player].hp -= v;
    this.emit({ t: 'damage', player, amount: v, sourceCardId, reason, at: at ? { ...at } : null });
  }

  heal(player: Player, amount: number, sourceCardId: string | undefined, reason: string) {
    const pl = this.st.players[player];
    let v = Math.round(amount);
    if (this.r.config.healCapAtMaxHp) v = Math.min(v, Math.max(0, pl.maxHp - pl.hp));
    if (v <= 0) {
      this.emit({ t: 'heal', player, amount: 0, sourceCardId, reason });
      return;
    }
    pl.hp += v;
    this.emit({ t: 'heal', player, amount: v, sourceCardId, reason });
  }

  addStatus(p: PieceState, kind: 'immobile' | 'seal' | 'atkPct', turns: number, value: number | undefined, sourceCardId: string) {
    if (turns <= 0) return;
    p.statuses.push({ kind, remaining: turns, skip: p.owner === this.st.turn, value, sourceCardId });
    this.emit({ t: 'status', uid: p.uid, cardId: p.cardId, status: kind, turns, value, pos: p.pos ? { ...p.pos } : null });
  }

  /**
   * 駒の能力を発動させる。
   * evalIn = 'pre' なら、発動できるか・条件を満たすかを「手を指す前の局面」で調べる
   * （取られた駒や、その周りの駒の能力）。
   */
  fire(source: PieceState, trigger: Trigger, ctx: FireCtx, evalIn: 'pre' | 'st' = 'st') {
    const S = evalIn === 'pre' ? this.pre : this.st;
    const B = evalIn === 'pre' ? this.preBoard : this.board;
    const src = S.pieces.find((q) => q.uid === source.uid) ?? source;
    for (const slot of ['ability', 'special'] as const) {
      const defs = defsOf(this.r, src, slot).filter((d): d is TriggeredAbility => d.type === 'triggered' && d.trigger === trigger);
      if (defs.length === 0) continue;
      if (!isActive(this.r, S, B, src, slot)) continue;
      for (const def of defs) {
        const ok = checkAll(this.r, def.conditions, {
          source: src,
          owner: ctx.owner,
          state: S,
          board: B,
          move: ctx.move,
          victim: ctx.victim,
          victimPos: ctx.victimPos,
          capturer: ctx.capturer,
        });
        if (!ok) continue;
        const live = this.st.pieces.find((q) => q.uid === src.uid)!;
        const origin = live.pos ?? src.pos;
        this.exec(live, slot, def, ctx, origin);
      }
    }
  }

  private exec(src: PieceState, slot: Slot, def: TriggeredAbility, ctx: FireCtx, origin: Pos | null) {
    const card = cardOf(this.r, src);
    if (def.conditions.some((c) => c.c === 'oncePerGame')) src.onceUsed = true;
    this.emit({
      t: 'ability',
      uid: src.uid,
      cardId: src.cardId,
      player: ctx.owner,
      kind: slot === 'ability' ? 'ability' : card.special.type,
      text: (slot === 'ability' ? card.ability : card.special.text) ?? '',
      pos: origin ? { ...origin } : null,
    });
    for (const action of def.actions) this.execAction(src, slot, action, ctx, origin);
  }

  private num(src: PieceState, slot: Slot, ref: Parameters<typeof resolveNum>[2], scale: boolean): number {
    const v = resolveNum(this.r, src.cardId, ref);
    return scale ? scaleIfLeader(this.r, this.st, src, slot, v) : v;
  }

  /**
   * 対象を1体選ぶ。候補が2体以上なら、手（Move）の choices に書かれた順に使う。
   * 書かれていなければ、probe のときは ChoiceNeeded を投げ、本番では自動で選ぶ（CPU用）。
   */
  private choose(
    cands: PieceState[],
    auto: (l: PieceState[]) => PieceState[],
    info: { src: PieceState; owner: Player; action: Action; kind: 'board' | 'hand' },
  ): PieceState[] {
    if (cands.length <= 1) return cands;
    const idx = this.choiceIdx++;
    const given = this.choices[idx];
    const hit = cands.find((c) => c.uid === given);
    if (hit) return [hit];
    if (this.probe) {
      const card = cardOf(this.r, info.src);
      throw new ChoiceNeeded({
        index: idx,
        sourceUid: info.src.uid,
        cardId: info.src.cardId,
        chooser: info.owner,
        kind: info.kind,
        candidates: cands.map((c) => c.uid),
        prompt: `${card.name}：${effectVerb(info.action.effects)}${info.kind === 'hand' ? '相手の持ち駒' : '敵'}を選んでください`,
      });
    }
    return auto(cands);
  }

  private pickStrongest(list: PieceState[]): PieceState[] {
    if (list.length === 0) return [];
    const board = this.board;
    const scored = list.map((p) => ({ p, atk: effectiveAtk(this.r, this.st, board, p) }));
    scored.sort((a, b) => b.atk - a.atk || a.p.uid - b.p.uid);
    return [scored[0].p];
  }

  private pickHand(list: PieceState[]): PieceState[] {
    if (list.length === 0) return [];
    const sorted = [...list].sort((a, b) => {
      const ca = cardOf(this.r, a);
      const cb = cardOf(this.r, b);
      return Number(isSealed(a)) - Number(isSealed(b)) || cb.cost - ca.cost || cb.atk - ca.atk || a.uid - b.uid;
    });
    return [sorted[0]];
  }

  private canPush(p: PieceState, board: BoardMap): boolean {
    if (!p.pos) return false;
    const y = p.pos.y - forward(p.owner);
    return onBoard(p.pos.x, y) && !board[p.pos.x][y];
  }

  private targets(action: Action, src: PieceState, owner: Player, origin: Pos | null, ctx: FireCtx): Targets {
    const t: Target = action.target;
    const st = this.st;
    const pick = (cands: PieceState[], auto: (l: PieceState[]) => PieceState[], kind: 'board' | 'hand') =>
      this.choose(cands, auto, { src, owner, action, kind });
    const enemies = onBoardPieces(st).filter((p) => p.owner !== owner);
    const o = origin;
    switch (t) {
      case 'opponent':
        return { player: other(owner) };
      case 'self':
        return { player: owner };
      case 'thisPiece':
        return { pieces: [] }; // exec 側で src を使う（下の execAction 参照）
      case 'capturer':
        return { pieces: ctx.capturer ? [this.piece(ctx.capturer.uid)] : [] };
      case 'adjacentEnemyOne':
        return { pieces: o ? pick(enemies.filter((e) => isAdjacent(this.r, o, e.pos!)), (l) => this.pickStrongest(l), 'board') : [] };
      case 'adjacentEnemyAll':
        return { pieces: o ? enemies.filter((e) => isAdjacent(this.r, o, e.pos!)) : [] };
      case 'adjacentEnemyPushable': {
        if (!o) return { pieces: [] };
        const cands = enemies.filter((e) => isAdjacent(this.r, o, e.pos!));
        const board = this.board;
        const pushable = cands.filter((e) => this.canPush(e, board));
        return { pieces: pick(cands, () => this.pickStrongest(pushable.length ? pushable : cands), 'board') };
      }
      case 'sameFileEnemyOne':
        return { pieces: o ? pick(enemies.filter((e) => e.pos!.x === o.x), (l) => this.pickStrongest(l), 'board') : [] };
      case 'sameFileEnemyAll':
        return { pieces: o ? enemies.filter((e) => e.pos!.x === o.x) : [] };
      case 'sameFileNearestEnemy': {
        if (!o) return { pieces: [] };
        const f = forward(owner);
        const list = enemies
          .filter((e) => e.pos!.x === o.x)
          .sort((a, b) => Math.abs(a.pos!.y - o.y) - Math.abs(b.pos!.y - o.y) || (b.pos!.y - o.y) * f - (a.pos!.y - o.y) * f);
        return { pieces: list.slice(0, 1) };
      }
      case 'sameFileOrRankEnemyAll':
        return { pieces: o ? enemies.filter((e) => e.pos!.x === o.x || e.pos!.y === o.y) : [] };
      case 'forwardNearestEnemy': {
        if (!o) return { pieces: [] };
        const f = forward(owner);
        const list = enemies
          .filter((e) => e.pos!.x === o.x && (e.pos!.y - o.y) * f > 0)
          .sort((a, b) => Math.abs(a.pos!.y - o.y) - Math.abs(b.pos!.y - o.y));
        return { pieces: list.slice(0, 1) };
      }
      case 'beyondCapturedFirstEnemy': {
        const m = ctx.move;
        if (!m) return { pieces: [] };
        const [dx, dy] = absVec(owner, [Math.sign(m.d[0]), Math.sign(m.d[1])]);
        const board = this.board;
        for (let x = m.to.x + dx, y = m.to.y + dy; onBoard(x, y); x += dx, y += dy) {
          const q = board[x][y];
          if (q && q.owner !== owner) return { pieces: [q] };
        }
        return { pieces: [] };
      }
      case 'jumpedEnemies': {
        const board = this.board;
        const list = (ctx.jumped ?? []).map((p) => board[p.x][p.y]).filter((q): q is PieceState => !!q && q.owner !== owner);
        return { pieces: list };
      }
      case 'passedDiagonalEnemies': {
        const m = ctx.move;
        if (!m) return { pieces: [] };
        const [dx, dy] = absVec(owner, [Math.sign(m.d[0]), Math.sign(m.d[1])]);
        const line: PieceState[] = [];
        const board = this.board;
        for (const s of [1, -1]) {
          for (let x = m.from.x + dx * s, y = m.from.y + dy * s; onBoard(x, y); x += dx * s, y += dy * s) {
            const q = board[x][y];
            if (q && q.owner !== owner) line.push(q);
          }
        }
        return { pieces: line };
      }
      case 'checkers':
        return { pieces: (ctx.checkers ?? []).map((c) => this.piece(c.uid)).filter((p) => !!p.pos) };
      case 'opponentHandOne':
        return { pieces: pick(handPieces(st, other(owner)), (l) => this.pickHand(l), 'hand') };
      case 'opponentHandAll':
        return { pieces: handPieces(st, other(owner)) };
    }
  }

  private execAction(src: PieceState, slot: Slot, action: Action, ctx: FireCtx, origin: Pos | null) {
    const owner = ctx.owner;
    let tg = this.targets(action, src, owner, origin, ctx);
    if (action.target === 'thisPiece') tg = { pieces: src.pos ? [src] : [] };
    for (const eff of action.effects) this.execEffect(src, slot, eff, tg, owner);
  }

  private execEffect(src: PieceState, slot: Slot, eff: Effect, tg: Targets, owner: Player) {
    const sourceCardId = src.cardId;
    const abilityDmg = (v: number) => {
      const pct = abilityDamageBonusPct(this.r, this.st, this.board, owner, sourceCardId);
      return v * (1 + pct / 100);
    };
    switch (eff.e) {
      case 'damage': {
        const v = abilityDmg(this.num(src, slot, eff.amount, true));
        if (tg.player !== undefined) this.damage(tg.player, v, sourceCardId, '能力');
        else for (const p of tg.pieces) this.damage(p.owner, v, sourceCardId, '能力', p.pos);
        return;
      }
      case 'heal': {
        const v = this.num(src, slot, eff.amount, true);
        if (tg.player !== undefined) this.heal(tg.player, v, sourceCardId, '能力');
        return;
      }
      case 'immobile':
      case 'seal': {
        const turns = this.num(src, slot, eff.turns, false);
        for (const p of tg.pieces ?? []) this.addStatus(p, eff.e, turns, undefined, sourceCardId);
        return;
      }
      case 'poison': {
        if (tg.player === undefined) return;
        const amount = this.num(src, slot, eff.amount, true);
        const times = this.num(src, slot, eff.times, false);
        const pl = this.st.players[tg.player];
        if (this.r.config.poisonStacking === 'refresh') pl.poisons = [];
        pl.poisons.push({ amount, remaining: times, sourceCardId, from: owner });
        this.emit({ t: 'poison', player: tg.player, amount, times, sourceCardId });
        return;
      }
      case 'push': {
        for (const p of tg.pieces ?? []) {
          const board = this.board;
          const from = { ...p.pos! };
          if (this.canPush(p, board)) {
            p.pos = { x: from.x, y: from.y - forward(p.owner) };
            this.emit({ t: 'push', uid: p.uid, cardId: p.cardId, from, to: { ...p.pos } });
            this.positionChanged(p, from, 'push');
          } else {
            this.emit({ t: 'push', uid: p.uid, cardId: p.cardId, from, to: null });
          }
        }
        return;
      }
      case 'atkPct': {
        const pct = this.num(src, slot, eff.pct, true) * eff.sign;
        for (const p of tg.pieces ?? []) {
          if (eff.turns !== undefined) {
            this.addStatus(p, 'atkPct', this.num(src, slot, eff.turns, false), pct, sourceCardId);
          } else {
            p.atkPctPerm += pct;
            this.emit({ t: 'statusPerm', uid: p.uid, cardId: p.cardId, text: `ATK${pct >= 0 ? '+' : ''}${pct}%`, pos: p.pos ? { ...p.pos } : null });
          }
        }
        return;
      }
      case 'atkFlat': {
        const v = this.num(src, slot, eff.amount, true);
        for (const p of tg.pieces ?? []) {
          p.atkFlat += v;
          this.emit({ t: 'statusPerm', uid: p.uid, cardId: p.cardId, text: `ATK+${v}`, pos: p.pos ? { ...p.pos } : null });
        }
        return;
      }
      case 'nextDropPenalty': {
        if (tg.player === undefined) return;
        const v = this.num(src, slot, eff.amount, true);
        this.st.players[tg.player].nextDropPenalty += v;
        this.emit({ t: 'dropPenalty', player: tg.player, amount: v, sourceCardId });
        return;
      }
      case 'captureShield': {
        if (tg.player === undefined) return;
        const v = this.num(src, slot, eff.pct, true);
        this.st.players[tg.player].captureShields.push(v);
        this.emit({ t: 'shield', player: tg.player, pct: v, sourceCardId });
        return;
      }
      case 'excludeHand': {
        for (const p of tg.pieces ?? []) {
          p.excluded = true;
          this.emit({ t: 'exclude', uid: p.uid, cardId: p.cardId, player: p.owner });
        }
        return;
      }
      case 'upgrade': {
        for (const p of tg.pieces ?? []) {
          p.upgraded = true;
          this.emit({ t: 'statusPerm', uid: p.uid, cardId: p.cardId, text: '能力強化', pos: p.pos ? { ...p.pos } : null });
        }
        return;
      }
    }
  }

  /** 駒の位置が変わったあとの処理（金の敵陣効果） */
  positionChanged(p: PieceState, oldPos: Pos | null, cause: 'move' | 'push' | 'drop') {
    const owner = p.owner;
    const wasIn = !!oldPos && inEnemyCamp(owner, oldPos.y);
    const nowIn = !!p.pos && inEnemyCamp(owner, p.pos.y);
    const turnCount = this.st.players[owner].turnCount;
    if (wasIn && !nowIn) p.campLeftAt = turnCount;
    if (!wasIn && nowIn) {
      if (cause === 'push') return;
      if (cause === 'drop' && !this.r.config.dropTriggersEnemyCamp) return;
      if (cardOf(this.r, p).special.type !== 'enemy_camp') return;
      if (p.campLeftAt !== null && turnCount - p.campLeftAt < this.r.config.enemyCampCooldownTurns) return;
      this.fire(p, 'onEnterEnemyCamp', { owner });
    }
  }

  /** 手番開始時の処理（毒・手番開始時の能力） */
  startTurn(player: Player) {
    const st = this.st;
    const pl = st.players[player];
    pl.turnCount++;
    this.emit({ t: 'turnStart', player, turnCount: pl.turnCount });
    // 毒
    for (const po of pl.poisons) {
      const pct = abilityDamageBonusPct(this.r, st, this.board, po.from, po.sourceCardId);
      this.damage(player, po.amount * (1 + pct / 100), po.sourceCardId, '毒');
      po.remaining--;
    }
    pl.poisons = pl.poisons.filter((p) => p.remaining > 0);
    // 手番開始時の能力
    for (const p of onBoardPieces(st)) if (p.owner === player) this.fire(p, 'onTurnStart', { owner: player });
    if (!st.result && pl.hp <= 0) {
      this.finish({ winner: other(player), reason: 'hp', detail: `${player === 0 ? '先手' : '後手'}のHPが0になった` });
    }
  }

  /** 手番の終わり：持ち主の手番で数える状態を1減らす */
  endTurn(player: Player) {
    for (const p of this.st.pieces) {
      if (p.owner !== player || p.statuses.length === 0) continue;
      p.statuses = p.statuses
        .map((s) => (s.skip ? { ...s, skip: false } : { ...s, remaining: s.remaining - 1 }))
        .filter((s) => s.remaining > 0);
    }
  }

  finish(result: GameResult) {
    if (this.st.result) return;
    this.st.result = result;
    this.emit({ t: 'gameOver', result });
  }
}

function resetToHand(p: PieceState, newOwner: Player) {
  p.owner = newOwner;
  p.pos = null;
  p.promoted = false;
  p.statuses = [];
  p.atkFlat = 0;
  p.atkPctPerm = 0;
  p.upgraded = false;
  p.onceUsed = false;
  p.campLeftAt = null;
}

const sideName = (p: Player) => (p === 0 ? '先手' : '後手');

// ───────── 手の適用 ─────────

/**
 * この手を指すと、能力の対象を選ぶ必要があるか。
 * 必要なら最初の未選択のぶんを返す。選んだら move.choices に uid を足して、もう一度呼ぶ。
 */
export function nextChoice(r: Rules, state: GameState, move: Move): ChoiceRequest | null {
  try {
    applyMove(r, state, move, { skipLegalCheck: true, probe: true });
    return null;
  } catch (e) {
    if (e instanceof ChoiceNeeded) return e.request;
    throw e;
  }
}

export function applyMove(
  r: Rules,
  state: GameState,
  move: Move,
  opts: { skipLegalCheck?: boolean; probe?: boolean } = {},
): ApplyResult {
  if (state.result) throw new Error('対局は終わっています');
  if (!opts.skipLegalCheck && !legalMoves(r, state).some((m) => movesEqual(m, move))) {
    throw new Error('合法手ではありません: ' + JSON.stringify(move));
  }
  const pre = structuredClone(state);
  const st = structuredClone(state);
  const R = new Resolver(r, st, pre, move.type === 'pass' ? [] : (move.choices ?? []), !!opts.probe);
  const me = st.turn;
  const opp = other(me);
  let kingCaptured = false;

  if (move.type === 'move') {
    const mover = R.piece(move.uid);
    const preMover = pre.pieces.find((p) => p.uid === move.uid)!;
    const dest = destinations(r, pre, R.preBoard, preMover).find((d) => samePos(d.to, move.to));
    if (!dest) throw new Error('動けないマスです');
    const info: MoveInfo = { from: dest.from, to: dest.to, kind: dest.kind, d: dest.d, dist: dest.dist };
    const victim = st.pieces.find((p) => p.pos && samePos(p.pos, move.to) && p.uid !== mover.uid);
    R.emit({ t: 'move', uid: mover.uid, cardId: mover.cardId, player: me, from: { ...move.from }, to: { ...move.to } });

    if (victim) {
      const victimPre = pre.pieces.find((p) => p.uid === victim.uid)!;
      const victimPos = { ...move.to };
      victim.pos = null;
      mover.pos = { ...move.to };
      // 1. 撃破ダメージ
      const board = R.board;
      const atk = effectiveAtk(r, st, board, mover);
      const bonusPct = captureBonusPct(r, st, board, mover, info);
      const reds = captureReductions(r, pre, R.preBoard, victimPre).map((x) => x.pct);
      const shield = st.players[opp].captureShields.shift();
      if (shield !== undefined) reds.push(shield);
      const reductionPct = combineReductions(r, reds);
      const damage = Math.round(atk * (1 + bonusPct / 100) * (1 - reductionPct / 100));
      R.emit({
        t: 'capture',
        capturerUid: mover.uid,
        victimUid: victim.uid,
        capturerCardId: mover.cardId,
        victimCardId: victim.cardId,
        player: me,
        pos: victimPos,
        atk,
        bonusPct,
        reductionPct,
        damage,
      });
      R.damage(opp, damage, mover.cardId, '撃破ダメージ', victimPos);
      if (cardOf(r, victim).piece === '王') kingCaptured = true;
      resetToHand(victim, me);
      const capCtx = { victim: victimPre, victimPos, capturer: mover };
      // 2. 取った駒の能力 → リーダー（味方が撃破したとき）
      R.fire(mover, 'onCapture', { owner: me, move: info, ...capCtx });
      const king = kingOf(st, r, me);
      if (king) R.fire(king, 'onAllyCapture', { owner: me, move: info, ...capCtx });
      // 3. 取られた駒の【罠】（取られる前の局面で発動できるか判定）
      R.fire(victimPre, 'onCaptured', { owner: opp, ...capCtx }, 'pre');
      // 4. 周りの駒の能力
      for (const a of onBoardPieces(pre)) {
        if (a.owner === opp && a.uid !== victim.uid) R.fire(a, 'onAllyCaptured', { owner: opp, ...capCtx }, 'pre');
      }
    } else {
      mover.pos = { ...move.to };
    }
    // 5. 動いたときの能力（跳び越え・斜線）
    R.fire(mover, 'onMove', { owner: me, move: info, jumped: dest.jumped });
    // 6. 成り・覚醒
    if (move.promote) {
      mover.promoted = true;
      R.emit({ t: 'promote', uid: mover.uid, cardId: mover.cardId, player: me, pos: { ...mover.pos! } });
      R.fire(mover, 'onPromote', { owner: me, move: info });
    }
    // 7. 敵陣効果
    R.positionChanged(mover, move.from, 'move');
    // 8. ヒット＆アウェイ
    if (move.retreat && mover.pos) {
      const board = R.board;
      const canRetreat = activePassives(r, st, board, mover).some(({ def }) => def.p === 'retreatAfterCapture');
      if (canRetreat && !board[move.retreat.x][move.retreat.y]) {
        const from = { ...mover.pos };
        mover.pos = { ...move.retreat };
        R.emit({ t: 'retreat', uid: mover.uid, from, to: { ...move.retreat } });
        R.positionChanged(mover, from, 'move');
      }
    }
  } else if (move.type === 'drop') {
    const p = R.piece(move.uid);
    const selfDamage = dropSelfDamage(r, st, R.board, me, p);
    st.players[me].nextDropPenalty = 0;
    p.pos = { ...move.to };
    p.promoted = false;
    R.emit({ t: 'drop', uid: p.uid, cardId: p.cardId, player: me, to: { ...move.to }, selfDamage });
    R.damage(me, selfDamage, p.cardId, '自傷ダメージ', move.to);
    R.positionChanged(p, null, 'drop');
  } else if (move.type === 'swap') {
    const a = R.piece(move.uid);
    const b = R.piece(move.withUid);
    const pa = { ...a.pos! };
    const pb = { ...b.pos! };
    a.pos = pb;
    b.pos = pa;
    R.emit({ t: 'swap', uid: a.uid, withUid: b.uid, player: me, a: pa, b: pb });
    R.positionChanged(a, pa, 'move');
    R.positionChanged(b, pb, 'move');
  } else {
    R.emit({ t: 'pass', player: me });
  }

  // 王手（クレオパトラ）
  if (!kingCaptured) {
    const oppKing = kingOf(st, r, opp);
    if (oppKing?.pos) {
      const checkers = attackers(r, st, R.board, me, oppKing.pos);
      if (checkers.length > 0) {
        R.emit({ t: 'check', player: opp });
        R.fire(oppKing, 'onChecked', { owner: opp, checkers });
      }
    }
  }

  // 勝敗
  if (kingCaptured) {
    R.finish({ winner: me, reason: 'king', detail: `${sideName(me)}が王を取った` });
  } else {
    const meZero = st.players[me].hp <= 0;
    const oppZero = st.players[opp].hp <= 0;
    if (meZero && oppZero) {
      const loser = r.config.simultaneousZeroLoser === 'mover' ? me : opp;
      R.finish({ winner: other(loser), reason: 'hp', detail: `両者のHPが同時に0になった（${sideName(loser)}の負け）` });
    } else if (oppZero) {
      R.finish({ winner: me, reason: 'hp', detail: `${sideName(opp)}のHPが0になった` });
    } else if (meZero) {
      R.finish({ winner: opp, reason: 'hp', detail: `${sideName(me)}のHPが0になった` });
    }
  }

  if (!st.result) {
    R.endTurn(me);
    st.turn = opp;
    st.ply++;
    const key = positionKey(st);
    st.history[key] = (st.history[key] ?? 0) + 1;
    if (st.history[key] >= r.config.repetitionCount) {
      const ratio = (p: Player) => st.players[p].hp / st.players[p].maxHp;
      const r0 = ratio(0);
      const r1 = ratio(1);
      const winner: Player = r0 > r1 ? 0 : r1 > r0 ? 1 : r.config.repetitionTieWinner;
      R.finish({
        winner,
        reason: 'repetition',
        detail: `千日手（HP残り 先手${Math.round(r0 * 100)}%・後手${Math.round(r1 * 100)}%）`,
      });
    } else {
      R.startTurn(opp);
    }
  }
  return { state: st, events: R.events };
}

/** 投了 */
export function resign(state: GameState, player: Player): ApplyResult {
  const st = structuredClone(state);
  const result: GameResult = { winner: other(player), reason: 'resign', detail: `${sideName(player)}が投了した` };
  st.result = result;
  return { state: st, events: [{ t: 'gameOver', result }] };
}
