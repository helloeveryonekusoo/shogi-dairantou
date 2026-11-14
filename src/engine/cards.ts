// カードデータの読み込みとパーティ編成
import type { CardData, CardDB, PieceKind } from './types';
import type { GameConfig } from './config';

export function loadCardDB(json: { version: string; cards: CardData[] }): CardDB {
  const cards: Record<string, CardData> = {};
  for (const c of json.cards) cards[c.id] = c;
  return { version: json.version, cards, list: json.cards };
}

/** パーティの12枠 */
export const SLOTS = [
  { id: 'king', kind: '王', label: '王' },
  { id: 'rook', kind: '飛', label: '飛' },
  { id: 'bishop', kind: '角', label: '角' },
  { id: 'gold', kind: '金', label: '金' },
  { id: 'silver', kind: '銀', label: '銀' },
  { id: 'knight', kind: '桂', label: '桂' },
  { id: 'lance', kind: '香', label: '香' },
  { id: 'pawn1', kind: '歩', label: '歩1' },
  { id: 'pawn2', kind: '歩', label: '歩2' },
  { id: 'pawn3', kind: '歩', label: '歩3' },
  { id: 'pawn4', kind: '歩', label: '歩4' },
  { id: 'pawn5', kind: '歩', label: '歩5' },
] as const satisfies readonly { id: string; kind: PieceKind; label: string }[];

export type SlotId = (typeof SLOTS)[number]['id'];
export type Party = Record<SlotId, string>;

/** 先手から見た初期配置（x = 筋0..4、y = 段0..8）。後手は点対称 */
export const INITIAL_POSITIONS: Record<SlotId, { x: number; y: number }> = {
  lance: { x: 0, y: 0 },
  silver: { x: 1, y: 0 },
  king: { x: 2, y: 0 },
  gold: { x: 3, y: 0 },
  knight: { x: 4, y: 0 },
  bishop: { x: 1, y: 1 },
  rook: { x: 3, y: 1 },
  pawn1: { x: 0, y: 2 },
  pawn2: { x: 1, y: 2 },
  pawn3: { x: 2, y: 2 },
  pawn4: { x: 3, y: 2 },
  pawn5: { x: 4, y: 2 },
};

export function partyCost(db: CardDB, party: Party): number {
  return SLOTS.reduce((sum, s) => sum + (db.cards[party[s.id]]?.cost ?? 0), 0);
}

export function partyHp(db: CardDB, party: Party): number {
  return SLOTS.reduce((sum, s) => sum + (db.cards[party[s.id]]?.hp ?? 0), 0);
}

/** 編成のチェック。問題があればメッセージを返す（空なら OK） */
export function validateParty(db: CardDB, party: Party, config: GameConfig): string[] {
  const errors: string[] = [];
  const used = new Map<string, number>();
  for (const slot of SLOTS) {
    const card = db.cards[party[slot.id]];
    if (!card) {
      errors.push(`${slot.label}の枠にカードがありません`);
      continue;
    }
    if (card.piece !== slot.kind) errors.push(`${slot.label}の枠に${card.piece}のカード（${card.name}）は入れられません`);
    used.set(card.id, (used.get(card.id) ?? 0) + 1);
  }
  if (!config.allowDuplicateCards) {
    for (const [id, n] of used) if (n > 1) errors.push(`${db.cards[id].name}が${n}枚入っています（同じカードは1枚まで）`);
  }
  const cost = partyCost(db, party);
  if (cost > config.costCap) errors.push(`コストが上限を超えています（${cost} / ${config.costCap}）`);
  return errors;
}

/** すぐ遊べる編成 */
export const PRESET_PARTIES: { name: string; party: Party }[] = [
  {
    name: '攻めの軍団',
    party: {
      king: 'king_03',
      rook: 'rook_01',
      bishop: 'bishop_03',
      gold: 'gold_03',
      silver: 'silver_01',
      knight: 'knight_03',
      lance: 'lance_01',
      pawn1: 'pawn_09',
      pawn2: 'pawn_10',
      pawn3: 'pawn_11',
      pawn4: 'pawn_12',
      pawn5: 'pawn_14',
    },
  },
  {
    name: '守りの軍団',
    party: {
      king: 'king_01',
      rook: 'rook_02',
      bishop: 'bishop_02',
      gold: 'gold_02',
      silver: 'silver_02',
      knight: 'knight_02',
      lance: 'lance_02',
      pawn1: 'pawn_03',
      pawn2: 'pawn_02',
      pawn3: 'pawn_01',
      pawn4: 'pawn_04',
      pawn5: 'pawn_05',
    },
  },
  {
    name: '妨害の軍団',
    party: {
      king: 'king_04',
      rook: 'rook_04',
      bishop: 'bishop_01',
      gold: 'gold_04',
      silver: 'silver_04',
      knight: 'knight_01',
      lance: 'lance_04',
      pawn1: 'pawn_16',
      pawn2: 'pawn_17',
      pawn3: 'pawn_21',
      pawn4: 'pawn_18',
      pawn5: 'pawn_19',
    },
  },
];

/** コスト上限に収まるランダム編成 */
export function randomParty(db: CardDB, config: GameConfig, rand: () => number = Math.random): Party {
  for (let attempt = 0; attempt < 500; attempt++) {
    const party = {} as Party;
    const used = new Set<string>();
    let ok = true;
    for (const slot of SLOTS) {
      const pool = db.list.filter((c) => c.piece === slot.kind && (config.allowDuplicateCards || !used.has(c.id)));
      if (pool.length === 0) {
        ok = false;
        break;
      }
      const card = pool[Math.floor(rand() * pool.length)];
      party[slot.id] = card.id;
      used.add(card.id);
    }
    if (ok && validateParty(db, party, config).length === 0) return party;
  }
  return PRESET_PARTIES[0].party;
}
