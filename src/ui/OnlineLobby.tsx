// オンライン対戦：部屋を作る／部屋コードで参加する／相手を待つ → 対局
import { useEffect, useMemo, useState } from 'react';
import type { User } from 'firebase/auth';
import type { Party, Rules } from '../engine';
import { PRESET_PARTIES, validateParty } from '../engine';
import { displayName } from '../online/auth';
import { useDecks } from '../online/decks';
import {
  type Room,
  cancelRoom,
  chooseNextParty,
  createRoom,
  declineRematch,
  joinRoom,
  mySide,
  normalizeCode,
  sides,
  startRematch,
  voteRematch,
  watchRoom,
} from '../online/rooms';
import { rematchPhase } from '../online/rematch';
import { GameScreen } from './GameScreen';

const LAST_ROOM_KEY = 'shogi-dairantou:lastRoom';
const saveLast = (code: string | null) => {
  try {
    if (code) localStorage.setItem(LAST_ROOM_KEY, code);
    else localStorage.removeItem(LAST_ROOM_KEY);
  } catch {
    /* 保存できなくても困らない */
  }
};
const loadLast = () => {
  try {
    return localStorage.getItem(LAST_ROOM_KEY);
  } catch {
    return null;
  }
};

export function OnlineLobby({ r, user, onBack, onLogin }: { r: Rules; user: User | null; onBack: () => void; onLogin: () => void }) {
  const uid = user?.uid ?? null;
  const { decks } = useDecks(uid);
  const [deckKey, setDeckKey] = useState('p:0');
  const [codeInput, setCodeInput] = useState('');
  const [code, setCode] = useState<string | null>(null);
  const [room, setRoom] = useState<Room | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [resume, setResume] = useState<string | null>(null);

  // 使えるデッキ（マイデッキ＋おすすめ）
  const options = useMemo(
    () => [
      ...decks.map((d) => ({ key: `d:${d.id}`, name: d.name, party: d.party })),
      ...PRESET_PARTIES.map((p, i) => ({ key: `p:${i}`, name: `（おすすめ）${p.name}`, party: p.party })),
    ],
    [decks],
  );
  useEffect(() => {
    if (decks.length > 0 && deckKey === 'p:0') setDeckKey(`d:${decks[0].id}`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [decks.length]);
  const chosen = options.find((o) => o.key === deckKey) ?? options[0];
  const deckErrors = chosen ? validateParty(r.db, chosen.party, r.config) : ['デッキがありません'];

  // 対局中に閉じた部屋があれば「続きから」を出す
  useEffect(() => {
    const last = loadLast();
    if (!uid || !last) return;
    return watchRoom(last, (rm) => {
      if (rm && rm.status === 'playing' && (rm.hostUid === uid || rm.guestUid === uid)) setResume(last);
      else setResume(null);
    });
  }, [uid]);

  // 入っている部屋を見張る
  useEffect(() => {
    if (!code) return;
    return watchRoom(
      code,
      (rm) => {
        setRoom(rm);
        if (!rm) {
          setMsg('部屋がなくなりました');
          setCode(null);
          saveLast(null);
        }
      },
      (e) => setMsg(`通信エラー：${e.message}`),
    );
  }, [code]);

  // 対局の設定は「部屋・何局目」が変わったときだけ作り直す
  // （手が届くたびに作り直すと、ログが消えたり部屋の見張りがやり直しになったりする）
  const gameKey = code && room && room.status !== 'waiting' && room.guestUid ? `${code}-${room.gameNo ?? 1}` : null;
  const game = useMemo(() => {
    if (!gameKey || !room || !uid || !code) return null;
    const s = sides(room);
    if (!s) return null;
    return {
      setup: { parties: s.parties, cpu: null, cpuLevel: 'normal' as const },
      remote: { code, me: mySide(room, uid), names: s.names },
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameKey, uid]);

  // 2人ともデッキを選んだら次の対局を始める（両方の端末が試み、先に通った方が有効）
  useEffect(() => {
    if (code && room && uid && rematchPhase(room, uid) === 'ready') {
      startRematch(code, uid).catch((e) => setMsg(`次の対局を始められませんでした：${(e as Error).message}`));
    }
  }, [room, code, uid]);

  if (!user || !uid) {
    return (
      <div className="simple-screen">
        <header className="screen-head">
          <button onClick={onBack}>← 戻る</button>
          <h2>オンライン対戦</h2>
          <span />
        </header>
        <div className="form-box center">
          <p>オンライン対戦には、ログインが必要です（無料）。</p>
          <button className="primary" onClick={onLogin}>
            ログイン／新規登録
          </button>
        </div>
      </div>
    );
  }

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setMsg(null);
    try {
      await fn();
    } catch (e) {
      setMsg((e as Error).message ?? String(e));
    } finally {
      setBusy(false);
    }
  };

  // 対局
  if (code && room && game) {
    return (
      <GameScreen
        key={gameKey}
        r={r}
        setup={game.setup}
        remote={game.remote}
        resultExtra={<RematchPanel r={r} room={room} uid={uid} code={code} options={options} defaultKey={chosen?.key} />}
        onExit={() => {
          // 終わった対局から出るときは、相手に「再戦しない」と知らせる
          if (room.status === 'finished') declineRematch(code, uid).catch(() => undefined);
          setCode(null);
          setRoom(null);
          saveLast(null);
        }}
      />
    );
  }

  // 相手待ち
  if (code && room?.status === 'waiting') {
    return (
      <div className="simple-screen">
        <header className="screen-head">
          <span />
          <h2>相手を待っています</h2>
          <span />
        </header>
        <div className="form-box center">
          <p>この部屋コードを相手に伝えてください</p>
          <div className="room-code">{code}</div>
          <button onClick={() => navigator.clipboard?.writeText(code).then(() => setMsg('コピーしました'))}>コードをコピー</button>
          <p className="dim small">デッキ：{room.hostParty && chosen?.name}</p>
          <button
            className="link-btn"
            onClick={() =>
              run(async () => {
                await cancelRoom(code);
                setCode(null);
                setRoom(null);
                saveLast(null);
              })
            }
          >
            部屋を閉じる
          </button>
          {msg && <p className="ok-text">{msg}</p>}
        </div>
      </div>
    );
  }

  const party: Party | undefined = chosen?.party;
  return (
    <div className="simple-screen">
      <header className="screen-head">
        <button onClick={onBack}>← 戻る</button>
        <h2>オンライン対戦</h2>
        <span className="dim">{displayName(user)}</span>
      </header>
      <div className="form-box">
        {resume && (
          <div className="resume">
            対局中の部屋があります（{resume}）
            <button className="primary" onClick={() => setCode(resume)}>
              続きから
            </button>
          </div>
        )}
        <label className="field">
          使うデッキ
          <select value={chosen?.key} onChange={(e) => setDeckKey(e.target.value)}>
            {options.map((o) => (
              <option key={o.key} value={o.key}>
                {o.name}
              </option>
            ))}
          </select>
        </label>
        {deckErrors.length > 0 && <p className="err-text">このデッキは使えません：{deckErrors[0]}</p>}

        <h3>部屋を作る</h3>
        <p className="dim small">部屋コードが出るので、対戦相手に伝えます。先手・後手はランダムです。</p>
        <button
          className="primary"
          disabled={busy || deckErrors.length > 0 || !party}
          onClick={() =>
            run(async () => {
              const c = await createRoom(uid, displayName(user), party!);
              setCode(c);
              saveLast(c);
            })
          }
        >
          部屋を作る
        </button>

        <h3>部屋コードで参加する</h3>
        <div className="join-row">
          <input
            value={codeInput}
            placeholder="例：K7QX2M"
            maxLength={8}
            onChange={(e) => setCodeInput(normalizeCode(e.target.value))}
            className="code-input"
          />
          <button
            className="primary"
            disabled={busy || codeInput.length < 6 || deckErrors.length > 0 || !party}
            onClick={() =>
              run(async () => {
                await joinRoom(codeInput, uid, displayName(user), party!);
                setCode(codeInput);
                saveLast(codeInput);
              })
            }
          >
            参加する
          </button>
        </div>
        {msg && <p className="err-text">{msg}</p>}
      </div>
    </div>
  );
}

/** 対局が終わったあとの「もう一回対戦」 */
export function RematchPanel({
  r,
  room,
  uid,
  code,
  options,
  defaultKey,
}: {
  r: Rules;
  room: Room;
  uid: string;
  code: string;
  options: { key: string; name: string; party: Party }[];
  defaultKey?: string;
}) {
  const [deckKey, setDeckKey] = useState(defaultKey ?? options[0]?.key);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const phase = rematchPhase(room, uid);
  const chosen = options.find((o) => o.key === deckKey) ?? options[0];
  const errors = chosen ? validateParty(r.db, chosen.party, r.config) : ['デッキがありません'];
  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setErr(null);
    try {
      await fn();
    } catch (e) {
      setErr((e as Error).message ?? String(e));
    } finally {
      setBusy(false);
    }
  };
  if (phase === 'notFinished') return null;
  return (
    <div className="rematch">
      {phase === 'declined' && <p className="dim">{room.declined === uid ? '再戦しないことにしました' : '相手は退出しました'}</p>}
      {phase === 'askMe' && (
        <button className="primary big" disabled={busy} onClick={() => run(() => voteRematch(code, uid))}>
          もう一回対戦
        </button>
      )}
      {phase === 'opponentWants' && (
        <>
          <p className="rematch-hot">相手がもう一回対戦したがっています！</p>
          <button className="primary big" disabled={busy} onClick={() => run(() => voteRematch(code, uid))}>
            もう一回対戦する
          </button>
        </>
      )}
      {phase === 'waitOpponentVote' && <p className="dim">相手の返事を待っています…</p>}
      {phase === 'chooseDeck' && (
        <>
          <p>2人とも同意しました。次の対局のデッキを選んでください（先手・後手は入れ替わります）。</p>
          <select value={chosen?.key} onChange={(e) => setDeckKey(e.target.value)}>
            {options.map((o) => (
              <option key={o.key} value={o.key}>
                {o.name}
              </option>
            ))}
          </select>
          {errors.length > 0 && <p className="err-text">このデッキは使えません：{errors[0]}</p>}
          <button className="primary" disabled={busy || errors.length > 0 || !chosen} onClick={() => run(() => chooseNextParty(code, uid, chosen!.party))}>
            このデッキで対戦
          </button>
        </>
      )}
      {phase === 'waitOpponentDeck' && <p className="dim">相手がデッキを選んでいます…</p>}
      {phase === 'ready' && <p className="dim">次の対局を始めています…</p>}
      {err && <p className="err-text">{err}</p>}
    </div>
  );
}
