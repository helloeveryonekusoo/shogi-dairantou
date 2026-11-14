// 将棋大乱闘 ルールエンジンの型定義（UIに依存しない）

export type Player = 0 | 1; // 0 = 先手, 1 = 後手
export type PieceKind = '王' | '飛' | '角' | '金' | '銀' | '桂' | '香' | '歩';
export type Attribute = '守' | '攻' | '妨害';
export type Rarity = 'S' | 'A' | 'B';
export type SpecialType = 'leader' | 'awakening' | 'enemy_camp';

/** cards_v0.1.json の1枚分 */
export interface CardData {
  id: string;
  piece: PieceKind;
  name: string;
  rarity: Rarity;
  attribute: Attribute;
  cost: number;
  hp: number;
  atk: number;
  ability: string | null;
  special: { type: SpecialType; text: string };
  move_before: string;
  move_after: string;
}

export interface CardDB {
  version: string;
  cards: Record<string, CardData>;
  list: CardData[];
}

/** 盤上の座標。x = 0..4（先手から見て左が0）、y = 0..8（先手の1段目が0） */
export interface Pos {
  x: number;
  y: number;
}

/** 時間制限つきの状態（行動不能・封印・ATK増減）。持ち主の手番の終わりに1減る */
export interface TimedStatus {
  kind: 'immobile' | 'seal' | 'atkPct';
  remaining: number;
  /** 持ち主の手番中にかかった場合、その手番の終わりには減らさない */
  skip: boolean;
  value?: number; // atkPct の％
  sourceCardId?: string;
}

export interface PieceState {
  uid: number;
  cardId: string;
  /** 今この駒を使っているプレイヤー */
  owner: Player;
  /** もともとこのカードを編成していたプレイヤー（表示用） */
  originalOwner: Player;
  promoted: boolean;
  /** null = 持ち駒 */
  pos: Pos | null;
  statuses: TimedStatus[];
  /** 永続のATK加算（スパルタクスなど） */
  atkFlat: number;
  /** 永続のATK％（ニュートンなど） */
  atkPctPerm: number;
  /** 覚醒で能力が強化された（メディチ） */
  upgraded: boolean;
  /** 1試合1回の能力を使ったか（クレオパトラ） */
  onceUsed: boolean;
  /** 金の敵陣効果：最後に敵陣を出たときの持ち主の手番数 */
  campLeftAt: number | null;
  /** 除外された（盤に戻らない） */
  excluded: boolean;
}

export interface Poison {
  amount: number;
  remaining: number;
  sourceCardId: string;
  /** 毒をかけた側 */
  from: Player;
}

export interface PlayerState {
  hp: number;
  maxHp: number;
  /** このプレイヤーの手番開始時にダメージを受ける毒 */
  poisons: Poison[];
  /** 次に駒を打つときの自傷ダメージ加算（マキャヴェッリ） */
  nextDropPenalty: number;
  /** 次に受ける撃破ダメージの軽減％（ファーブル）。1回で消える */
  captureShields: number[];
  /** このプレイヤーの手番が何回始まったか */
  turnCount: number;
}

export type GameResultReason = 'king' | 'hp' | 'repetition' | 'resign';
export interface GameResult {
  winner: Player;
  reason: GameResultReason;
  detail: string;
}

export interface GameState {
  pieces: PieceState[];
  turn: Player;
  ply: number;
  players: [PlayerState, PlayerState];
  /** 局面キー → 出現回数（千日手判定） */
  history: Record<string, number>;
  result: GameResult | null;
  nextUid: number;
}

/** 手 */
export type Move =
  | {
      type: 'move';
      uid: number;
      from: Pos;
      to: Pos;
      promote: boolean;
      /** ダルタニャン：撃破した後に下がるマス */
      retreat?: Pos;
      /** 能力の対象として選んだ駒の uid（選ぶ必要が出た順） */
      choices?: number[];
    }
  | { type: 'drop'; uid: number; to: Pos; choices?: number[] }
  | { type: 'swap'; uid: number; withUid: number; choices?: number[] }
  /** 動かせる駒が1つもないとき */
  | { type: 'pass' };

/** 盤面で起きたこと。UI のログ・エフェクトはこれを元に作る */
export type GameEvent =
  | { t: 'turnStart'; player: Player; turnCount: number }
  | { t: 'move'; uid: number; cardId: string; player: Player; from: Pos; to: Pos }
  | { t: 'drop'; uid: number; cardId: string; player: Player; to: Pos; selfDamage: number }
  | { t: 'swap'; uid: number; withUid: number; player: Player; a: Pos; b: Pos }
  | {
      t: 'capture';
      capturerUid: number;
      victimUid: number;
      capturerCardId: string;
      victimCardId: string;
      player: Player;
      pos: Pos;
      atk: number;
      bonusPct: number;
      reductionPct: number;
      damage: number;
    }
  | { t: 'promote'; uid: number; cardId: string; player: Player; pos: Pos }
  | {
      t: 'ability';
      uid: number;
      cardId: string;
      player: Player;
      kind: 'ability' | 'awakening' | 'enemy_camp' | 'leader';
      text: string;
      pos: Pos | null;
    }
  | { t: 'damage'; player: Player; amount: number; sourceCardId?: string; reason: string; at?: Pos | null }
  | { t: 'heal'; player: Player; amount: number; sourceCardId?: string; reason: string }
  | { t: 'status'; uid: number; cardId: string; status: 'immobile' | 'seal' | 'atkPct'; turns: number; value?: number; pos: Pos | null }
  | { t: 'statusPerm'; uid: number; cardId: string; text: string; pos: Pos | null }
  | { t: 'push'; uid: number; cardId: string; from: Pos; to: Pos | null }
  | { t: 'poison'; player: Player; amount: number; times: number; sourceCardId: string }
  | { t: 'dropPenalty'; player: Player; amount: number; sourceCardId: string }
  | { t: 'shield'; player: Player; pct: number; sourceCardId: string }
  | { t: 'exclude'; uid: number; cardId: string; player: Player }
  | { t: 'retreat'; uid: number; from: Pos; to: Pos }
  | { t: 'check'; player: Player }
  | { t: 'pass'; player: Player }
  | { t: 'gameOver'; result: GameResult };

export interface ApplyResult {
  state: GameState;
  events: GameEvent[];
}
