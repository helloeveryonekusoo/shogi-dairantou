// データ（カード・能力・動き）をまとめて、エンジンに渡す Rules を作る
import cardsJson from '../../cards_v0.1.json';
import { loadCardDB } from '../engine/cards';
import { type GameConfig, makeConfig } from '../engine/config';
import type { Rules } from '../engine/rules';
import type { CardData } from '../engine/types';
import { ABILITIES } from './abilities';
import { CARD_MOVES } from './movements';

export const CARD_DB = loadCardDB(cardsJson as { version: string; cards: CardData[] });

export function makeRules(config: Partial<GameConfig> = {}): Rules {
  return { db: CARD_DB, config: makeConfig(config), abilities: ABILITIES, moves: CARD_MOVES };
}
