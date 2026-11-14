// 属性の表示名と色。
// カードデータ（cards_v0.1.json）とエンジンの中では 守・攻・妨害 のまま扱い、画面に出すときだけ名前を変える。
import type { Attribute } from '../engine';

export const ATTRIBUTE_DISPLAY: Record<Attribute, { name: string; label: string; color: string }> = {
  守: { name: '神', label: '神属性', color: '#f5c518' },
  攻: { name: '龍', label: '龍属性', color: '#e23b2e' },
  妨害: { name: '魔', label: '魔属性', color: '#9b4de0' },
};

export const attrName = (a: Attribute) => ATTRIBUTE_DISPLAY[a]?.name ?? a;
export const attrLabel = (a: Attribute) => ATTRIBUTE_DISPLAY[a]?.label ?? a;

/** 能力テキストなどの「守属性」「攻属性」「妨害属性」を表示名に置き換える */
export function displayText(text: string | null | undefined): string {
  if (!text) return '';
  return text.replace(/妨害属性/g, '魔属性').replace(/守属性/g, '神属性').replace(/攻属性/g, '龍属性');
}
