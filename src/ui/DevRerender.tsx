// 開発用：親が何度も描き直され setup が作り直される状況（オンラインで手が届くたび）を再現する
// npm run dev → http://localhost:5173/#rerender 。ビルドには入らない
import { useEffect, useState } from 'react';
import type { Rules } from '../engine';
import { GameScreen, type GameSetup } from './GameScreen';

export function DevRerender({ r, setup }: { r: Rules; setup: GameSetup }) {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 300);
    return () => clearInterval(id);
  }, []);
  return (
    <>
      <div data-tick={tick} style={{ position: 'fixed', bottom: 4, left: 4, fontSize: 11, opacity: 0.6, zIndex: 99 }}>
        描き直し {tick} 回
      </div>
      <GameScreen r={r} setup={{ ...setup }} onExit={() => undefined} />
    </>
  );
}
