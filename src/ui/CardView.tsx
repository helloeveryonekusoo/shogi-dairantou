// カード詳細
import { useState } from 'react';
import type { CardData, GameState, PieceState, Rules } from '../engine';
import { buildBoard, describeCard, effectiveAtk, isActive, promotedSet, statusTurns, unpromotedSet } from '../engine';

const SPECIAL_LABEL = { leader: 'リーダー', awakening: '覚醒', enemy_camp: '敵陣' } as const;

export function CardView({ r, card, piece, state }: { r: Rules; card: CardData; piece?: PieceState; state?: GameState }) {
  const [showInterp, setShowInterp] = useState(false);
  const desc = describeCard(r, card.id);
  const before = unpromotedSet(r, card.id);
  const after = promotedSet(r, card.id);
  const board = state ? buildBoard(state) : null;
  const atkNow = piece && state && board && piece.pos ? effectiveAtk(r, state, board, piece) : null;
  const abilityOn = piece && state && board && piece.pos ? isActive(r, state, board, piece, 'ability') : true;
  const imm = piece ? statusTurns(piece, 'immobile') : 0;
  const seal = piece ? statusTurns(piece, 'seal') : 0;
  return (
    <div className={`card-view attr-${card.attribute}`}>
      <div className="cv-head">
        <span className={`cv-rarity rar-${card.rarity}`}>{card.rarity}</span>
        <span className="cv-piece">{card.piece}</span>
        <span className="cv-name">{card.name}</span>
        <span className={`cv-attr attr-tag-${card.attribute}`}>{card.attribute}</span>
      </div>
      <div className="cv-stats">
        <div>
          HP <b>{card.hp}</b>
        </div>
        <div>
          ATK <b>{card.atk}</b>
          {atkNow !== null && atkNow !== card.atk && <span className={atkNow > card.atk ? 'up' : 'down'}>（今 {atkNow}）</span>}
        </div>
        <div>
          コスト <b>{card.cost}</b>
        </div>
      </div>
      {piece && (imm > 0 || seal > 0 || piece.promoted || !abilityOn || piece.upgraded) && (
        <div className="cv-status">
          {piece.promoted && <span className="chip chip-promo">成り</span>}
          {imm > 0 && <span className="chip chip-imm">行動不能 あと{imm}手番</span>}
          {seal > 0 && <span className="chip chip-seal">封印 あと{seal}手番</span>}
          {!abilityOn && seal === 0 && <span className="chip chip-seal">能力停止中（縦の利き）</span>}
          {piece.upgraded && <span className="chip chip-promo">能力強化</span>}
        </div>
      )}
      <div className="cv-section">
        <div className="cv-label">能力</div>
        <div className="cv-text">{card.ability ?? '—'}</div>
      </div>
      <div className="cv-section">
        <div className="cv-label">【{SPECIAL_LABEL[card.special.type]}】</div>
        <div className="cv-text">{card.special.text}</div>
      </div>
      <div className="cv-section cv-move">
        <div>
          <span className="cv-label">動き</span> {card.move_before === '将棋どおり' ? before.label : card.move_before}
        </div>
        <div>
          <span className="cv-label">成った後</span> {after === null ? '成らない' : card.move_after.includes('将棋どおり') ? after.label : card.move_after}
        </div>
      </div>
      <button className="link-btn" onClick={() => setShowInterp((v) => !v)}>
        {showInterp ? '▲ 実装上の解釈を閉じる' : '▼ 実装上の解釈を見る'}
      </button>
      {showInterp && (
        <ul className="cv-interp">
          {desc.ability.map((t, i) => (
            <li key={'a' + i}>{t}</li>
          ))}
          {desc.special.map((t, i) => (
            <li key={'s' + i}>{t}</li>
          ))}
          {(r.abilities[card.id]?.notes ?? []).map((t, i) => (
            <li key={'n' + i} className="note">
              ※ {t}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
