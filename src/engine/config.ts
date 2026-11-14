// ルール設定。GAME_SPEC.md 10章「未決定事項」と、能力テキストの解釈で決めきれない点はここで切り替える。
// 数値はバランス調整で変わるので、エンジンの中に直接書かずここから読む。

export interface GameConfig {
  /** 千日手：同じ局面が何回出たら終わりか */
  repetitionCount: number;
  /** 王手放置を許す（true＝将棋と違い王手を放置する手も指せる） */
  allowIgnoringCheck: boolean;
  /** 回復は初期パーティHPを超えない */
  healCapAtMaxHp: boolean;
  /** 金の敵陣効果：敵陣を出てから何手番たてば再発動するか */
  enemyCampCooldownTurns: number;
  /** パーティのコスト上限 */
  costCap: number;
  /** 同じカードを2枚以上編成できるか */
  allowDuplicateCards: boolean;
  /** リーダー倍率：王の段（持ち主から見た1〜9段）ごとの倍率 */
  leaderMultiplier: { maxRank: number; mult: number }[];
  /** 「隣」の範囲。eight = 周り8マス、four = 前後左右4マス */
  adjacency: 'eight' | 'four';
  /** 撃破ダメージ軽減を複数重ねたときの計算。additive = 足し算、multiplicative = かけ算 */
  reductionStacking: 'additive' | 'multiplicative';
  /** 撃破ダメージ軽減の上限％（足し算のとき） */
  reductionCapPct: number;
  /** 毒を重ねがけしたとき。stack = 別々に効く、refresh = 新しいもので上書き */
  poisonStacking: 'stack' | 'refresh';
  /** 封印されている駒・王手の利きに入った駒はリーダー／覚醒／敵陣効果も止まるか */
  sealBlocksSpecial: boolean;
  /** 駒を打って敵陣に置いたとき、金の敵陣効果を発動するか */
  dropTriggersEnemyCamp: boolean;
  /** 両者のHPが同時に0以下になったとき、負けになる側。mover = 手番を指した側 */
  simultaneousZeroLoser: 'mover' | 'waiting';
  /** 千日手でHPの残り割合が同じとき勝つ側（0 = 先手、1 = 後手） */
  repetitionTieWinner: 0 | 1;
}

export const DEFAULT_CONFIG: GameConfig = {
  repetitionCount: 4,
  allowIgnoringCheck: true,
  healCapAtMaxHp: true,
  enemyCampCooldownTurns: 2,
  costCap: 40,
  allowDuplicateCards: false,
  leaderMultiplier: [
    { maxRank: 1, mult: 1.0 },
    { maxRank: 3, mult: 1.3 },
    { maxRank: 6, mult: 1.7 },
    { maxRank: 9, mult: 2.5 },
  ],
  adjacency: 'four',
  reductionStacking: 'multiplicative',
  reductionCapPct: 80,
  poisonStacking: 'stack',
  sealBlocksSpecial: true,
  dropTriggersEnemyCamp: false,
  simultaneousZeroLoser: 'mover',
  repetitionTieWinner: 1,
};

export function makeConfig(overrides: Partial<GameConfig> = {}): GameConfig {
  return { ...DEFAULT_CONFIG, ...overrides };
}
