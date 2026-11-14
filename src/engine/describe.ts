// 構造化した能力データを、日本語の文章に戻す（レビュー・カード詳細の「解釈」表示用）
import type { AbilityDef, Condition, Effect, NumRef, Target, Trigger } from './abilityTypes';
import { type Rules, resolveNum } from './rules';

const TRIGGER: Record<Trigger, string> = {
  onCapture: 'この駒が撃破したとき',
  onCaptured: 'この駒が取られたとき',
  onAllyCaptured: '味方が取られたとき',
  onAllyCapture: '味方が撃破したとき',
  onPromote: '成ったとき',
  onEnterEnemyCamp: '敵陣に入ったとき',
  onTurnStart: '自分の手番開始時',
  onMove: 'この駒が動いたとき',
  onChecked: '王手をかけられたとき',
};

const TARGET: Record<Target, string> = {
  opponent: '相手',
  self: '自分',
  thisPiece: 'この駒',
  capturer: '取った駒',
  adjacentEnemyOne: '隣の敵1体（指した人が選ぶ）',
  adjacentEnemyAll: '隣の敵すべて',
  adjacentEnemyPushable: '隣の敵1体（指した人が選ぶ）',
  sameFileEnemyOne: '同じ筋の敵1体（指した人が選ぶ）',
  sameFileEnemyAll: '同じ筋の敵すべて',
  sameFileNearestEnemy: '同じ筋で一番近い敵1体',
  sameFileOrRankEnemyAll: '同じ筋・同じ段の敵すべて',
  forwardNearestEnemy: '同じ筋の前方で一番近い敵1体',
  beyondCapturedFirstEnemy: '取ったマスから同じ向きのさらに先にいる最初の敵1体',
  jumpedEnemies: '跳び越えた敵',
  passedDiagonalEnemies: '動いた斜線上の敵すべて',
  checkers: '王手をかけた駒',
  opponentHandOne: '相手の持ち駒1枚（指した人が選ぶ）',
  opponentHandAll: '相手の持ち駒すべて',
};

const SCOPE: Record<string, string> = {
  allAllies: '味方すべて',
  alliesInOwnCamp: '自陣内の味方',
  diagonalSight: 'この駒の斜めの利きにいる味方',
  sameFileBehind: '同じ筋でこの駒より後ろにいる味方',
  adjacent: '隣の味方',
};

export function describeAbility(r: Rules, cardId: string, def: AbilityDef, isLeader = false): string {
  const n = (ref: NumRef) => resolveNum(r, cardId, ref);
  const lead = isLeader ? '×リーダー倍率' : '';
  const cond = (c: Condition): string => {
    switch (c.c) {
      case 'verticalMoveAtLeast':
        return `縦に${n(c.n)}マス以上動いた`;
      case 'moveDistanceAtLeast':
        return `${n(c.n)}マス以上動いた`;
      case 'forwardMoveAtLeast':
        return `前に${n(c.n)}マス以上進んだ`;
      case 'diagonalMove':
        return '斜めに動いた';
      case 'verticalMove':
        return '縦に動いた';
      case 'diagonalForwardMove':
        return '斜め前に動いた';
      case 'jumpMove':
        return '桂馬の跳びで動いた';
      case 'selfInOwnCamp':
        return 'この駒が自陣にいる';
      case 'selfInEnemyCamp':
        return 'この駒が敵陣にいる';
      case 'selfAdjacentToKing':
        return 'この駒が王の隣にいる';
      case 'victimAround8':
        return '取られた味方がこの駒の周り8マスにいた';
      case 'victimAdjacent':
        return '取られた味方がこの駒の隣にいた';
      case 'victimKind':
        return `取られた味方が${c.kind}`;
      case 'capturerAttribute':
        return `撃破した駒が${c.attr}属性`;
      case 'oncePerGame':
        return '1試合1回';
    }
  };
  const eff = (e: Effect): string => {
    switch (e.e) {
      case 'damage':
        return `${n(e.amount)}${lead}ダメージ`;
      case 'heal':
        return `HP${n(e.amount)}${lead}回復`;
      case 'immobile':
        return `${n(e.turns)}手番 行動不能`;
      case 'seal':
        return `${n(e.turns)}手番 封印`;
      case 'poison':
        return `毒（相手の手番開始時に${n(e.amount)}ダメージ×${n(e.times)}回）`;
      case 'push':
        return '1マス後ろへ押し出す';
      case 'atkPct':
        return `ATK${e.sign > 0 ? '+' : '−'}${n(e.pct)}%${e.turns !== undefined ? `（${n(e.turns)}手番）` : '（ずっと）'}`;
      case 'atkFlat':
        return `ATK+${n(e.amount)}（重なる）`;
      case 'nextDropPenalty':
        return `次に駒を打つときの自傷ダメージ+${n(e.amount)}`;
      case 'captureShield':
        return `次に受ける撃破ダメージ−${n(e.pct)}%（1回）`;
      case 'excludeHand':
        return '除外（盤に戻らない）';
      case 'upgrade':
        return '能力が強化される';
    }
  };
  if (def.type === 'triggered') {
    const head = TRIGGER[def.trigger] + (def.conditions.length ? `（条件：${def.conditions.map(cond).join('・')}）` : '');
    const body = def.actions
      .map((a) => {
        const effs = a.effects.map(eff).join('＋');
        if (a.target === 'opponent' || a.target === 'self') return `${TARGET[a.target]}に${effs}`;
        const per = a.effects.some((e) => e.e === 'damage') ? '（1体につき）' : '';
        return `${TARGET[a.target]}に${effs}${per}`;
      })
      .join('、');
    return `${head} → ${body}`;
  }
  const conds = 'conditions' in def && def.conditions.length ? `（条件：${def.conditions.map(cond).join('・')}）` : '';
  switch (def.p) {
    case 'captureReduction':
      return `常時${conds}：${def.scope === 'allAllies' ? '味方すべて（この駒自身も）' : `この駒自身と${SCOPE[def.scope]}`}が取られたときの撃破ダメージ−${n(def.pct)}%${lead}`;
    case 'captureBonus':
      return `常時${conds}：この駒の撃破ダメージ+${n(def.pct)}%`;
    case 'atkPct':
      return `常時${conds}：${def.scope === 'self' ? 'この駒' : `${def.scope.attr}属性の味方`}のATK+${n(def.pct)}%${lead}`;
    case 'dropPenaltyFlat':
      return `常時（盤上にいる間）：相手が駒を打つときの自傷ダメージ+${n(def.amount)}${def.upgradedAmount !== undefined ? `（強化後は+${n(def.upgradedAmount)}）` : ''}`;
    case 'dropPenaltyPct':
      return `常時：相手が駒を打つときの自傷ダメージ+${n(def.pct)}%${lead}`;
    case 'abilityDamagePct':
      return `常時：${def.attr}属性の能力によるダメージ+${n(def.pct)}%${lead}`;
    case 'lockHorizontalAdjacentEnemies':
      return '常時：隣の敵は横に動けない';
    case 'disableAbilitiesInVerticalSight':
      return '常時：この駒の縦の利き（上下それぞれ最初にぶつかる駒）にいる敵の能力が発動しない';
    case 'retreatAfterCapture':
      return '撃破した後、同じ手番のうちに斜め後ろへ1マス下がれる（選べる）';
  }
}

export function describeCard(r: Rules, cardId: string): { ability: string[]; special: string[] } {
  const defs = r.abilities[cardId];
  const card = r.db.cards[cardId];
  if (!defs) return { ability: [], special: [] };
  const leader = card.special.type === 'leader';
  return {
    ability: defs.ability.map((d) => describeAbility(r, cardId, d)),
    special: defs.special.map((d) => describeAbility(r, cardId, d, leader)),
  };
}
