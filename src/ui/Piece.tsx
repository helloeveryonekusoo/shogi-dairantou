// 盤上・持ち駒の駒の見た目
import type { PieceState, Rules } from '../engine';
import { statusTurns } from '../engine';

const PROMOTED_KANJI: Record<string, string> = { 飛: '竜', 角: '馬', 銀: '全', 桂: '圭', 香: '杏', 歩: 'と' };

export function pieceKanji(r: Rules, p: PieceState): string {
  const card = r.db.cards[p.cardId];
  if (!p.promoted) return card.piece;
  // 成った後の動きがカード独自のもの（「成銀にはならない」など）は元の字を赤で出す
  if (r.moves[p.cardId] && 'after' in r.moves[p.cardId]) return card.piece;
  return PROMOTED_KANJI[card.piece] ?? card.piece;
}

export function PieceView({
  r,
  p,
  flipped,
  small,
  count,
}: {
  r: Rules;
  p: PieceState;
  /** 上側（相手向き）に表示する */
  flipped: boolean;
  small?: boolean;
  count?: number;
}) {
  const card = r.db.cards[p.cardId];
  const imm = statusTurns(p, 'immobile');
  const seal = statusTurns(p, 'seal');
  const atkMod = p.statuses.filter((s) => s.kind === 'atkPct').reduce((a, s) => a + (s.value ?? 0), 0) + p.atkPctPerm;
  return (
    <div
      className={`piece attr-${card.attribute} rar-${card.rarity} ${flipped ? 'flipped' : ''} ${small ? 'small' : ''} ${p.promoted ? 'promoted' : ''} ${
        p.originalOwner !== p.owner ? 'captured-card' : ''
      }`}
      title={`${card.name}（${card.piece}・${card.rarity}・${card.attribute}）`}
    >
      <div className="piece-body">
        <span className="piece-rarity">{card.rarity}</span>
        <span className="piece-kanji">{pieceKanji(r, p)}</span>
        <span className="piece-name">{card.name}</span>
      </div>
      <div className="piece-badges">
        {imm > 0 && <span className="badge badge-imm">動{imm}</span>}
        {seal > 0 && <span className="badge badge-seal">封{seal}</span>}
        {atkMod !== 0 && <span className={`badge ${atkMod > 0 ? 'badge-up' : 'badge-down'}`}>{atkMod > 0 ? '↑' : '↓'}</span>}
        {p.atkFlat > 0 && <span className="badge badge-up">+{p.atkFlat}</span>}
        {count !== undefined && count > 1 && <span className="badge badge-count">×{count}</span>}
      </div>
    </div>
  );
}
