// 能力テキストと、実装上の解釈（構造化データを文章に戻したもの）を並べた表を作る
//   npm run review → docs/ABILITY_REVIEW.md
import { writeFileSync, mkdirSync } from 'node:fs';
import { makeRules } from '../src/data';
import { describeCard, promotedSet, unpromotedSet } from '../src/engine';

const r = makeRules();
const SPECIAL = { leader: 'リーダー', awakening: '覚醒', enemy_camp: '敵陣' } as const;
const esc = (s: string) => s.replace(/\|/g, '｜').replace(/\n/g, ' ');

const lines: string[] = [];
lines.push('# 能力の解釈レビュー表');
lines.push('');
lines.push('`cards_v0.1.json` の能力テキストを、ゲームエンジンでどう解釈して実装したかの一覧です。');
lines.push('「解釈」の列は `src/data/abilities.ts` の構造化データから自動で作っています（`npm run review` で再生成）。');
lines.push('数値はカードのテキストから読んでいるので、JSON の数値を変えるとここにも反映されます。');
lines.push('');

let piece = '';
for (const c of r.db.list) {
  if (c.piece !== piece) {
    piece = c.piece;
    lines.push(`## ${piece}`);
    lines.push('');
    lines.push('| カード | 種類 | テキスト | 解釈 |');
    lines.push('| --- | --- | --- | --- |');
  }
  const d = describeCard(r, c.id);
  const name = `${c.id}<br>${c.name}（${c.rarity}・${c.attribute}）`;
  if (c.ability) lines.push(`| ${name} | 能力 | ${esc(c.ability)} | ${esc(d.ability.join(' / '))} |`);
  lines.push(`| ${c.ability ? '' : name} | ${SPECIAL[c.special.type]} | ${esc(c.special.text)} | ${esc(d.special.join(' / '))} |`);
  const before = unpromotedSet(r, c.id);
  const after = promotedSet(r, c.id);
  if (r.moves[c.id]) {
    lines.push(`| | 動き | ${esc(c.move_before)} ／ ${esc(c.move_after)} | ${esc(before.label)} ／ ${after ? esc(after.label) : '成らない'} |`);
  }
  for (const n of r.abilities[c.id]?.notes ?? []) lines.push(`| | メモ | | ※ ${esc(n)} |`);
  // 節の終わりで空行
  const next = r.db.list[r.db.list.indexOf(c) + 1];
  if (!next || next.piece !== piece) lines.push('');
}

mkdirSync('docs', { recursive: true });
writeFileSync('docs/ABILITY_REVIEW.md', lines.join('\n'), 'utf8');
console.log('docs/ABILITY_REVIEW.md を書き出しました');
