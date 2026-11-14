// 盤上・持ち駒の駒の見た目
// ・基本色＝属性（神：黄、龍：赤、魔：紫）
// ・ふち＋輝き＝レアリティ（S：虹、A：金、B：銀）
import type { PieceState, Rules } from '../engine';
import { statusTurns } from '../engine';
import { attrLabel } from './attributes';

const PROMOTED_KANJI: Record<string, string> = { 飛: '竜', 角: '馬', 銀: '全', 桂: '圭', 香: '杏', 歩: 'と' };

export function pieceKanji(r: Rules, p: PieceState): string {
  const card = r.db.cards[p.cardId];
  if (!p.promoted) return card.piece;
  // 成った後の動きがカード独自のもの（「成銀にはならない」など）は元の字のまま
  if (r.moves[p.cardId] && 'after' in r.moves[p.cardId]) return card.piece;
  return PROMOTED_KANJI[card.piece] ?? card.piece;
}

export function PieceView({
  r,
  p,
  flipped,
  small,
  count,
  atk,
}: {
  r: Rules;
  p: PieceState;
  /** 上側（相手向き）に表示する */
  flipped: boolean;
  small?: boolean;
  count?: number;
  /** 今の攻撃力（リーダーや能力の補正込み）。省略するとカードの値 */
  atk?: number;
}) {
  const card = r.db.cards[p.cardId];
  const imm = statusTurns(p, 'immobile');
  const seal = statusTurns(p, 'seal');
  const shownAtk = atk ?? card.atk;
  const atkCls = shownAtk > card.atk ? 'up' : shownAtk < card.atk ? 'down' : '';
  return (
    <div
      className={`piece attr-${card.attribute} rar-${card.rarity} ${flipped ? 'flipped' : ''} ${small ? 'small' : ''} ${p.promoted ? 'promoted' : ''}`}
      title={`${card.name}（${card.piece}・${card.rarity}・${attrLabel(card.attribute)}）ATK ${shownAtk}`}
    >
      <div className="piece-shape">
        <div className="piece-glow">
          <div className="piece-glow-in" />
        </div>
        <div className="piece-frame" />
        <div className="piece-line" />
        <div className="piece-body">
          <span className="piece-kanji">{pieceKanji(r, p)}</span>
          <span className="piece-name">{card.name}</span>
          <div className="piece-shine" />
        </div>
        {card.rarity === 'S' && <div className="piece-sparkle" />}
      </div>
      <div className="piece-badges">
        {p.promoted && <span className="badge badge-promo">成</span>}
        {imm > 0 && <span className="badge badge-imm">動{imm}</span>}
        {seal > 0 && <span className="badge badge-seal">封{seal}</span>}
        {count !== undefined && count > 1 && <span className="badge badge-count">×{count}</span>}
      </div>
      <div className={`piece-atk ${atkCls}`}>⚔{shownAtk}</div>
    </div>
  );
}
