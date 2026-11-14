// イベント → ログの文章
import type { GameEvent, Rules } from '../engine';
import { posLabel } from '../engine';

export interface LogLine {
  id: number;
  text: string;
  tone: 'normal' | 'damage' | 'heal' | 'ability' | 'system';
  player?: 0 | 1;
}

const side = (p: 0 | 1) => (p === 0 ? '先手' : '後手');

export function eventToLog(r: Rules, ev: GameEvent): Omit<LogLine, 'id'> | null {
  const name = (id: string) => r.db.cards[id]?.name ?? id;
  switch (ev.t) {
    case 'turnStart':
      return { text: `── ${side(ev.player)} ${ev.turnCount}手番目 ──`, tone: 'system', player: ev.player };
    case 'move':
      return { text: `${side(ev.player)}：${name(ev.cardId)} ${posLabel(ev.from)}→${posLabel(ev.to)}`, tone: 'normal', player: ev.player };
    case 'drop':
      return { text: `${side(ev.player)}：${name(ev.cardId)}を${posLabel(ev.to)}に打つ`, tone: 'normal', player: ev.player };
    case 'swap':
      return { text: `${side(ev.player)}：${posLabel(ev.a)}と${posLabel(ev.b)}を入れ替え`, tone: 'normal', player: ev.player };
    case 'capture': {
      const mods = [ev.bonusPct ? `+${Math.round(ev.bonusPct)}%` : '', ev.reductionPct ? `−${Math.round(ev.reductionPct)}%` : ''].filter(Boolean).join(' ');
      return {
        text: `${name(ev.capturerCardId)}が${name(ev.victimCardId)}を撃破（ATK${ev.atk}${mods ? ' ' + mods : ''}）`,
        tone: 'damage',
        player: ev.player,
      };
    }
    case 'damage':
      return { text: `${side(ev.player)}に${ev.amount}ダメージ（${ev.reason}${ev.sourceCardId ? '・' + name(ev.sourceCardId) : ''}）`, tone: 'damage', player: ev.player };
    case 'heal':
      return { text: `${side(ev.player)}のHPが${ev.amount}回復（${ev.sourceCardId ? name(ev.sourceCardId) : ev.reason}）`, tone: 'heal', player: ev.player };
    case 'promote':
      return { text: `${name(ev.cardId)}が成った`, tone: 'ability', player: ev.player };
    case 'ability': {
      const label = { ability: '能力', awakening: '覚醒', enemy_camp: '敵陣', leader: 'リーダー' }[ev.kind];
      return { text: `【${label}】${name(ev.cardId)}：${ev.text}`, tone: 'ability', player: ev.player };
    }
    case 'status': {
      const what = ev.status === 'immobile' ? '行動不能' : ev.status === 'seal' ? '封印' : `ATK${(ev.value ?? 0) > 0 ? '+' : ''}${ev.value}%`;
      return { text: `${name(ev.cardId)}が${what}（${ev.turns}手番）${ev.pos ? '' : '（持ち駒）'}`, tone: 'ability' };
    }
    case 'statusPerm':
      return { text: `${name(ev.cardId)}：${ev.text}`, tone: 'ability' };
    case 'push':
      return { text: ev.to ? `${name(ev.cardId)}を${posLabel(ev.to)}へ押し出した` : `${name(ev.cardId)}は押し出せなかった`, tone: 'ability' };
    case 'poison':
      return { text: `${side(ev.player)}に毒（${ev.amount}×${ev.times}回）`, tone: 'ability', player: ev.player };
    case 'dropPenalty':
      return { text: `${side(ev.player)}が次に打つときの自傷ダメージ+${ev.amount}`, tone: 'ability', player: ev.player };
    case 'shield':
      return { text: `${side(ev.player)}：次に受ける撃破ダメージ−${ev.pct}%`, tone: 'ability', player: ev.player };
    case 'exclude':
      return { text: `${name(ev.cardId)}が除外された`, tone: 'ability' };
    case 'retreat':
      return { text: `ヒット＆アウェイ：${posLabel(ev.from)}→${posLabel(ev.to)}`, tone: 'normal' };
    case 'check':
      return { text: `王手！（${side(ev.player)}の王）`, tone: 'damage', player: ev.player };
    case 'pass':
      return { text: `${side(ev.player)}は動かせる駒がなくパス`, tone: 'system', player: ev.player };
    case 'gameOver':
      return { text: `対局終了：${side(ev.result.winner)}の勝ち（${ev.result.detail}）`, tone: 'system' };
  }
}
