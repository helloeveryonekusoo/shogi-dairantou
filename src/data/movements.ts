// 駒の動きの定義データ。
// カードの move_before / move_after テキストを、この形に置き換えている。
// 向きは「その駒の持ち主から見て」：dx > 0 が右、dy > 0 が前。

export type Vec = readonly [number, number];

export type MoveComponent =
  /** 1マス（またはそのベクトルぶん）動く。間に駒があっても関係ない位置にしか使わない */
  | { k: 'step'; d: Vec }
  /** その方向に何マスでも（max まで）。jumpAlly = 味方を何枚まで飛び越えられるか */
  | { k: 'slide'; d: Vec; max?: number; jumpAlly?: number }
  /** 跳ぶ（桂馬の跳び）。間の駒は関係ない */
  | { k: 'jump'; d: Vec }
  /** 移動の代わりに、隣の味方と位置を入れ替える */
  | { k: 'swapAdjacentAlly' }
  /** 王の隣にいるとき、移動の代わりに王と位置を入れ替える */
  | { k: 'swapWithKing' };

export interface MoveSet {
  /** 表示用の名前 */
  label: string;
  comps: MoveComponent[];
}

const F: Vec = [0, 1];
const B: Vec = [0, -1];
const L: Vec = [-1, 0];
const R: Vec = [1, 0];
const FL: Vec = [-1, 1];
const FR: Vec = [1, 1];
const BL: Vec = [-1, -1];
const BR: Vec = [1, -1];

const steps = (...ds: Vec[]): MoveComponent[] => ds.map((d) => ({ k: 'step' as const, d }));
const slides = (...ds: Vec[]): MoveComponent[] => ds.map((d) => ({ k: 'slide' as const, d }));
const jumps = (...ds: Vec[]): MoveComponent[] => ds.map((d) => ({ k: 'jump' as const, d }));

const KNIGHT_F: Vec[] = [
  [-1, 2],
  [1, 2],
];
const KNIGHT_B: Vec[] = [
  [-1, -2],
  [1, -2],
];
const KNIGHT_ALL: Vec[] = [
  [-1, 2],
  [1, 2],
  [-1, -2],
  [1, -2],
  [-2, 1],
  [2, 1],
  [-2, -1],
  [2, -1],
];

export const STD = {
  king: { label: '王の動き', comps: steps(F, B, L, R, FL, FR, BL, BR) },
  gold: { label: '金の動き', comps: steps(F, B, L, R, FL, FR) },
  silver: { label: '銀の動き', comps: steps(F, FL, FR, BL, BR) },
  knight: { label: '桂の動き', comps: jumps(...KNIGHT_F) },
  lance: { label: '香の動き', comps: slides(F) },
  pawn: { label: '歩の動き', comps: steps(F) },
  rook: { label: '飛の動き', comps: slides(F, B, L, R) },
  bishop: { label: '角の動き', comps: slides(FL, FR, BL, BR) },
  dragon: { label: '竜の動き', comps: [...slides(F, B, L, R), ...steps(FL, FR, BL, BR)] },
  horse: { label: '馬の動き', comps: [...slides(FL, FR, BL, BR), ...steps(F, B, L, R)] },
} satisfies Record<string, MoveSet>;

/** 成った後の標準（将棋どおり）。null = 成らない */
export const STD_PROMOTED: Record<string, MoveSet | null> = {
  王: null,
  金: null,
  飛: STD.dragon,
  角: STD.horse,
  銀: { label: '成銀（金の動き）', comps: STD.gold.comps },
  桂: { label: '成桂（金の動き）', comps: STD.gold.comps },
  香: { label: '成香（金の動き）', comps: STD.gold.comps },
  歩: { label: 'と金（金の動き）', comps: STD.gold.comps },
};

export const STD_UNPROMOTED: Record<string, MoveSet> = {
  王: STD.king,
  飛: STD.rook,
  角: STD.bishop,
  金: STD.gold,
  銀: STD.silver,
  桂: STD.knight,
  香: STD.lance,
  歩: STD.pawn,
};

/**
 * 「将棋どおり」以外の動きを持つカード。
 * before / after を書いていないものは将棋どおり。after: null は「成らない」。
 */
export const CARD_MOVES: Record<string, { before?: MoveSet; after?: MoveSet | null }> = {
  king_01: {
    before: { label: '王の動き＋隣の味方と入れ替え', comps: [...STD.king.comps, { k: 'swapAdjacentAlly' }] },
  },
  rook_01: {
    after: {
      label: '竜の動き＋縦横で味方を1枚飛び越え',
      comps: [
        { k: 'slide', d: F, jumpAlly: 1 },
        { k: 'slide', d: B, jumpAlly: 1 },
        { k: 'slide', d: L, jumpAlly: 1 },
        { k: 'slide', d: R, jumpAlly: 1 },
        ...steps(FL, FR, BL, BR),
      ],
    },
  },
  rook_03: {
    before: {
      label: '飛の動き（横は2マスまで）',
      comps: [...slides(F, B), { k: 'slide', d: L, max: 2 }, { k: 'slide', d: R, max: 2 }],
    },
  },
  bishop_01: {
    before: { label: '角の動き＋前に1マス', comps: [...STD.bishop.comps, ...steps(F)] },
    after: { label: '斜めに何マスでも＋前後に桂馬の跳び', comps: [...STD.bishop.comps, ...jumps(...KNIGHT_F, ...KNIGHT_B)] },
  },
  gold_01: {
    before: { label: '金の動き＋王と入れ替え', comps: [...STD.gold.comps, { k: 'swapWithKing' }] },
  },
  gold_04: {
    before: { label: '金の動き＋後ろ斜め（王の動き）', comps: STD.king.comps },
  },
  silver_01: {
    after: { label: '銀の動き＋横1マス', comps: [...STD.silver.comps, ...steps(L, R)] },
  },
  silver_04: {
    after: { label: '銀の動き（変わらない）', comps: STD.silver.comps },
  },
  knight_01: {
    before: { label: '桂馬の跳び（前・後ろ）', comps: jumps(...KNIGHT_F, ...KNIGHT_B) },
    after: { label: '8方向に桂馬の跳び', comps: jumps(...KNIGHT_ALL) },
  },
  lance_01: {
    before: { label: '香の動き＋後ろに1マス', comps: [...slides(F), ...steps(B)] },
    after: { label: '前に何マスでも＋横1マス', comps: [...slides(F), ...steps(L, R)] },
  },
  lance_02: {
    after: { label: '王の動き', comps: STD.king.comps },
  },
  pawn_01: {
    before: { label: '前・横に1マス', comps: steps(F, L, R) },
    after: { label: '王の動き', comps: STD.king.comps },
  },
  pawn_04: {
    before: { label: '前・後ろに1マス', comps: steps(F, B) },
  },
  pawn_08: {
    before: { label: '前に1〜2マス', comps: [{ k: 'slide', d: F, max: 2 }] },
    after: { label: '香の動き', comps: slides(F) },
  },
  pawn_11: {
    before: { label: '前・斜め前に1マス', comps: steps(F, FL, FR) },
  },
  pawn_15: {
    before: { label: '前・斜め前に1マス', comps: steps(F, FL, FR) },
    after: { label: '金の動き＋前に桂馬の跳び', comps: [...STD.gold.comps, ...jumps(...KNIGHT_F)] },
  },
};
