// 合法手の生成
import type { GameState, Move, PieceState, Player, Pos } from './types';
import { type BoardMap, absVec, buildBoard, handPieces, inEnemyCamp, onBoard, onBoardPieces, other, samePos, FILES, RANKS } from './board';
import {
  type MoveInfo,
  type Rules,
  activePassives,
  canPromote,
  cardOf,
  hasAnyGeometricMove,
  isAdjacent,
  isImmobile,
  isSealed,
  kingOf,
  moveSetOf,
  unpromotedSet,
} from './rules';

export interface Destination extends MoveInfo {
  /** 跳び越えたマス（jump のとき） */
  jumped: Pos[];
}

/** 桂馬の跳びで「跳び越えた」とみなすマス：長い方向の途中にある2マス */
export function jumpedSquares(from: Pos, dx: number, dy: number): Pos[] {
  const out: Pos[] = [];
  if (Math.abs(dy) === 2) {
    out.push({ x: from.x, y: from.y + dy / 2 }, { x: from.x + dx, y: from.y + dy / 2 });
  } else if (Math.abs(dx) === 2) {
    out.push({ x: from.x + dx / 2, y: from.y }, { x: from.x + dx / 2, y: from.y + dy });
  }
  return out.filter((p) => onBoard(p.x, p.y));
}

/** 隣に、横に動けなくする敵（ビスマルク）がいるか */
function horizontallyLocked(r: Rules, state: GameState, board: BoardMap, p: PieceState): boolean {
  for (const e of onBoardPieces(state)) {
    if (e.owner === p.owner || !isAdjacent(r, e.pos!, p.pos!)) continue;
    if (activePassives(r, state, board, e).some(({ def }) => def.p === 'lockHorizontalAdjacentEnemies')) return true;
  }
  return false;
}

/** 盤上の駒が動ける先（入れ替えは含まない） */
export function destinations(
  r: Rules,
  state: GameState,
  board: BoardMap,
  p: PieceState,
  opts: { ignoreImmobile?: boolean } = {},
): Destination[] {
  if (!p.pos) return [];
  if (!opts.ignoreImmobile && isImmobile(p)) return [];
  const from = p.pos;
  const out: Destination[] = [];
  const locked = horizontallyLocked(r, state, board, p);
  const seen = new Set<string>();
  const add = (d: Destination) => {
    const key = `${d.to.x},${d.to.y}`;
    if (seen.has(key)) return; // 同じマスへは最初に見つけた動き方を採用
    seen.add(key);
    out.push(d);
  };
  for (const c of moveSetOf(r, p).comps) {
    if (c.k === 'swapAdjacentAlly' || c.k === 'swapWithKing') continue;
    if (locked && c.d[1] === 0 && c.d[0] !== 0) continue;
    const [ax, ay] = absVec(p.owner, c.d);
    if (c.k === 'step' || c.k === 'jump') {
      const x = from.x + ax;
      const y = from.y + ay;
      if (!onBoard(x, y)) continue;
      const occ = board[x][y];
      if (occ && occ.owner === p.owner) continue;
      add({
        from,
        to: { x, y },
        kind: c.k,
        d: [c.d[0], c.d[1]],
        dist: Math.max(Math.abs(ax), Math.abs(ay)),
        jumped: c.k === 'jump' ? jumpedSquares(from, ax, ay) : [],
      });
    } else {
      const max = c.max ?? 99;
      let jumpsLeft = c.jumpAlly ?? 0;
      for (let n = 1; n <= max; n++) {
        const x = from.x + ax * n;
        const y = from.y + ay * n;
        if (!onBoard(x, y)) break;
        const occ = board[x][y];
        if (occ) {
          if (occ.owner === p.owner) {
            if (jumpsLeft > 0) {
              jumpsLeft--;
              continue;
            }
            break;
          }
          add({ from, to: { x, y }, kind: 'slide', d: [c.d[0], c.d[1]], dist: n, jumped: [] });
          break;
        }
        add({ from, to: { x, y }, kind: 'slide', d: [c.d[0], c.d[1]], dist: n, jumped: [] });
      }
    }
  }
  return out;
}

/** その駒の動きで相手の王のマスを取れるか（王手の判定。行動不能は無視） */
export function attackers(r: Rules, state: GameState, board: BoardMap, attacker: Player, target: Pos): PieceState[] {
  return onBoardPieces(state).filter(
    (p) => p.owner === attacker && destinations(r, state, board, p, { ignoreImmobile: true }).some((d) => samePos(d.to, target)),
  );
}

export function isInCheck(r: Rules, state: GameState, player: Player): boolean {
  const king = kingOf(state, r, player);
  if (!king?.pos) return false;
  return attackers(r, state, buildBoard(state), other(player), king.pos).length > 0;
}

function hasRetreat(r: Rules, state: GameState, board: BoardMap, p: PieceState): boolean {
  return activePassives(r, state, board, p).some(({ def }) => def.p === 'retreatAfterCapture');
}

/** 手番のプレイヤーの合法手（動かせる手が1つもなければ「パス」だけ） */
export function legalMoves(r: Rules, state: GameState): Move[] {
  if (state.result) return [];
  const me = state.turn;
  const board = buildBoard(state);
  const moves: Move[] = [];

  for (const p of onBoardPieces(state)) {
    if (p.owner !== me) continue;
    const from = p.pos!;
    for (const d of destinations(r, state, board, p)) {
      const victim = board[d.to.x][d.to.y];
      let promos: boolean[] = [false];
      if (canPromote(r, p) && (inEnemyCamp(me, from.y) || inEnemyCamp(me, d.to.y))) {
        const mustPromote = !hasAnyGeometricMove(moveSetOf(r, p), me, d.to);
        promos = mustPromote ? [true] : [false, true];
      }
      const retreats: (Pos | undefined)[] = [undefined];
      if (victim && hasRetreat(r, state, board, p)) {
        for (const rel of [
          [-1, -1],
          [1, -1],
        ] as const) {
          const [ax, ay] = absVec(me, rel);
          const t = { x: d.to.x + ax, y: d.to.y + ay };
          if (!onBoard(t.x, t.y)) continue;
          const occ = board[t.x][t.y];
          if (!occ || occ.uid === p.uid) retreats.push(t);
        }
      }
      for (const promote of promos) for (const retreat of retreats) moves.push({ type: 'move', uid: p.uid, from, to: d.to, promote, ...(retreat ? { retreat } : {}) });
    }
    // 入れ替え
    if (!isImmobile(p)) {
      for (const c of moveSetOf(r, p).comps) {
        if (c.k === 'swapAdjacentAlly') {
          for (const a of onBoardPieces(state)) {
            if (a.owner === me && a.uid !== p.uid && !isImmobile(a) && isAdjacent(r, from, a.pos!)) moves.push({ type: 'swap', uid: p.uid, withUid: a.uid });
          }
        } else if (c.k === 'swapWithKing') {
          const k = kingOf(state, r, me);
          if (k && k.uid !== p.uid && !isImmobile(k) && isAdjacent(r, from, k.pos!)) moves.push({ type: 'swap', uid: p.uid, withUid: k.uid });
        }
      }
    }
  }

  // 打つ
  const seenCard = new Set<string>();
  for (const h of handPieces(state, me)) {
    if (isSealed(h)) continue;
    const key = `${h.cardId}`;
    if (seenCard.has(key)) continue; // 同じカードが2枚あっても手は1つで十分
    seenCard.add(key);
    const card = cardOf(r, h);
    const set = unpromotedSet(r, h.cardId);
    for (let x = 0; x < FILES; x++) {
      if (card.piece === '歩') {
        const nifu = onBoardPieces(state).some(
          (q) => q.owner === me && q.pos!.x === x && !q.promoted && r.db.cards[q.cardId].piece === '歩',
        );
        if (nifu) continue;
      }
      for (let y = 0; y < RANKS; y++) {
        if (board[x][y]) continue;
        if (!hasAnyGeometricMove(set, me, { x, y })) continue;
        moves.push({ type: 'drop', uid: h.uid, to: { x, y } });
      }
    }
  }

  let result = moves;
  if (!r.config.allowIgnoringCheck) {
    result = moves.filter((m) => !leavesKingAttacked(r, state, m));
  }
  return result.length > 0 ? result : [{ type: 'pass' }];
}

/** 動かした後に自分の王が取られる形か（能力は考えず、駒の位置だけで判定） */
function leavesKingAttacked(r: Rules, state: GameState, m: Move): boolean {
  const s: GameState = { ...state, pieces: state.pieces.map((p) => ({ ...p })) };
  const me = state.turn;
  if (m.type === 'move') {
    const victim = s.pieces.find((p) => p.pos && samePos(p.pos, m.to));
    if (victim) victim.pos = null;
    const p = s.pieces.find((q) => q.uid === m.uid)!;
    p.pos = m.retreat ?? m.to;
  } else if (m.type === 'drop') {
    s.pieces.find((q) => q.uid === m.uid)!.pos = m.to;
  } else if (m.type === 'swap') {
    const a = s.pieces.find((q) => q.uid === m.uid)!;
    const b = s.pieces.find((q) => q.uid === m.withUid)!;
    [a.pos, b.pos] = [b.pos, a.pos];
  }
  return isInCheck(r, s, me);
}

export function movesEqual(a: Move, b: Move): boolean {
  if (a.type !== b.type) return false;
  if (a.type === 'pass') return true;
  if (a.type === 'move' && b.type === 'move')
    return a.uid === b.uid && samePos(a.to, b.to) && a.promote === b.promote && (a.retreat ? samePos(a.retreat, b.retreat) : !b.retreat);
  if (a.type === 'drop' && b.type === 'drop') return a.uid === b.uid && samePos(a.to, b.to);
  if (a.type === 'swap' && b.type === 'swap') return a.uid === b.uid && a.withUid === b.withUid;
  return false;
}
