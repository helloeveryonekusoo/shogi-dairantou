// 未決定ルールの切り替え（GAME_SPEC.md 10章・能力解釈の要確認点）
import type { GameConfig } from '../engine';

type Option<T> = { value: T; label: string };

function Row<T extends string | number | boolean>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: Option<T>[];
  onChange: (v: T) => void;
}) {
  return (
    <label className="setting-row">
      <span>{label}</span>
      <select value={String(value)} onChange={(e) => onChange(options.find((o) => String(o.value) === e.target.value)!.value)}>
        {options.map((o) => (
          <option key={String(o.value)} value={String(o.value)}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}

export function RuleSettings({
  config,
  onChange,
  onClose,
}: {
  config: GameConfig;
  onChange: (c: Partial<GameConfig>) => void;
  onClose: () => void;
}) {
  const set = <K extends keyof GameConfig>(k: K, v: GameConfig[K]) => onChange({ ...config, [k]: v });
  return (
    <div className="modal-back" onClick={onClose}>
      <div className="modal settings" onClick={(e) => e.stopPropagation()}>
        <h3>ルール設定（仮ルールの切り替え）</h3>
        <Row
          label="王手の扱い"
          value={config.allowIgnoringCheck}
          options={[
            { value: true, label: '王手放置もできる（仮ルール）' },
            { value: false, label: '王手放置は禁止（将棋どおり）' },
          ]}
          onChange={(v) => set('allowIgnoringCheck', v)}
        />
        <Row
          label="「隣」の範囲"
          value={config.adjacency}
          options={[
            { value: 'eight', label: '周り8マス' },
            { value: 'four', label: '前後左右の4マス' },
          ]}
          onChange={(v) => set('adjacency', v)}
        />
        <Row
          label="撃破ダメージ軽減の重ねがけ"
          value={config.reductionStacking}
          options={[
            { value: 'additive', label: `足し算（上限${config.reductionCapPct}%）` },
            { value: 'multiplicative', label: 'かけ算' },
          ]}
          onChange={(v) => set('reductionStacking', v)}
        />
        <Row
          label="毒の重ねがけ"
          value={config.poisonStacking}
          options={[
            { value: 'stack', label: '別々に効く' },
            { value: 'refresh', label: '新しい毒で上書き' },
          ]}
          onChange={(v) => set('poisonStacking', v)}
        />
        <Row
          label="同じカードの複数編成"
          value={config.allowDuplicateCards}
          options={[
            { value: false, label: '1枚まで' },
            { value: true, label: '何枚でも' },
          ]}
          onChange={(v) => set('allowDuplicateCards', v)}
        />
        <Row
          label="コスト上限"
          value={config.costCap}
          options={[30, 35, 40, 45, 50, 99].map((n) => ({ value: n, label: String(n) }))}
          onChange={(v) => set('costCap', v)}
        />
        <Row
          label="封印・縦の利きで止まる範囲"
          value={config.sealBlocksSpecial}
          options={[
            { value: true, label: '能力も覚醒・敵陣・リーダーも止まる' },
            { value: false, label: '能力だけ止まる' },
          ]}
          onChange={(v) => set('sealBlocksSpecial', v)}
        />
        <Row
          label="金を敵陣に打ったとき"
          value={config.dropTriggersEnemyCamp}
          options={[
            { value: false, label: '敵陣効果は発動しない' },
            { value: true, label: '敵陣効果が発動する' },
          ]}
          onChange={(v) => set('dropTriggersEnemyCamp', v)}
        />
        <div className="modal-btns">
          <button onClick={() => onChange({})}>初期値に戻す</button>
          <button className="primary" onClick={onClose}>
            閉じる
          </button>
        </div>
      </div>
    </div>
  );
}
