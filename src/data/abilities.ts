// 能力テキスト → 構造化データ の変換結果。
// 数値は a(i) / s(i) でカードのテキストから読む（a = ability、s = special.text の i 番目の数字）。
// 変換結果は `npm run review` で docs/ABILITY_REVIEW.md に、テキストと並べて書き出せる。
import type { AbilityDef, Action, CardAbilities, Condition, Effect, Target, Trigger } from '../engine/abilityTypes';

const a = (i: number) => ({ src: 'a' as const, i });
const s = (i: number) => ({ src: 's' as const, i });

const on = (trigger: Trigger, conditions: Condition[], ...actions: Action[]): AbilityDef => ({
  type: 'triggered',
  trigger,
  conditions,
  actions,
});
const act = (target: Target, ...effects: Effect[]): Action => ({ target, effects });

// よく使う形
const awakenHeal: CardAbilities['special'] = [on('onPromote', [], act('self', { e: 'heal', amount: s(0) }))];
const awakenDamage: CardAbilities['special'] = [on('onPromote', [], act('opponent', { e: 'damage', amount: s(0) }))];

export const ABILITIES: Record<string, CardAbilities> = {
  // ───────── 王 ─────────
  king_01: {
    ability: [on('onAllyCaptured', [{ c: 'victimAround8' }], act('opponent', { e: 'damage', amount: a(1) }))],
    special: [{ type: 'passive', p: 'captureReduction', pct: s(0), scope: 'allAllies', conditions: [] }],
  },
  king_02: {
    ability: [on('onTurnStart', [{ c: 'selfInOwnCamp' }], act('self', { e: 'heal', amount: a(0) }))],
    special: [on('onAllyCapture', [{ c: 'capturerAttribute', attr: '守' }], act('self', { e: 'heal', amount: s(0) }))],
    notes: ['リーダー：撃破した駒が王自身でも、守属性なら発動する'],
  },
  king_03: {
    ability: [on('onCapture', [], act('opponent', { e: 'damage', amount: a(0) }))],
    special: [{ type: 'passive', p: 'atkPct', pct: s(0), scope: { attr: '攻' }, conditions: [] }],
  },
  king_04: {
    ability: [on('onChecked', [{ c: 'oncePerGame' }], act('checkers', { e: 'immobile', turns: a(0) }))],
    special: [{ type: 'passive', p: 'dropPenaltyPct', pct: s(0) }],
    notes: ['王手をかけた駒が複数あるときは、すべて行動不能にする', '自傷ダメージ+10%は、ほかの加算をすべて足した後の合計にかける'],
  },
  king_05: {
    ability: [],
    special: [{ type: 'passive', p: 'atkPct', pct: s(0), scope: { attr: '攻' }, conditions: [] }],
  },
  king_06: {
    ability: [],
    special: [{ type: 'passive', p: 'abilityDamagePct', pct: s(0), attr: '妨害' }],
    notes: ['毒のダメージも対象（毒が入るたびの時点の倍率で計算）'],
  },

  // ───────── 飛 ─────────
  rook_01: {
    ability: [on('onCapture', [{ c: 'verticalMoveAtLeast', n: a(0) }], act('opponent', { e: 'damage', amount: a(1) }))],
    special: [on('onPromote', [], act('sameFileOrRankEnemyAll', { e: 'damage', amount: s(1) }))],
  },
  rook_02: {
    ability: [
      { type: 'passive', p: 'captureReduction', pct: a(0), scope: 'alliesInOwnCamp', conditions: [{ c: 'selfInOwnCamp' }] },
    ],
    special: awakenHeal,
  },
  rook_03: {
    ability: [{ type: 'passive', p: 'captureBonus', pct: a(1), conditions: [{ c: 'moveDistanceAtLeast', n: a(0) }] }],
    special: awakenDamage,
  },
  rook_04: {
    ability: [{ type: 'passive', p: 'disableAbilitiesInVerticalSight' }],
    special: [on('onPromote', [], act('adjacentEnemyOne', { e: 'immobile', turns: s(1) }))],
    notes: ['縦の利き＝上下それぞれ、最初にぶつかる駒まで。そこにいる敵（最大2体）の能力が止まる'],
  },
  rook_05: { ability: [], special: awakenHeal },
  rook_06: {
    ability: [],
    special: [on('onPromote', [], act('forwardNearestEnemy', { e: 'immobile', turns: s(1) }))],
  },

  // ───────── 角 ─────────
  bishop_01: {
    ability: [on('onMove', [{ c: 'diagonalMove' }], act('passedDiagonalEnemies', { e: 'seal', turns: a(0) }))],
    special: [on('onPromote', [], act('opponentHandOne', { e: 'excludeHand' }))],
    notes: ['「通り抜けた斜線」＝動いた斜めの線を、盤の端から端まで伸ばした線として扱う（取った駒は除く）'],
  },
  bishop_02: {
    ability: [{ type: 'passive', p: 'captureReduction', pct: a(0), scope: 'diagonalSight', conditions: [] }],
    special: awakenHeal,
  },
  bishop_03: {
    ability: [on('onCapture', [{ c: 'diagonalMove' }], act('beyondCapturedFirstEnemy', { e: 'damage', amount: a(1) }))],
    special: awakenDamage,
    notes: ['斜めに動いて撃破したときだけ。間に駒があっても貫通して、最初の敵に当たる'],
  },
  bishop_04: {
    ability: [on('onCapture', [], act('opponent', { e: 'poison', amount: a(0), times: a(1) }))],
    special: [on('onPromote', [], act('opponent', { e: 'poison', amount: s(0), times: s(1) }))],
  },
  bishop_05: { ability: [], special: awakenHeal },
  bishop_06: { ability: [], special: awakenDamage },

  // ───────── 金 ─────────
  gold_01: {
    ability: [
      { type: 'passive', p: 'captureReduction', pct: a(0), scope: 'allAllies', conditions: [{ c: 'selfAdjacentToKing' }] },
    ],
    special: [on('onEnterEnemyCamp', [], act('self', { e: 'heal', amount: s(0) }))],
  },
  gold_02: {
    ability: [on('onAllyCaptured', [{ c: 'victimAdjacent' }], act('opponent', { e: 'damage', amount: a(0) }))],
    special: [on('onEnterEnemyCamp', [], act('self', { e: 'heal', amount: s(0) }))],
  },
  gold_03: {
    ability: [on('onCapture', [], act('opponent', { e: 'damage', amount: a(0) }))],
    special: [on('onEnterEnemyCamp', [], act('opponent', { e: 'damage', amount: s(0) }))],
  },
  gold_04: {
    ability: [{ type: 'passive', p: 'lockHorizontalAdjacentEnemies' }],
    special: [on('onEnterEnemyCamp', [], act('adjacentEnemyOne', { e: 'immobile', turns: s(1) }))],
  },
  gold_05: { ability: [], special: [on('onEnterEnemyCamp', [], act('opponent', { e: 'damage', amount: s(0) }))] },
  gold_06: {
    ability: [],
    special: [on('onEnterEnemyCamp', [], act('opponent', { e: 'nextDropPenalty', amount: s(0) }))],
    notes: ['相手が打つ前にもう一度発動したら、加算は重なる'],
  },

  // ───────── 銀 ─────────
  silver_01: {
    ability: [{ type: 'passive', p: 'retreatAfterCapture' }],
    special: [on('onPromote', [], act('adjacentEnemyAll', { e: 'damage', amount: s(1) }))],
    notes: ['下がるかどうかは指す人が選ぶ。下がるのは成り・覚醒の後'],
  },
  silver_02: {
    ability: [on('onCaptured', [], act('capturer', { e: 'atkPct', pct: a(0), sign: -1, turns: a(1) }))],
    special: awakenHeal,
  },
  silver_03: {
    ability: [on('onCapture', [{ c: 'diagonalForwardMove' }], act('opponent', { e: 'damage', amount: a(0) }))],
    special: awakenDamage,
  },
  silver_04: {
    ability: [on('onCaptured', [], act('capturer', { e: 'immobile', turns: a(0) }))],
    special: [on('onPromote', [], act('opponentHandOne', { e: 'seal', turns: s(1) }))],
  },
  silver_05: { ability: [], special: awakenHeal },
  silver_06: {
    ability: [],
    special: [on('onPromote', [], act('adjacentEnemyOne', { e: 'immobile', turns: s(1) }))],
  },

  // ───────── 桂 ─────────
  knight_01: {
    ability: [on('onMove', [{ c: 'jumpMove' }], act('jumpedEnemies', { e: 'immobile', turns: a(0) }))],
    special: awakenDamage,
    notes: ['跳び越えたマス＝跳ぶ方向の途中にある2マス（例：前に桂跳びなら、1つ前のマスと、1つ前の斜めのマス）'],
  },
  knight_02: {
    ability: [on('onCapture', [], act('self', { e: 'heal', amount: a(0) }))],
    special: awakenHeal,
  },
  knight_03: {
    ability: [on('onMove', [{ c: 'jumpMove' }], act('jumpedEnemies', { e: 'damage', amount: a(1) }))],
    special: awakenDamage,
  },
  knight_04: {
    ability: [on('onCapture', [], act('adjacentEnemyPushable', { e: 'push' }))],
    special: [on('onPromote', [], act('adjacentEnemyPushable', { e: 'push' }, { e: 'immobile', turns: s(2) }))],
  },
  knight_05: { ability: [], special: awakenHeal },
  knight_06: { ability: [], special: awakenDamage },

  // ───────── 香 ─────────
  lance_01: {
    ability: [on('onCapture', [{ c: 'forwardMoveAtLeast', n: a(0) }], act('opponent', { e: 'damage', amount: a(1) }))],
    special: [
      on(
        'onPromote',
        [],
        act('opponent', { e: 'damage', amount: s(0) }),
        act('sameFileEnemyAll', { e: 'damage', amount: s(2) }),
      ),
    ],
  },
  lance_02: {
    ability: [{ type: 'passive', p: 'captureReduction', pct: a(0), scope: 'sameFileBehind', conditions: [] }],
    special: awakenHeal,
  },
  lance_03: {
    ability: [on('onCapture', [{ c: 'verticalMove' }], act('beyondCapturedFirstEnemy', { e: 'damage', amount: a(1) }))],
    special: awakenDamage,
  },
  lance_04: {
    ability: [on('onCapture', [], act('sameFileEnemyOne', { e: 'immobile', turns: a(1) }))],
    special: [on('onPromote', [], act('sameFileEnemyAll', { e: 'immobile', turns: s(0) }))],
  },
  lance_05: { ability: [], special: awakenHeal },
  lance_06: {
    ability: [],
    special: [on('onPromote', [], act('sameFileNearestEnemy', { e: 'immobile', turns: s(1) }))],
  },

  // ───────── 歩 ─────────
  pawn_01: {
    ability: [on('onAllyCaptured', [{ c: 'victimKind', kind: '歩' }], act('self', { e: 'heal', amount: a(0) }))],
    special: awakenHeal,
    notes: ['取られた歩が成っていても（と金でも）発動する'],
  },
  pawn_02: {
    ability: [{ type: 'passive', p: 'captureReduction', pct: a(0), scope: 'adjacent', conditions: [] }],
    special: awakenHeal,
  },
  pawn_03: { ability: [on('onCapture', [], act('self', { e: 'heal', amount: a(0) }))], special: awakenHeal },
  pawn_04: { ability: [on('onCaptured', [], act('self', { e: 'heal', amount: a(0) }))], special: awakenHeal },
  pawn_05: { ability: [], special: awakenHeal },
  pawn_06: {
    ability: [],
    special: [on('onPromote', [], act('self', { e: 'captureShield', pct: s(0) }))],
    notes: ['「次に受ける撃破ダメージ」＝この駒に限らず、自分の駒が次に取られたとき'],
  },
  pawn_07: { ability: [], special: awakenHeal },
  pawn_08: {
    ability: [on('onCapture', [], act('thisPiece', { e: 'atkFlat', amount: a(0) }))],
    special: awakenDamage,
    notes: ['ATK+500 はその撃破の後から。取られたら元に戻る'],
  },
  pawn_09: { ability: [on('onCapture', [], act('opponent', { e: 'damage', amount: a(0) }))], special: awakenDamage },
  pawn_10: { ability: [on('onCaptured', [], act('opponent', { e: 'damage', amount: a(0) }))], special: awakenDamage },
  pawn_11: {
    ability: [{ type: 'passive', p: 'atkPct', pct: a(0), scope: 'self', conditions: [{ c: 'selfInEnemyCamp' }] }],
    special: awakenDamage,
  },
  pawn_12: { ability: [], special: awakenDamage },
  pawn_13: {
    ability: [],
    special: [
      on(
        'onPromote',
        [],
        act('opponent', { e: 'damage', amount: s(0) }),
        act('thisPiece', { e: 'atkPct', pct: s(1), sign: 1 }),
      ),
    ],
  },
  pawn_14: { ability: [], special: awakenDamage },
  pawn_15: {
    ability: [on('onCapture', [], act('opponent', { e: 'poison', amount: a(0), times: a(1) }))],
    special: [on('onPromote', [], act('opponentHandAll', { e: 'seal', turns: s(0) }))],
  },
  pawn_16: {
    ability: [on('onCaptured', [], act('capturer', { e: 'immobile', turns: a(0) }))],
    special: [on('onPromote', [], act('adjacentEnemyOne', { e: 'immobile', turns: s(1) }))],
  },
  pawn_17: {
    ability: [on('onCaptured', [], act('capturer', { e: 'seal', turns: a(0) }))],
    special: [
      on(
        'onPromote',
        [],
        act('opponent', { e: 'damage', amount: s(0) }),
        act('adjacentEnemyOne', { e: 'seal', turns: s(2) }),
      ),
    ],
  },
  pawn_18: {
    ability: [{ type: 'passive', p: 'dropPenaltyFlat', amount: a(0), upgradedAmount: s(0) }],
    special: [on('onPromote', [], act('thisPiece', { e: 'upgrade' }))],
  },
  pawn_19: {
    ability: [],
    special: [on('onPromote', [], act('opponentHandOne', { e: 'seal', turns: s(1) }))],
  },
  pawn_20: {
    ability: [],
    special: [on('onPromote', [], act('forwardNearestEnemy', { e: 'immobile', turns: s(1) }))],
  },
  pawn_21: {
    ability: [],
    special: [on('onPromote', [], act('opponent', { e: 'poison', amount: s(0), times: s(1) }))],
  },
};
