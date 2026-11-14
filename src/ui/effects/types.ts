// 演出の部品
import type { Player, Pos } from '../../engine';

/** 演出を出す場所 */
export type Anchor = { square: Pos } | { hp: Player } | { center: true };

export type VisualEffect =
  /** ふわっと浮かんで消える文字（ダメージ数値など） */
  | { kind: 'float'; text: string; color: string; at: Anchor; size?: 'sm' | 'md' | 'lg' }
  /** 画面上部に出る帯（能力発動など） */
  | { kind: 'banner'; title: string; text?: string; color: string }
  /** マスが光る */
  | { kind: 'flash'; square: Pos; color: string }
  /** 盤が揺れる */
  | { kind: 'shake' };

/** 1つのイベントに対する演出。duration は次のイベントに進むまでの待ち時間（ミリ秒） */
export interface EffectStep {
  effects: VisualEffect[];
  duration: number;
}
