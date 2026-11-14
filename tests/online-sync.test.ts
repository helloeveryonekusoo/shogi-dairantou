// オンライン対戦の前提：同じ編成と同じ手の列からは、どの端末でも同じ局面になる
import { describe, expect, it } from 'vitest';
import { applyMove, createGame, legalMoves, nextChoice, positionKey, randomParty } from '../src/engine';
import type { GameState, Move } from '../src/engine';
import { CARD_DB } from '../src/data';
import { rules } from './helpers';

const R = rules();

describe('オンライン同期', () => {
  it('JSONを通した手の列を再生すると同じ局面になる', () => {
    let seed = 777;
    const rand = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
    for (let g = 0; g < 20; g++) {
      const parties = [randomParty(CARD_DB, R.config, rand), randomParty(CARD_DB, R.config, rand)] as const;
      let a: GameState = createGame(R, [parties[0], parties[1]]).state;
      const sent: Move[] = [];
      for (let ply = 0; ply < 200 && !a.result; ply++) {
        const ms = legalMoves(R, a);
        let m = ms[Math.floor(rand() * ms.length)];
        // 対象選びが必要なら、候補からランダムに選ぶ（人が選ぶのと同じ）
        for (let req = nextChoice(R, a, m); req && m.type !== 'pass'; req = nextChoice(R, a, m)) {
          m = { ...m, choices: [...(m.choices ?? []), req.candidates[Math.floor(rand() * req.candidates.length)]] };
        }
        sent.push(JSON.parse(JSON.stringify(m)));
        a = applyMove(R, a, m).state;
      }
      // 相手の端末で再生
      const pj = JSON.parse(JSON.stringify(parties));
      let b: GameState = createGame(R, [pj[0], pj[1]]).state;
      for (const m of sent) b = applyMove(R, b, m).state;
      expect(positionKey(b)).toBe(positionKey(a));
      expect(b.players.map((p) => p.hp)).toEqual(a.players.map((p) => p.hp));
      expect(b.result).toEqual(a.result);
    }
  });
});
