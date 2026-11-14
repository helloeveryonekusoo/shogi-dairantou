// パーティ編成（ローカル対戦用の2人分の編成画面と、デッキ編集でも使う部品）
import { useState } from 'react';
import type { Party, PieceState, Player, Rules, SlotId } from '../engine';
import { PRESET_PARTIES, SLOTS, partyCost, partyHp, randomParty, validateParty } from '../engine';
import { CardView } from './CardView';
import { PieceView } from './Piece';
import { attrName } from './attributes';

const sideName = (p: Player) => (p === 0 ? '先手' : '後手');

export interface PartySource {
  name: string;
  party: Party;
}

/** 12枠の編成パネル。枠をクリックするとカードを選べる */
export function PartyPanel({
  r,
  title,
  party,
  onChange,
  sources = [],
  className = '',
}: {
  r: Rules;
  title: React.ReactNode;
  party: Party;
  onChange: (p: Party) => void;
  /** 「読み込む」に出す編成（マイデッキなど） */
  sources?: PartySource[];
  className?: string;
}) {
  const [picking, setPicking] = useState<SlotId | null>(null);
  const cost = partyCost(r.db, party);
  const hp = partyHp(r.db, party);
  const errors = validateParty(r.db, party, r.config);
  return (
    <div className={`party-panel ${className}`}>
      <div className="party-head">
        <h3>{title}</h3>
        <div className="party-tools">
          <select
            value=""
            onChange={(e) => {
              const [kind, idx] = e.target.value.split(':');
              const src = kind === 'p' ? PRESET_PARTIES[Number(idx)] : sources[Number(idx)];
              if (src) onChange({ ...src.party });
            }}
          >
            <option value="">編成を読み込む…</option>
            {sources.length > 0 && (
              <optgroup label="マイデッキ">
                {sources.map((s, i) => (
                  <option key={'d' + i} value={`d:${i}`}>
                    {s.name}
                  </option>
                ))}
              </optgroup>
            )}
            <optgroup label="おすすめ編成">
              {PRESET_PARTIES.map((p, i) => (
                <option key={'p' + i} value={`p:${i}`}>
                  {p.name}
                </option>
              ))}
            </optgroup>
          </select>
          <button onClick={() => onChange(randomParty(r.db, r.config))}>ランダム</button>
        </div>
      </div>
      <div className="party-sum">
        <span className={cost > r.config.costCap ? 'over' : ''}>
          コスト <b>{cost}</b> / {r.config.costCap}
        </span>
        <span>
          パーティHP <b>{hp.toLocaleString()}</b>
        </span>
      </div>
      <div className="slots">
        {SLOTS.map((s) => {
          const c = r.db.cards[party[s.id]];
          return (
            <button key={s.id} className={`slot attr-${c?.attribute}`} onClick={() => setPicking(s.id)}>
              <span className="slot-kind">{s.label}</span>
              <span className={`slot-rar rar-${c?.rarity}`}>{c?.rarity}</span>
              <span className="slot-name">{c?.name ?? '（未選択）'}</span>
              <span className={`slot-attr attr-tag-${c?.attribute}`}>{c ? attrName(c.attribute) : ''}</span>
              <span className="slot-num">HP{c?.hp}</span>
              <span className="slot-num">ATK{c?.atk}</span>
              <span className="slot-cost">{c?.cost}</span>
            </button>
          );
        })}
      </div>
      <PawnOrder r={r} party={party} onChange={onChange} />
      {errors.length > 0 && (
        <ul className="errors">
          {errors.map((e, i) => (
            <li key={i}>{e}</li>
          ))}
        </ul>
      )}
      {picking && (
        <CardPicker
          r={r}
          party={party}
          slot={picking}
          title={title}
          onPick={(id) => {
            onChange({ ...party, [picking]: id });
            setPicking(null);
          }}
          onClose={() => setPicking(null)}
        />
      )}
    </div>
  );
}

const PAWN_SLOTS = ['pawn1', 'pawn2', 'pawn3', 'pawn4', 'pawn5'] as const;

/** 見た目だけの駒（編成画面で並びを見せる用） */
const displayPiece = (cardId: string, uid: number): PieceState => ({
  uid,
  cardId,
  owner: 0,
  originalOwner: 0,
  promoted: false,
  pos: null,
  statuses: [],
  atkFlat: 0,
  atkPctPerm: 0,
  upgraded: false,
  onceUsed: false,
  campLeftAt: null,
  excluded: false,
});

/** 歩の並び（自分から見て左から1筋〜5筋）。2つタップすると入れ替わる */
function PawnOrder({ r, party, onChange }: { r: Rules; party: Party; onChange: (p: Party) => void }) {
  const [sel, setSel] = useState<number | null>(null);
  const tap = (i: number) => {
    if (sel === null) return setSel(i);
    if (sel !== i) {
      const a = PAWN_SLOTS[sel];
      const b = PAWN_SLOTS[i];
      onChange({ ...party, [a]: party[b], [b]: party[a] });
    }
    setSel(null);
  };
  return (
    <div className="pawn-order">
      <div className="pawn-order-head">
        <b>歩の並び</b>
        <span className="dim small">{sel === null ? '2つタップすると入れ替わります（自分から見て左が1筋）' : 'どの歩と入れ替えますか？'}</span>
      </div>
      <div className="pawn-cells">
        {PAWN_SLOTS.map((id, i) => (
          <button key={id} className={`pawn-cell ${sel === i ? 'sel' : ''}`} onClick={() => tap(i)} title={`${i + 1}筋：${r.db.cards[party[id]]?.name ?? ''}`}>
            <div className="pawn-piece">{party[id] && r.db.cards[party[id]] && <PieceView r={r} p={displayPiece(party[id], i)} flipped={false} />}</div>
            <span className="pawn-file">{i + 1}筋</span>
          </button>
        ))}
      </div>
    </div>
  );
}

/** その枠に入れるカードを選ぶ */
export function CardPicker({
  r,
  party,
  slot,
  title,
  onPick,
  onClose,
}: {
  r: Rules;
  party: Party;
  slot: SlotId;
  title: React.ReactNode;
  onPick: (cardId: string) => void;
  onClose: () => void;
}) {
  const [preview, setPreview] = useState<string>(party[slot]);
  const slotInfo = SLOTS.find((s) => s.id === slot)!;
  const candidates = r.db.list.filter((c) => c.piece === slotInfo.kind);
  return (
    <div className="modal-back" onClick={onClose}>
      <div className="modal picker" onClick={(e) => e.stopPropagation()}>
        <h3>
          {title}：{slotInfo.label}のカードを選ぶ
        </h3>
        <div className="picker-body">
          <div className="picker-list">
            {candidates.map((c) => {
              const trial = { ...party, [slot]: c.id };
              const errs = validateParty(r.db, trial, r.config);
              const dup = !r.config.allowDuplicateCards && SLOTS.some((s) => s.id !== slot && party[s.id] === c.id);
              return (
                <button
                  key={c.id}
                  className={`pick-row attr-${c.attribute} ${party[slot] === c.id ? 'chosen' : ''} ${preview === c.id ? 'previewing' : ''}`}
                  onMouseEnter={() => setPreview(c.id)}
                  onClick={() => onPick(c.id)}
                >
                  <span className={`slot-rar rar-${c.rarity}`}>{c.rarity}</span>
                  <span className="slot-name">{c.name}</span>
                  <span className={`slot-attr attr-tag-${c.attribute}`}>{attrName(c.attribute)}</span>
                  <span className="slot-num">HP{c.hp}</span>
                  <span className="slot-num">ATK{c.atk}</span>
                  <span className="slot-cost">{c.cost}</span>
                  {dup && <span className="warn">使用中</span>}
                  {!dup && errs.some((e) => e.includes('コスト')) && <span className="warn">コスト超過</span>}
                </button>
              );
            })}
          </div>
          <div className="picker-preview">{preview && <CardView r={r} card={r.db.cards[preview]} />}</div>
        </div>
        <button className="link-btn" onClick={onClose}>
          閉じる
        </button>
      </div>
    </div>
  );
}

/** ローカル対戦（同じ端末・CPU）の編成画面 */
export function PartyEditor({
  r,
  parties,
  cpu,
  sources,
  onChange,
  onStart,
  onBack,
}: {
  r: Rules;
  parties: [Party, Party];
  cpu: Player | null;
  sources?: PartySource[];
  onChange: (p: [Party, Party]) => void;
  onStart: () => void;
  onBack: () => void;
}) {
  const ok = parties.every((p) => validateParty(r.db, p, r.config).length === 0);
  const set = (pl: Player, p: Party) => onChange(pl === 0 ? [p, parties[1]] : [parties[0], p]);
  return (
    <div className="party-screen">
      <header className="screen-head">
        <button onClick={onBack}>← 戻る</button>
        <h2>パーティ編成</h2>
        <button className="primary big" disabled={!ok} onClick={onStart}>
          対局開始
        </button>
      </header>
      <p className="dim center">
        12枠それぞれに、その駒のカードを入れます。コスト上限 {r.config.costCap}（S=5・A=3・B=1）。枠をクリックするとカードを選べます。
      </p>
      <div className="party-cols">
        {([0, 1] as const).map((pl) => (
          <PartyPanel
            key={pl}
            r={r}
            className={`side-${pl}`}
            title={`${sideName(pl)}${cpu === pl ? '（CPU）' : ''}`}
            party={parties[pl]}
            sources={sources}
            onChange={(p) => set(pl, p)}
          />
        ))}
      </div>
    </div>
  );
}
