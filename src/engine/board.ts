// 盤の座標まわりの小さな関数
import type { GameState, PieceState, Player, Pos } from './types';

export const FILES = 5;
export const RANKS = 9;

export const onBoard = (x: number, y: number) => x >= 0 && x < FILES && y >= 0 && y < RANKS;
export const samePos = (a: Pos | null | undefined, b: Pos | null | undefined) =>
  !!a && !!b && a.x === b.x && a.y === b.y;

/** 持ち主から見た段（1〜9） */
export const relRank = (p: Player, y: number) => (p === 0 ? y + 1 : RANKS - y);
export const inEnemyCamp = (p: Player, y: number) => relRank(p, y) >= 7;
export const inOwnCamp = (p: Player, y: number) => relRank(p, y) <= 3;
/** 前方向（絶対座標の y の増え方） */
export const forward = (p: Player) => (p === 0 ? 1 : -1);
/** 持ち主から見たベクトル → 盤上の絶対ベクトル */
export const absVec = (p: Player, d: readonly [number, number]): [number, number] =>
  p === 0 ? [d[0], d[1]] : [-d[0], -d[1]];

export const other = (p: Player): Player => (p === 0 ? 1 : 0);

/** 盤上の駒を引くためのマップ */
export type BoardMap = (PieceState | null)[][]; // [x][y]

export function buildBoard(state: GameState): BoardMap {
  const b: BoardMap = Array.from({ length: FILES }, () => Array<PieceState | null>(RANKS).fill(null));
  for (const p of state.pieces) if (p.pos && !p.excluded) b[p.pos.x][p.pos.y] = p;
  return b;
}

export function pieceAt(state: GameState, pos: Pos): PieceState | undefined {
  return state.pieces.find((p) => p.pos && p.pos.x === pos.x && p.pos.y === pos.y);
}

export const onBoardPieces = (state: GameState) => state.pieces.filter((p) => p.pos !== null && !p.excluded);
export const handPieces = (state: GameState, player: Player) =>
  state.pieces.filter((p) => p.pos === null && !p.excluded && p.owner === player);

export const chebyshev = (a: Pos, b: Pos) => Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
export const isAround8 = (a: Pos, b: Pos) => chebyshev(a, b) === 1;
export const isOrthAdjacent = (a: Pos, b: Pos) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y) === 1;

/** 座標の表示（先手から見た筋・段。例：3筋5段 → "3-5"） */
export const posLabel = (p: Pos) => `${p.x + 1}${['一', '二', '三', '四', '五', '六', '七', '八', '九'][p.y]}`;
