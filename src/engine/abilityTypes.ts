// 能力の構造化データの型。
// 能力テキスト（日本語）を「トリガー・条件・対象・効果」に分けて表す。
import type { Attribute, PieceKind } from './types';

/**
 * 数値の参照。数値はバランス調整で変わるので、カードの能力テキストから読む。
 * { src: 'a', i: 0 } = ability テキストに出てくる0番目の数字
 * { src: 's', i: 1 } = special.text に出てくる1番目の数字
 * 普通の number も書ける（テキストに数字が出てこないとき）。
 */
export type NumRef = number | { src: 'a' | 's'; i: number };

export type Trigger =
  | 'onCapture' // この駒が撃破したとき
  | 'onCaptured' // この駒が取られたとき（【罠】など）
  | 'onAllyCaptured' // 味方が取られたとき（周りの駒の能力）
  | 'onAllyCapture' // 味方が撃破したとき（リーダー）
  | 'onPromote' // 成ったとき（【覚醒】）
  | 'onEnterEnemyCamp' // 敵陣に入ったとき（【敵陣】）
  | 'onTurnStart' // 自分の手番開始時
  | 'onMove' // この駒が動いたとき
  | 'onChecked'; // 王手をかけられたとき

export type Condition =
  | { c: 'verticalMoveAtLeast'; n: NumRef } // 縦にNマス以上動いた
  | { c: 'moveDistanceAtLeast'; n: NumRef } // Nマス以上動いた
  | { c: 'forwardMoveAtLeast'; n: NumRef } // 前にNマス以上進んだ
  | { c: 'diagonalMove' } // 斜めに動いた
  | { c: 'verticalMove' } // 縦に動いた
  | { c: 'diagonalForwardMove' } // 斜め前に動いた
  | { c: 'jumpMove' } // 跳んだ（桂馬の跳び）
  | { c: 'selfInOwnCamp' } // この駒が自陣にいる
  | { c: 'selfInEnemyCamp' } // この駒が敵陣にいる
  | { c: 'selfAdjacentToKing' } // この駒が王の隣にいる
  | { c: 'victimAround8' } // 取られた味方がこの駒の周り8マスにいた
  | { c: 'victimAdjacent' } // 取られた味方がこの駒の隣にいた
  | { c: 'victimKind'; kind: PieceKind } // 取られた味方の駒の種類
  | { c: 'capturerAttribute'; attr: Attribute } // 撃破した味方の属性
  | { c: 'oncePerGame' }; // 1試合1回

export type Target =
  | 'opponent' // 相手プレイヤー
  | 'self' // 自分プレイヤー
  | 'thisPiece' // この駒
  | 'capturer' // この駒を取った駒
  | 'adjacentEnemyOne' // 隣の敵1体
  | 'adjacentEnemyAll' // 隣の敵すべて
  | 'adjacentEnemyPushable' // 隣の敵1体（押し出せる駒を優先）
  | 'sameFileEnemyOne' // 同じ筋の敵1体
  | 'sameFileEnemyAll' // 同じ筋の敵すべて
  | 'sameFileNearestEnemy' // 同じ筋で一番近い敵1体
  | 'sameFileOrRankEnemyAll' // 同じ筋・同じ段の敵すべて
  | 'forwardNearestEnemy' // 前方で一番近い敵1体
  | 'beyondCapturedFirstEnemy' // 取ったマスの、動いた方向のさらに先にいる最初の敵
  | 'jumpedEnemies' // 跳び越えた敵
  | 'passedDiagonalEnemies' // 動いた斜線上の敵
  | 'checkers' // 王手をかけた駒
  | 'opponentHandOne' // 相手の持ち駒1枚
  | 'opponentHandAll'; // 相手の持ち駒すべて

export type Effect =
  | { e: 'damage'; amount: NumRef } // 対象が駒なら1体につき
  | { e: 'heal'; amount: NumRef }
  | { e: 'immobile'; turns: NumRef }
  | { e: 'seal'; turns: NumRef }
  | { e: 'poison'; amount: NumRef; times: NumRef }
  | { e: 'push' }
  | { e: 'atkPct'; pct: NumRef; sign: 1 | -1; turns?: NumRef } // turns なし = 永続
  | { e: 'atkFlat'; amount: NumRef }
  | { e: 'nextDropPenalty'; amount: NumRef }
  | { e: 'captureShield'; pct: NumRef }
  | { e: 'excludeHand' }
  | { e: 'upgrade' };

export interface Action {
  target: Target;
  effects: Effect[];
}

export interface TriggeredAbility {
  type: 'triggered';
  trigger: Trigger;
  conditions: Condition[];
  actions: Action[];
}

/** 撃破ダメージ軽減がかかる範囲 */
export type ReductionScope =
  | 'allAllies' // 味方すべて
  | 'alliesInOwnCamp' // 自陣内の味方
  | 'diagonalSight' // この駒の斜めの利きにいる味方
  | 'sameFileBehind' // 同じ筋でこの駒より後ろにいる味方
  | 'adjacent'; // 隣の味方

export type PassiveAbility =
  | { type: 'passive'; p: 'captureReduction'; pct: NumRef; scope: ReductionScope; conditions: Condition[] }
  | { type: 'passive'; p: 'captureBonus'; pct: NumRef; conditions: Condition[] }
  | { type: 'passive'; p: 'atkPct'; pct: NumRef; scope: 'self' | { attr: Attribute }; conditions: Condition[] }
  | { type: 'passive'; p: 'dropPenaltyFlat'; amount: NumRef; upgradedAmount?: NumRef }
  | { type: 'passive'; p: 'dropPenaltyPct'; pct: NumRef }
  | { type: 'passive'; p: 'abilityDamagePct'; pct: NumRef; attr: Attribute }
  | { type: 'passive'; p: 'lockHorizontalAdjacentEnemies' }
  | { type: 'passive'; p: 'disableAbilitiesInVerticalSight' }
  | { type: 'passive'; p: 'retreatAfterCapture' };

export type AbilityDef = TriggeredAbility | PassiveAbility;

export interface CardAbilities {
  /** カードの ability テキストを構造化したもの */
  ability: AbilityDef[];
  /** special.text（リーダー・覚醒・敵陣）を構造化したもの */
  special: AbilityDef[];
  /** 解釈についてのメモ（レビュー用） */
  notes?: string[];
}
