// マイデッキ：一覧・作成・編集・保存・削除
import { useState } from 'react';
import type { Party, Rules } from '../engine';
import { PRESET_PARTIES, partyCost, partyHp, validateParty } from '../engine';
import { type Deck, createDeck, deleteDeck, saveDeck, useDecks } from '../online/decks';
import { PartyPanel } from './PartyEditor';

type Editing = { id: string | null; name: string; party: Party };

export function DeckScreen({ r, uid, onBack, onLogin }: { r: Rules; uid: string | null; onBack: () => void; onLogin: () => void }) {
  const { decks, loading, error } = useDecks(uid);
  const [editing, setEditing] = useState<Editing | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  if (!uid) {
    return (
      <div className="simple-screen">
        <header className="screen-head">
          <button onClick={onBack}>← 戻る</button>
          <h2>マイデッキ</h2>
          <span />
        </header>
        <div className="form-box center">
          <p>デッキを保存するには、ログインが必要です（無料）。</p>
          <button className="primary" onClick={onLogin}>
            ログイン／新規登録
          </button>
        </div>
      </div>
    );
  }

  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    setMsg(null);
    try {
      await fn();
      return true;
    } catch (e) {
      setMsg(`保存できませんでした：${(e as Error).message ?? e}`);
      return false;
    } finally {
      setBusy(false);
    }
  };

  if (editing) {
    const errors = validateParty(r.db, editing.party, r.config);
    const save = async () => {
      const name = editing.name.trim() || '名前のないデッキ';
      const ok = await run(() => (editing.id ? saveDeck(uid, editing.id, name, editing.party) : createDeck(uid, name, editing.party)));
      if (ok) setEditing(null);
    };
    return (
      <div className="party-screen">
        <header className="screen-head">
          <button onClick={() => setEditing(null)}>← やめる</button>
          <h2>{editing.id ? 'デッキを編集' : '新しいデッキ'}</h2>
          <button className="primary big" disabled={busy || errors.length > 0} onClick={save}>
            保存
          </button>
        </header>
        <div className="deck-edit">
          <label className="field">
            デッキ名
            <input value={editing.name} maxLength={40} onChange={(e) => setEditing({ ...editing, name: e.target.value })} />
          </label>
          <PartyPanel
            r={r}
            title="編成"
            party={editing.party}
            sources={decks.map((d) => ({ name: d.name, party: d.party }))}
            onChange={(p) => setEditing({ ...editing, party: p })}
          />
          {msg && <p className="err-text">{msg}</p>}
        </div>
      </div>
    );
  }

  const remove = async (d: Deck) => {
    if (!confirm(`「${d.name}」を削除します。元に戻せません。よろしいですか？`)) return;
    await run(() => deleteDeck(uid, d.id));
  };

  return (
    <div className="simple-screen">
      <header className="screen-head">
        <button onClick={onBack}>← 戻る</button>
        <h2>マイデッキ</h2>
        <button className="primary" onClick={() => setEditing({ id: null, name: '', party: { ...PRESET_PARTIES[0].party } })}>
          ＋ 新しいデッキ
        </button>
      </header>
      <div className="deck-list">
        {loading && <p className="dim center">読み込み中…</p>}
        {error && <p className="err-text center">読み込めませんでした：{error}</p>}
        {!loading && decks.length === 0 && <p className="dim center">まだデッキがありません。「＋ 新しいデッキ」から作りましょう。</p>}
        {decks.map((d) => {
          const errs = validateParty(r.db, d.party, r.config);
          const king = r.db.cards[d.party.king];
          return (
            <div key={d.id} className="deck-row">
              <div className="deck-info">
                <div className="deck-name">{d.name}</div>
                <div className="dim small">
                  王：{king?.name ?? '？'}　コスト {partyCost(r.db, d.party)} / {r.config.costCap}　HP {partyHp(r.db, d.party).toLocaleString()}
                  {errs.length > 0 && <span className="warn">　※ 今のルールでは使えません</span>}
                </div>
              </div>
              <div className="deck-btns">
                <button onClick={() => setEditing({ id: d.id, name: d.name, party: { ...d.party } })}>編集</button>
                <button onClick={() => run(() => createDeck(uid, `${d.name}のコピー`, d.party))} disabled={busy}>
                  複製
                </button>
                <button className="danger" onClick={() => remove(d)} disabled={busy}>
                  削除
                </button>
              </div>
            </div>
          );
        })}
        {msg && <p className="err-text center">{msg}</p>}
      </div>
    </div>
  );
}
