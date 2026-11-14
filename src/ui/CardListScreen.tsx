// コマ一覧：全カードを表で見る（絞り込み・並べ替え・タップで詳細）
import { useMemo, useState } from 'react';
import type { Attribute, CardData, PieceKind, PieceState, Rarity, Rules } from '../engine';
import { promotedSet, unpromotedSet } from '../engine';
import { CardView } from './CardView';
import { PieceView } from './Piece';
import { ATTRIBUTE_DISPLAY, attrName, displayText } from './attributes';

const KINDS: PieceKind[] = ['王', '飛', '角', '金', '銀', '桂', '香', '歩'];
const RARITIES: Rarity[] = ['S', 'A', 'B'];
const ATTRS: Attribute[] = ['守', '攻', '妨害'];
const SPECIAL_LABEL = { leader: 'リーダー', awakening: '覚醒', enemy_camp: '敵陣' } as const;

type SortKey = 'default' | 'hp' | 'atk' | 'cost';

const displayPiece = (cardId: string): PieceState => ({
  uid: 0,
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

function moveText(r: Rules, c: CardData): string {
  const before = c.move_before === '将棋どおり' ? unpromotedSet(r, c.id).label : c.move_before;
  const after = promotedSet(r, c.id);
  const afterText = after === null ? '成らない' : c.move_after.includes('将棋どおり') ? after.label : c.move_after;
  return `${before} ／ 成：${afterText}`;
}

export function CardListScreen({ r, onBack }: { r: Rules; onBack: () => void }) {
  const [kind, setKind] = useState<PieceKind | 'all'>('all');
  const [rarity, setRarity] = useState<Rarity | 'all'>('all');
  const [attr, setAttr] = useState<Attribute | 'all'>('all');
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<SortKey>('default');
  const [open, setOpen] = useState<string | null>(null);

  const list = useMemo(() => {
    const q = query.trim();
    const filtered = r.db.list.filter(
      (c) =>
        (kind === 'all' || c.piece === kind) &&
        (rarity === 'all' || c.rarity === rarity) &&
        (attr === 'all' || c.attribute === attr) &&
        (!q || c.name.includes(q) || displayText(c.ability).includes(q) || displayText(c.special.text).includes(q)),
    );
    if (sort === 'default') return filtered;
    return [...filtered].sort((a, b) => b[sort] - a[sort] || KINDS.indexOf(a.piece) - KINDS.indexOf(b.piece));
  }, [r, kind, rarity, attr, query, sort]);

  return (
    <div className="simple-screen card-list-screen">
      <header className="screen-head">
        <button onClick={onBack}>← 戻る</button>
        <h2>コマ一覧</h2>
        <span className="dim">
          {list.length} / {r.db.list.length}種
        </span>
      </header>

      <div className="cl-filters">
        <div className="cl-chips">
          <button className={kind === 'all' ? 'on' : ''} onClick={() => setKind('all')}>
            全部
          </button>
          {KINDS.map((k) => (
            <button key={k} className={kind === k ? 'on' : ''} onClick={() => setKind(k)}>
              {k}
            </button>
          ))}
        </div>
        <div className="cl-row">
          <select value={rarity} onChange={(e) => setRarity(e.target.value as Rarity | 'all')}>
            <option value="all">レアリティ：全部</option>
            {RARITIES.map((x) => (
              <option key={x} value={x}>
                {x}
              </option>
            ))}
          </select>
          <select value={attr} onChange={(e) => setAttr(e.target.value as Attribute | 'all')}>
            <option value="all">属性：全部</option>
            {ATTRS.map((x) => (
              <option key={x} value={x}>
                {ATTRIBUTE_DISPLAY[x].label}
              </option>
            ))}
          </select>
          <select value={sort} onChange={(e) => setSort(e.target.value as SortKey)}>
            <option value="default">並び：駒の種類順</option>
            <option value="hp">HPが高い順</option>
            <option value="atk">ATKが高い順</option>
            <option value="cost">コストが高い順</option>
          </select>
          <input className="cl-search" placeholder="名前・能力で検索" value={query} onChange={(e) => setQuery(e.target.value)} />
        </div>
      </div>

      <div className="cl-table" role="table">
        <div className="cl-head" role="row">
          <span>駒</span>
          <span>名前</span>
          <span className="num">コスト</span>
          <span className="num">HP</span>
          <span className="num">ATK</span>
          <span>能力</span>
          <span>特殊能力</span>
        </div>
        {list.map((c) => (
          <button key={c.id} className={`cl-row-item attr-${c.attribute}`} onClick={() => setOpen(c.id)} role="row">
            <span className="cl-piece">
              <span className="cl-piece-box">
                <PieceView r={r} p={displayPiece(c.id)} flipped={false} />
              </span>
            </span>
            <span className="cl-name">
              <b>{c.name}</b>
              <span className="cl-tags">
                <span className={`rar-${c.rarity}`}>{c.rarity}</span>
                <span>{c.piece}</span>
                <span className={`attr-tag-${c.attribute}`}>{attrName(c.attribute)}</span>
              </span>
            </span>
            <span className="num cl-cost">
              <span className="cl-label">コスト</span>
              {c.cost}
            </span>
            <span className="num cl-hp">
              <span className="cl-label">HP</span>
              {c.hp}
            </span>
            <span className="num cl-atk">
              <span className="cl-label">ATK</span>
              {c.atk}
            </span>
            <span className="cl-text cl-ab">
              <span className="cl-label">能力</span>
              {c.ability ? displayText(c.ability) : '—'}
            </span>
            <span className="cl-text cl-sp">
              <span className="cl-special">【{SPECIAL_LABEL[c.special.type]}】</span>
              {displayText(c.special.text)}
              <span className="cl-move">{moveText(r, c)}</span>
            </span>
          </button>
        ))}
        {list.length === 0 && <p className="dim center">条件に合うコマがありません</p>}
      </div>

      {open && (
        <div className="modal-back" onClick={() => setOpen(null)}>
          <div className="modal peek" onClick={(e) => e.stopPropagation()}>
            <CardView r={r} card={r.db.cards[open]} />
            <div className="modal-btns">
              <button className="primary" onClick={() => setOpen(null)}>
                閉じる
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
