// かんたんなCPU：自分の手を全部ためし、相手の「取る手」への返しまで読んで点数の高い手を選ぶ
import type { GameState, Move, Player, Rules } from '../engine';
import { applyMove, buildBoard, cardOf, effectiveAtk, legalMoves, onBoardPieces, other, relRank } from '../engine';

export type CpuLevel = 'easy' | 'normal';

function evaluate(r: Rules, s: GameState, me: Player): number {
  if (s.result) return s.result.winner === me ? 1e9 : -1e9;
  const opp = other(me);
  let score = s.players[me].hp - s.players[opp].hp;
  const board = buildBoard(s);
  for (const p of s.pieces) {
    if (p.excluded) continue;
    const sign = p.owner === me ? 1 : -1;
    const card = cardOf(r, p);
    if (p.pos) {
      const atk = effectiveAtk(r, s, board, p);
      score += sign * atk * 0.25;
      if (card.piece !== '王') score += sign * relRank(p.owner, p.pos.y) * 25;
      if (p.promoted) score += sign * 300;
    } else {
      score += sign * card.atk * 0.15;
    }
  }
  // 毒は残りぶんをHPに見込む
  for (const pl of [me, opp] as const) {
    const left = s.players[pl].poisons.reduce((a, po) => a + po.amount * po.remaining, 0);
    score += (pl === me ? -1 : 1) * left;
  }
  return score;
}

function captureMoves(r: Rules, s: GameState): Move[] {
  const board = buildBoard(s);
  return legalMoves(r, s).filter((m) => m.type === 'move' && !!board[m.to.x][m.to.y]);
}

export function chooseMove(r: Rules, s: GameState, level: CpuLevel = 'normal', rand: () => number = Math.random): Move {
  const me = s.turn;
  const moves = legalMoves(r, s);
  if (moves.length === 1) return moves[0];
  let best: Move = moves[0];
  let bestScore = -Infinity;
  const noise = level === 'easy' ? 1500 : 120;
  for (const m of moves) {
    let next: GameState;
    try {
      next = applyMove(r, s, m, { skipLegalCheck: true }).state;
    } catch {
      continue;
    }
    let score: number;
    if (next.result || level === 'easy') {
      score = evaluate(r, next, me);
    } else {
      // 相手の取る手のうち、こちらに一番痛いものを想定
      score = evaluate(r, next, me);
      for (const reply of captureMoves(r, next)) {
        const after = applyMove(r, next, reply, { skipLegalCheck: true }).state;
        score = Math.min(score, evaluate(r, after, me));
        if (score <= -1e9) break;
      }
    }
    score += (rand() - 0.5) * noise;
    if (score > bestScore) {
      bestScore = score;
      best = m;
    }
  }
  return best;
}

/** 盤上に駒が何枚あるか（デバッグ用） */
export const pieceCount = (s: GameState) => onBoardPieces(s).length;
