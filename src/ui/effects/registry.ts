// ─────────────────────────────────────────────
// エフェクト（演出）の登録場所
//
// エンジンは手を指すたびに「起きたこと」（GameEvent）の列を返す。
// 画面はそれを1つずつ再生し、ここで決めた演出を出す。
//
// ・全体の演出を変えたい      → DEFAULT_EFFECTS を書き換える
// ・特定のカードだけ変えたい  → CARD_EFFECTS[カードID] に同じ形で書く（DEFAULT より優先）
//
// 演出の部品（VisualEffect）は types.ts、見た目は EffectLayer.tsx と styles.css にある。
// ─────────────────────────────────────────────
import type { GameEvent } from '../../engine';
import type { EffectStep } from './types';
import { displayText } from '../attributes';

export interface EffectEnv {
  cardName: (cardId: string) => string;
  sideName: (p: 0 | 1) => string;
}

type EventOf<T extends GameEvent['t']> = Extract<GameEvent, { t: T }>;
export type EventEffectFn<T extends GameEvent['t']> = (ev: EventOf<T>, env: EffectEnv) => EffectStep | null;
export type EffectTable = { [K in GameEvent['t']]?: EventEffectFn<K> };

const COLOR = {
  damage: '#ff5d5d',
  heal: '#5dffa0',
  ability: '#ffd45d',
  awakening: '#ff9d3d',
  enemyCamp: '#5dc8ff',
  leader: '#e0a0ff',
  status: '#c58cff',
  info: '#ffffff',
};

const KIND_LABEL = { ability: '能力', awakening: '覚醒', enemy_camp: '敵陣', leader: 'リーダー' } as const;
const KIND_COLOR = { ability: COLOR.ability, awakening: COLOR.awakening, enemy_camp: COLOR.enemyCamp, leader: COLOR.leader } as const;

export const DEFAULT_EFFECTS: EffectTable = {
  move: () => ({ effects: [], duration: 120 }),
  drop: (ev) => ({
    effects: [{ kind: 'flash', square: ev.to, color: '#ffffff' }],
    duration: 200,
  }),
  capture: (ev) => ({
    effects: [
      { kind: 'flash', square: ev.pos, color: COLOR.damage },
      { kind: 'float', text: '撃破！', color: '#ffffff', at: { square: ev.pos }, size: 'md' },
    ],
    duration: 300,
  }),
  damage: (ev) => ({
    effects: [
      { kind: 'float', text: `-${ev.amount}`, color: COLOR.damage, at: { hp: ev.player }, size: ev.amount >= 3000 ? 'lg' : 'md' },
      ...(ev.at ? [{ kind: 'float' as const, text: `-${ev.amount}`, color: COLOR.damage, at: { square: ev.at }, size: 'sm' as const }] : []),
      ...(ev.amount >= 4000 ? [{ kind: 'shake' as const }] : []),
    ],
    duration: 420,
  }),
  heal: (ev) =>
    ev.amount > 0
      ? { effects: [{ kind: 'float', text: `+${ev.amount}`, color: COLOR.heal, at: { hp: ev.player }, size: 'md' }], duration: 380 }
      : { effects: [{ kind: 'float', text: 'HP満タン', color: COLOR.heal, at: { hp: ev.player }, size: 'sm' }], duration: 200 },
  promote: (ev) => ({
    effects: [
      { kind: 'flash', square: ev.pos, color: COLOR.awakening },
      { kind: 'float', text: '成り！', color: COLOR.awakening, at: { square: ev.pos }, size: 'md' },
    ],
    duration: 300,
  }),
  ability: (ev, env) => ({
    effects: [
      { kind: 'banner', title: `【${KIND_LABEL[ev.kind]}】${env.cardName(ev.cardId)}`, text: displayText(ev.text), color: KIND_COLOR[ev.kind] },
      ...(ev.pos ? [{ kind: 'flash' as const, square: ev.pos, color: KIND_COLOR[ev.kind] }] : []),
    ],
    duration: 650,
  }),
  status: (ev) =>
    ev.pos
      ? {
          effects: [
            {
              kind: 'float',
              text: ev.status === 'immobile' ? `行動不能${ev.turns}` : ev.status === 'seal' ? `封印${ev.turns}` : `ATK${(ev.value ?? 0) > 0 ? '+' : ''}${ev.value}%`,
              color: COLOR.status,
              at: { square: ev.pos },
              size: 'sm',
            },
          ],
          duration: 300,
        }
      : { effects: [], duration: 150 },
  statusPerm: (ev) =>
    ev.pos ? { effects: [{ kind: 'float', text: ev.text, color: COLOR.ability, at: { square: ev.pos }, size: 'sm' }], duration: 300 } : null,
  push: (ev) =>
    ev.to
      ? { effects: [{ kind: 'flash', square: ev.to, color: COLOR.status }], duration: 250 }
      : { effects: [{ kind: 'float', text: '動かない', color: COLOR.info, at: { square: ev.from }, size: 'sm' }], duration: 200 },
  poison: (ev) => ({
    effects: [{ kind: 'float', text: `毒 ${ev.amount}×${ev.times}`, color: COLOR.status, at: { hp: ev.player }, size: 'sm' }],
    duration: 300,
  }),
  dropPenalty: (ev) => ({
    effects: [{ kind: 'float', text: `次の自傷+${ev.amount}`, color: COLOR.status, at: { hp: ev.player }, size: 'sm' }],
    duration: 300,
  }),
  shield: (ev) => ({
    effects: [{ kind: 'float', text: `軽減${ev.pct}%`, color: COLOR.heal, at: { hp: ev.player }, size: 'sm' }],
    duration: 300,
  }),
  exclude: (ev, env) => ({
    effects: [{ kind: 'banner', title: '除外', text: `${env.cardName(ev.cardId)} は盤に戻らない`, color: COLOR.status }],
    duration: 500,
  }),
  check: (ev, env) => ({
    effects: [{ kind: 'banner', title: '王手！', text: `${env.sideName(ev.player)}の王が狙われている`, color: COLOR.damage }],
    duration: 500,
  }),
  retreat: () => ({ effects: [], duration: 150 }),
  gameOver: () => null,
};

/** カードごとの演出（DEFAULT_EFFECTS より優先）。例：
 *   rook_01: { promote: (ev) => ({ effects: [...], duration: 800 }) },
 */
export const CARD_EFFECTS: Record<string, EffectTable> = {};

function cardIdOf(ev: GameEvent): string | undefined {
  if ('cardId' in ev) return ev.cardId;
  if ('capturerCardId' in ev) return ev.capturerCardId;
  if ('sourceCardId' in ev) return ev.sourceCardId;
  return undefined;
}

export function stepFor(ev: GameEvent, env: EffectEnv): EffectStep | null {
  const cardId = cardIdOf(ev);
  const table = (cardId && CARD_EFFECTS[cardId]) || undefined;
  const fn = (table?.[ev.t] ?? DEFAULT_EFFECTS[ev.t]) as EventEffectFn<typeof ev.t> | undefined;
  return fn ? fn(ev as never, env) : null;
}
