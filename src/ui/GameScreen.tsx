// 対局画面
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ChoiceRequest, GameEvent, GameState, Move, Party, PieceState, Player, Pos, Rules } from '../engine';
import { FILES, RANKS, applyMove, createGame, handPieces, legalMoves, nextChoice, other, resign, samePos } from '../engine';
import { type Room, resignRoom, submitMove, watchRoom } from '../online/rooms';
import { type CpuLevel, chooseMove } from '../ai/cpu';
import { PieceView } from './Piece';
import { CardView } from './CardView';
import { type LogLine, eventToLog } from './log';
import { EffectLayer, useEffects } from './effects/EffectLayer';
import { stepFor } from './effects/registry';

export interface GameSetup {
  parties: [Party, Party];
  /** null = 2人対戦。0/1 = そのプレイヤーをCPUが指す */
  cpu: Player | null;
  cpuLevel: CpuLevel;
  /** 開発用：最初の局面を差し替える */
  initialState?: GameState;
}

type Speed = 'normal' | 'fast' | 'instant';
const SPEED_FACTOR: Record<Speed, number> = { normal: 1, fast: 0.4, instant: 0 };
const sleep = (ms: number) => new Promise((res) => setTimeout(res, ms));
const sideName = (p: Player) => (p === 0 ? '先手' : '後手');
const RANK_KANJI = ['一', '二', '三', '四', '五', '六', '七', '八', '九'];

type Pending =
  | { kind: 'promote'; options: Move[] }
  | { kind: 'retreat'; options: Move[] }
  | { kind: 'target'; move: Move; request: ChoiceRequest }
  | null;

/** オンライン対戦のとき */
export interface RemoteInfo {
  code: string;
  /** 自分は先手(0)か後手(1)か */
  me: Player;
  /** [先手の名前, 後手の名前] */
  names: [string, string];
}

export function GameScreen({ r, setup, onExit, remote }: { r: Rules; setup: GameSetup; onExit: () => void; remote?: RemoteInfo }) {
  const initial = useMemo(
    () => (setup.initialState ? { state: setup.initialState, events: [] } : createGame(r, setup.parties)),
    [r, setup],
  );
  const [state, setState] = useState<GameState>(initial.state);
  const [displayHp, setDisplayHp] = useState<[number, number]>([initial.state.players[0].hp, initial.state.players[1].hp]);
  const [log, setLog] = useState<LogLine[]>([]);
  const [selected, setSelected] = useState<number | null>(null);
  const [inspect, setInspect] = useState<number | null>(null);
  const [pending, setPending] = useState<Pending>(null);
  const [busy, setBusy] = useState(false);
  const [speed, setSpeed] = useState<Speed>('normal');
  const [flipBoard, setFlipBoard] = useState(remote ? remote.me === 1 : setup.cpu === 0);
  const [room, setRoom] = useState<Room | null>(null);
  const [netError, setNetError] = useState<string | null>(null);
  /** オンライン：局面に適用済みの手の数 */
  const appliedRef = useRef(0);
  const [lastMove, setLastMove] = useState<{ from?: Pos; to: Pos } | null>(null);
  const [history, setHistory] = useState<GameState[]>([]);
  const [hideResult, setHideResult] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const fx = useEffects(containerRef);
  const logId = useRef(1);
  const speedRef = useRef(speed);
  speedRef.current = speed;

  const env = useMemo(() => ({ cardName: (id: string) => r.db.cards[id]?.name ?? id, sideName }), [r]);

  const pushLog = useCallback(
    (ev: GameEvent) => {
      const line = eventToLog(r, ev);
      if (line) setLog((prev) => [{ ...line, id: logId.current++ }, ...prev].slice(0, 300));
    },
    [r],
  );

  /** イベントを1つずつ再生（ログ・HP表示・演出） */
  const playEvents = useCallback(
    async (events: GameEvent[], finalState: GameState) => {
      for (const ev of events) {
        pushLog(ev);
        if (ev.t === 'damage') setDisplayHp((h) => (ev.player === 0 ? [h[0] - ev.amount, h[1]] : [h[0], h[1] - ev.amount]));
        if (ev.t === 'heal') setDisplayHp((h) => (ev.player === 0 ? [h[0] + ev.amount, h[1]] : [h[0], h[1] + ev.amount]));
        const f = SPEED_FACTOR[speedRef.current];
        if (f === 0) continue;
        const step = stepFor(ev, env);
        if (step) {
          fx.spawn(step.effects);
          await sleep(step.duration * f);
        }
      }
      setDisplayHp([finalState.players[0].hp, finalState.players[1].hp]);
    },
    [env, fx, pushLog],
  );

  // 最初の手番開始イベント
  useEffect(() => {
    setLog([]);
    void playEvents(initial.events, initial.state);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initial]);

  const commit = useCallback(
    async (move: Move, fromRemote = false) => {
      setSelected(null);
      setPending(null);
      setBusy(true);
      let res;
      try {
        res = applyMove(r, state, move);
      } catch (e) {
        setNetError(`手を再現できませんでした：${(e as Error).message}`);
        setBusy(false);
        return;
      }
      const plyBefore = appliedRef.current;
      appliedRef.current++;
      if (remote && !fromRemote) {
        submitMove(remote.code, plyBefore, move, res.state.result).catch((e) =>
          setNetError(`手を送れませんでした：${(e as Error).message}（ページを読み込み直すと続きから再開できます）`),
        );
      }
      setHistory((h) => [...h, state]);
      setState(res.state);
      if (move.type === 'move') setLastMove({ from: move.from, to: move.retreat ?? move.to });
      else if (move.type === 'drop') setLastMove({ to: move.to });
      else setLastMove(null);
      await playEvents(res.events, res.state);
      setBusy(false);
    },
    [r, state, playEvents, remote],
  );

  // オンライン：部屋を見張る
  useEffect(() => {
    if (!remote) return;
    return watchRoom(
      remote.code,
      (rm) => setRoom(rm),
      (e) => setNetError(`通信エラー：${e.message}`),
    );
  }, [remote]);

  // オンライン：相手の手（と、途中から開いたときの手）を局面に適用する
  useEffect(() => {
    if (!remote || !room || busy) return;
    const total = room.moves.length;
    if (total > appliedRef.current) {
      // 2手以上遅れていたら、最後の1手以外は演出なしで追いつく
      if (total - appliedRef.current > 1) {
        let s = state;
        try {
          while (appliedRef.current < total - 1) {
            s = applyMove(r, s, room.moves[appliedRef.current], { skipLegalCheck: true }).state;
            appliedRef.current++;
          }
        } catch (e) {
          setNetError(`局面を復元できませんでした：${(e as Error).message}`);
          return;
        }
        setState(s);
        setDisplayHp([s.players[0].hp, s.players[1].hp]);
        return; // 次の描画で最後の1手を演出つきで適用
      }
      void commit(room.moves[appliedRef.current], true);
      return;
    }
    // 投了（手は増えずに終わった）
    if (room.status === 'finished' && room.result && !state.result) {
      const res = resign(state, other(room.result.winner));
      setState(res.state);
      void playEvents(res.events, res.state);
    }
  }, [remote, room, busy, state, r, commit, playEvents]);

  /** 能力の対象を選ぶ必要があれば選ばせてから指す */
  const finalize = (move: Move) => {
    const req = nextChoice(r, state, move);
    if (req) setPending({ kind: 'target', move, request: req });
    else void commit(move);
  };

  const addChoice = (uid: number) => {
    if (pending?.kind !== 'target' || pending.move.type === 'pass') return;
    if (!pending.request.candidates.includes(uid)) return;
    finalize({ ...pending.move, choices: [...(pending.move.choices ?? []), uid] });
  };

  // CPUの手番
  useEffect(() => {
    if (busy || state.result || setup.cpu === null || state.turn !== setup.cpu) return;
    let cancelled = false;
    const t = setTimeout(() => {
      if (cancelled) return;
      const m = chooseMove(r, state, setup.cpuLevel);
      void commit(m);
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [busy, state, setup, r, commit]);

  const isHumanTurn = !state.result && (remote ? state.turn === remote.me : setup.cpu === null || state.turn !== setup.cpu);
  const moves = useMemo(() => (isHumanTurn ? legalMoves(r, state) : []), [r, state, isHumanTurn]);
  const selMoves = useMemo(
    () => (selected === null ? [] : moves.filter((m) => (m.type === 'move' || m.type === 'drop' || m.type === 'swap') && m.uid === selected)),
    [moves, selected],
  );
  const pieceByUid = (uid: number | null) => (uid === null ? undefined : state.pieces.find((p) => p.uid === uid));

  const targetKind = (pos: Pos): 'move' | 'capture' | 'swap' | null => {
    if (pending?.kind === 'target') return null;
    for (const m of selMoves) {
      if ((m.type === 'move' || m.type === 'drop') && samePos(m.to, pos)) {
        const occ = state.pieces.find((p) => p.pos && samePos(p.pos, pos));
        return occ ? 'capture' : 'move';
      }
      if (m.type === 'swap') {
        const w = pieceByUid(m.withUid);
        if (w?.pos && samePos(w.pos, pos)) return 'swap';
      }
    }
    return null;
  };

  const chooseTarget = (pos: Pos) => {
    const options = selMoves.filter((m) => {
      if (m.type === 'swap') return samePos(pieceByUid(m.withUid)?.pos, pos);
      return (m.type === 'move' || m.type === 'drop') && samePos(m.to, pos);
    });
    if (options.length === 0) return false;
    if (options.length === 1) {
      finalize(options[0]);
      return true;
    }
    const promos = new Set(options.map((m) => (m.type === 'move' ? m.promote : false)));
    if (promos.size > 1) setPending({ kind: 'promote', options });
    else setPending({ kind: 'retreat', options });
    return true;
  };

  const onSquare = (pos: Pos) => {
    const occ = state.pieces.find((p) => p.pos && samePos(p.pos, pos));
    if (pending?.kind === 'target') {
      if (occ) addChoice(occ.uid);
      return;
    }
    if (busy || pending) return;
    if (occ) setInspect(occ.uid);
    if (!isHumanTurn) return;
    if (selected !== null && chooseTarget(pos)) return;
    if (occ && occ.owner === state.turn) setSelected(occ.uid === selected ? null : occ.uid);
    else setSelected(null);
  };

  const onHand = (p: PieceState, group: PieceState[]) => {
    setInspect(p.uid);
    if (pending?.kind === 'target') {
      const c = group.find((q) => pending.request.candidates.includes(q.uid));
      if (c) addChoice(c.uid);
      return;
    }
    if (busy || pending || !isHumanTurn || p.owner !== state.turn) return;
    setSelected(p.uid === selected ? null : p.uid);
  };

  const undo = () => {
    if (busy || history.length === 0) return;
    // CPU戦では自分の手番まで戻す
    let h = [...history];
    let prev = h.pop()!;
    while (setup.cpu !== null && prev.turn === setup.cpu && h.length > 0) prev = h.pop()!;
    setHistory(h);
    setState(prev);
    setHideResult(false);
    setDisplayHp([prev.players[0].hp, prev.players[1].hp]);
    setSelected(null);
    setPending(null);
    setLastMove(null);
    fx.clear();
    setLog((l) => [{ id: logId.current++, text: '（1手戻した）', tone: 'system' }, ...l]);
  };

  const doResign = async () => {
    if (busy || state.result) return;
    const me: Player = remote ? remote.me : setup.cpu === null ? state.turn : setup.cpu === 0 ? 1 : 0;
    if (!confirm(`${sideName(me)}が投了しますか？`)) return;
    const res = resign(state, me);
    if (remote) {
      try {
        await resignRoom(remote.code, res.state.result!);
      } catch (e) {
        setNetError(`投了を送れませんでした：${(e as Error).message}`);
        return;
      }
    }
    setState(res.state);
    await playEvents(res.events, res.state);
  };

  const exit = async () => {
    if (remote && !state.result) {
      if (!confirm('対局中です。退出すると投了になります。退出しますか？')) return;
      const res = resign(state, remote.me);
      await resignRoom(remote.code, res.state.result!).catch(() => undefined);
    }
    onExit();
  };

  const playerLabel = (pl: Player) =>
    remote ? `${sideName(pl)}：${remote.names[pl]}${remote.me === pl ? '（あなた）' : ''}` : `${sideName(pl)}${setup.cpu === pl ? '（CPU）' : ''}`;

  // 盤の向き：flipBoard = 後手を下に
  const bottom: Player = flipBoard ? 1 : 0;
  const top: Player = flipBoard ? 0 : 1;
  const rows = Array.from({ length: RANKS }, (_, i) => (flipBoard ? i : RANKS - 1 - i));
  const cols = Array.from({ length: FILES }, (_, i) => (flipBoard ? FILES - 1 - i : i));

  const inspected = pieceByUid(inspect) ?? pieceByUid(selected);
  const selPiece = pieceByUid(selected);

  const choiceSet = new Set(pending?.kind === 'target' ? pending.request.candidates : []);
  const isChoice = (g: PieceState[]) => g.some((q) => choiceSet.has(q.uid));

  const renderHand = (pl: Player) => {
    const hand = handPieces(state, pl);
    const groups = new Map<string, PieceState[]>();
    for (const p of hand) groups.set(p.cardId, [...(groups.get(p.cardId) ?? []), p]);
    const ordered = [...groups.values()].sort((a, b) => '飛角金銀桂香歩'.indexOf(r.db.cards[a[0].cardId].piece) - '飛角金銀桂香歩'.indexOf(r.db.cards[b[0].cardId].piece));
    return (
      <div className={`hand ${state.turn === pl && !state.result ? 'active' : ''}`}>
        <div className="hand-title">{sideName(pl)}の持ち駒</div>
        <div className="hand-pieces">
          {ordered.length === 0 && <div className="hand-empty">なし</div>}
          {ordered.map((g) => {
            const p = g.find((q) => !q.statuses.some((s) => s.kind === 'seal')) ?? g[0];
            const canDrop = moves.some((m) => m.type === 'drop' && m.uid === p.uid);
            return (
              <button
                key={p.uid}
                className={`hand-slot ${selected === p.uid ? 'selected' : ''} ${canDrop ? 'can' : ''} ${isChoice(g) ? 'choose' : ''}`}
                onClick={() => onHand(p, g)}
                onMouseEnter={() => setInspect(p.uid)}
              >
                <PieceView r={r} p={p} flipped={pl === top} small count={g.length} />
                <span className="hand-hp">自傷{r.db.cards[p.cardId].hp}</span>
              </button>
            );
          })}
        </div>
      </div>
    );
  };

  const renderHpBar = (pl: Player) => {
    const ps = state.players[pl];
    const hp = displayHp[pl];
    const ratio = Math.max(0, Math.min(1, hp / ps.maxHp));
    const poisonLeft = ps.poisons.reduce((a, p) => a + p.remaining, 0);
    return (
      <div className={`hpbar ${state.turn === pl && !state.result ? 'active' : ''} side-${pl}`} data-hp={pl}>
        <div className="hp-label">
          <span className="hp-side">
            {playerLabel(pl)}
            {state.turn === pl && !state.result ? <span className="turn-dot">● 手番</span> : null}
          </span>
          <span className="hp-num">
            {Math.max(0, Math.round(hp)).toLocaleString()} / {ps.maxHp.toLocaleString()}
          </span>
        </div>
        <div className="hp-track">
          <div className={`hp-fill ${ratio < 0.25 ? 'low' : ratio < 0.5 ? 'mid' : ''}`} style={{ width: `${ratio * 100}%` }} />
        </div>
        <div className="hp-extra">
          {poisonLeft > 0 && <span className="chip chip-seal">毒 {ps.poisons.map((p) => `${p.amount}×${p.remaining}`).join(' / ')}</span>}
          {ps.nextDropPenalty > 0 && <span className="chip chip-imm">次の自傷+{ps.nextDropPenalty}</span>}
          {ps.captureShields.length > 0 && <span className="chip chip-promo">撃破ダメージ軽減{ps.captureShields[0]}%</span>}
        </div>
      </div>
    );
  };

  return (
    <div className="game" ref={containerRef}>
      <header className="game-header">
        <div className="title-sm">将棋大乱闘</div>
        <div className="turn-info">
          {state.result ? (
            <b>対局終了</b>
          ) : (
            <>
              <b>{sideName(state.turn)}</b>の手番（{state.ply + 1}手目）
              {remote && (state.turn === remote.me ? <span className="your-turn">あなたの番です</span> : <span className="dim">　相手の番です</span>)}
              {busy && <span className="dim">…</span>}
            </>
          )}
          {remote && <span className="dim small">　部屋 {remote.code}</span>}
        </div>
        {netError && (
          <div className="net-error">
            {netError}
            <button className="link-btn" onClick={() => setNetError(null)}>
              閉じる
            </button>
          </div>
        )}
        <div className="header-btns">
          <label className="speed">
            演出
            <select value={speed} onChange={(e) => setSpeed(e.target.value as Speed)}>
              <option value="normal">ふつう</option>
              <option value="fast">はやい</option>
              <option value="instant">なし</option>
            </select>
          </label>
          <button onClick={() => setFlipBoard((f) => !f)}>盤を反転</button>
          {!remote && (
            <button onClick={undo} disabled={busy || history.length === 0}>
              1手戻す
            </button>
          )}
          <button onClick={doResign} disabled={busy || !!state.result}>
            投了
          </button>
          <button onClick={exit}>{remote ? '退出' : 'メニューへ'}</button>
        </div>
      </header>

      <div className="game-main">
        <aside className="col-hands">
          {renderHand(top)}
          {renderHand(bottom)}
        </aside>

        <section className="col-board">
          {renderHpBar(top)}
          <div className={`board-wrap ${fx.shaking ? 'shake' : ''}`}>
            <div className="board">
              {rows.map((y) => (
                <div className="board-row" key={y}>
                  <div className="coord coord-rank">{RANK_KANJI[y]}</div>
                  {cols.map((x) => {
                    const pos = { x, y };
                    const occ = state.pieces.find((p) => p.pos && samePos(p.pos, pos));
                    const tk = targetKind(pos);
                    const campCls = y <= 2 ? 'camp-0' : y >= 6 ? 'camp-1' : '';
                    const isLast = lastMove && (samePos(lastMove.to, pos) || samePos(lastMove.from, pos));
                    return (
                      <div
                        key={x}
                        data-sq={`${x},${y}`}
                        className={`sq ${campCls} ${tk ? 'tgt tgt-' + tk : ''} ${selPiece?.pos && samePos(selPiece.pos, pos) ? 'sel' : ''} ${isLast ? 'last' : ''} ${occ && choiceSet.has(occ.uid) ? 'tgt-choose' : ''}`}
                        onClick={() => onSquare(pos)}
                        onMouseEnter={() => occ && setInspect(occ.uid)}
                      >
                        {occ && <PieceView r={r} p={occ} flipped={occ.owner === top} />}
                        {tk === 'move' && <span className="dot" />}
                      </div>
                    );
                  })}
                </div>
              ))}
              <div className="board-row coord-files">
                <div className="coord coord-rank" />
                {cols.map((x) => (
                  <div key={x} className="coord coord-file">
                    {x + 1}
                  </div>
                ))}
              </div>
            </div>
          </div>
          {renderHpBar(bottom)}
        </section>

        <aside className="col-info">
          <div className="panel detail">
            {inspected ? (
              <CardView r={r} card={r.db.cards[inspected.cardId]} piece={inspected} state={state} />
            ) : (
              <div className="hint">駒にカーソルを合わせるか、クリックするとカードの詳細が出ます。</div>
            )}
          </div>
          <div className="panel log">
            <div className="panel-title">ログ</div>
            <div className="log-lines">
              {log.map((l) => (
                <div key={l.id} className={`log-line tone-${l.tone} ${l.player !== undefined ? 'p' + l.player : ''}`}>
                  {l.text}
                </div>
              ))}
            </div>
          </div>
        </aside>
      </div>

      {pending?.kind === 'target' && (
        <div className="choose-bar">
          <span>{pending.request.prompt}</span>
          <button onClick={() => setPending(null)}>やめる</button>
        </div>
      )}

      {pending && pending.kind !== 'target' && (
        <div className="modal-back">
          <div className="modal">
            {pending.kind === 'promote' ? (
              <>
                <h3>成りますか？</h3>
                <p className="dim">{selPiece ? r.db.cards[selPiece.cardId].special.text : ''}</p>
                <div className="modal-btns">
                  {[true, false].map((pr) => {
                    const opts = pending.options.filter((m) => m.type === 'move' && m.promote === pr);
                    if (opts.length === 0) return null;
                    return (
                      <button
                        key={String(pr)}
                        className={pr ? 'primary' : ''}
                        onClick={() => (opts.length === 1 ? finalize(opts[0]) : setPending({ kind: 'retreat', options: opts }))}
                      >
                        {pr ? '成る（覚醒）' : '成らない'}
                      </button>
                    );
                  })}
                </div>
              </>
            ) : (
              <>
                <h3>ヒット＆アウェイ：斜め後ろへ下がりますか？</h3>
                <div className="modal-btns">
                  {pending.options.map((m, i) => (
                    <button key={i} className={m.type === 'move' && m.retreat ? 'primary' : ''} onClick={() => finalize(m)}>
                      {m.type === 'move' && m.retreat ? `${m.retreat.x + 1}${RANK_KANJI[m.retreat.y]}へ下がる` : 'その場にとどまる'}
                    </button>
                  ))}
                </div>
              </>
            )}
            <button className="link-btn" onClick={() => setPending(null)}>
              やめる
            </button>
          </div>
        </div>
      )}

      {state.result && !busy && !hideResult && (
        <div className="modal-back result-back">
          <div className="modal result">
            <h2>
              {remote ? (state.result.winner === remote.me ? 'あなたの勝ち！' : 'あなたの負け…') : `${sideName(state.result.winner)}の勝ち！`}
            </h2>
            <p>{state.result.detail}</p>
            <div className="modal-btns">
              <button className="primary" onClick={onExit}>
                メニューへ
              </button>
              <button onClick={() => setHideResult(true)}>盤面を見る</button>
              {!remote && (
                <button onClick={undo} disabled={history.length === 0}>
                  1手戻す
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      <EffectLayer items={fx.items} />
    </div>
  );
}
