// 開発用の局面（npm run dev で http://localhost:5173/#choice のように開く）。ビルドには入らない
import type { GameState } from '../engine';
import { PRESET_PARTIES, createGame } from '../engine';
import { makeRules } from '../data';
import type { GameSetup } from './GameScreen';

export function devScenario(hash: string): GameSetup | null {
  if (hash !== '#choice' && hash !== '#rerender') return null;
  const r = makeRules();
  const parties = [PRESET_PARTIES[2].party, PRESET_PARTIES[1].party] as GameSetup['parties'];
  const s: GameState = createGame(r, parties).state;
  // 先手のゼノン（銀・覚醒で隣の敵1体を行動不能）を敵陣の手前に置き、左右に敵の歩
  const put = (cardId: string, owner: 0 | 1, x: number, y: number) => {
    s.pieces.push({ ...s.pieces[0], uid: s.nextUid++, cardId, owner, originalOwner: owner, pos: { x, y }, statuses: [] });
  };
  s.pieces = s.pieces.filter((p) => !(p.pos && p.pos.y >= 3 && p.pos.y <= 6 && p.pos.x >= 1 && p.pos.x <= 3));
  put('silver_06', 0, 2, 5);
  put('pawn_05', 1, 1, 6);
  put('pawn_07', 1, 3, 6);
  return { parties, cpu: null, cpuLevel: 'normal', initialState: s };
}
