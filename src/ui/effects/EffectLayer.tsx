// 演出の表示レイヤー。GameScreen の上に重ねて置く
import { useCallback, useRef, useState } from 'react';
import type { Anchor, VisualEffect } from './types';

export interface LiveEffect {
  id: number;
  effect: VisualEffect;
  left: number;
  top: number;
}

const LIFETIME: Record<VisualEffect['kind'], number> = { float: 1300, banner: 1600, flash: 600, shake: 400 };

/** 演出を出すためのフック。container の中で anchor の位置を探して表示する */
export function useEffects(container: React.RefObject<HTMLElement | null>) {
  const [items, setItems] = useState<LiveEffect[]>([]);
  const [shaking, setShaking] = useState(false);
  const nextId = useRef(1);

  const locate = useCallback(
    (a: Anchor): { left: number; top: number } => {
      const root = container.current;
      if (!root) return { left: 0, top: 0 };
      const base = root.getBoundingClientRect();
      let el: Element | null = null;
      if ('square' in a) el = root.querySelector(`[data-sq="${a.square.x},${a.square.y}"]`);
      else if ('hp' in a) el = root.querySelector(`[data-hp="${a.hp}"]`);
      if (!el) return { left: base.width / 2, top: base.height / 2 };
      const r = el.getBoundingClientRect();
      return { left: r.left - base.left + r.width / 2, top: r.top - base.top + r.height / 2 };
    },
    [container],
  );

  const spawn = useCallback(
    (effects: VisualEffect[]) => {
      const created: LiveEffect[] = [];
      for (const effect of effects) {
        if (effect.kind === 'shake') {
          setShaking(true);
          setTimeout(() => setShaking(false), LIFETIME.shake);
          continue;
        }
        const pos =
          effect.kind === 'float' ? locate(effect.at) : effect.kind === 'flash' ? locate({ square: effect.square }) : { left: 0, top: 0 };
        // 同じ場所に重なる数字は少しずらす
        const jitter = effect.kind === 'float' ? (Math.random() - 0.5) * 24 : 0;
        created.push({ id: nextId.current++, effect, left: pos.left + jitter, top: pos.top });
      }
      if (created.length === 0) return;
      setItems((prev) => [...prev, ...created]);
      for (const c of created) {
        setTimeout(() => setItems((prev) => prev.filter((p) => p.id !== c.id)), LIFETIME[c.effect.kind]);
      }
    },
    [locate],
  );

  const clear = useCallback(() => setItems([]), []);
  return { items, spawn, shaking, clear };
}

export function EffectLayer({ items }: { items: LiveEffect[] }) {
  const banners = items.filter((i) => i.effect.kind === 'banner').slice(-3);
  return (
    <div className="fx-layer" aria-hidden>
      {items.map((it) => {
        const e = it.effect;
        if (e.kind === 'float') {
          return (
            <div key={it.id} className={`fx-float fx-${e.size ?? 'md'}`} style={{ left: it.left, top: it.top, color: e.color }}>
              {e.text}
            </div>
          );
        }
        if (e.kind === 'flash') {
          return <div key={it.id} className="fx-flash" style={{ left: it.left, top: it.top, background: e.color }} />;
        }
        return null;
      })}
      <div className="fx-banners">
        {banners.map((it) => {
          const e = it.effect;
          if (e.kind !== 'banner') return null;
          return (
            <div key={it.id} className="fx-banner" style={{ borderColor: e.color }}>
              <div className="fx-banner-title" style={{ color: e.color }}>
                {e.title}
              </div>
              {e.text && <div className="fx-banner-text">{e.text}</div>}
            </div>
          );
        })}
      </div>
    </div>
  );
}
