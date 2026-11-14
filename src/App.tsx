import { useMemo, useState } from 'react';
import type { GameConfig, Party, Player } from './engine';
import { PRESET_PARTIES } from './engine';
import { makeRules } from './data';
import type { CpuLevel } from './ai/cpu';
import { PartyEditor } from './ui/PartyEditor';
import { GameScreen, type GameSetup } from './ui/GameScreen';
import { RuleSettings } from './ui/RuleSettings';
import { AccountScreen } from './ui/AccountScreen';
import { DeckScreen } from './ui/DeckScreen';
import { OnlineLobby } from './ui/OnlineLobby';
import { devScenario } from './ui/devScenarios';
import { displayName, useAuth } from './online/auth';
import { useDecks } from './online/decks';

type Screen = 'title' | 'party' | 'game' | 'account' | 'decks' | 'online';

export function App() {
  const dev = import.meta.env.DEV ? devScenario(location.hash) : null;
  const [screen, setScreen] = useState<Screen>(dev ? 'game' : 'title');
  const [back, setBack] = useState<Screen>('title');
  const [cpu, setCpu] = useState<Player | null>(null);
  const [cpuLevel, setCpuLevel] = useState<CpuLevel>('normal');
  const [parties, setParties] = useState<[Party, Party]>([{ ...PRESET_PARTIES[0].party }, { ...PRESET_PARTIES[1].party }]);
  const [config, setConfig] = useState<Partial<GameConfig>>({});
  const [showSettings, setShowSettings] = useState(false);
  const [setup, setSetup] = useState<GameSetup | null>(dev);
  const { user, ready } = useAuth();
  const { decks } = useDecks(user?.uid ?? null);
  const rules = useMemo(() => makeRules(config), [config]);
  // オンライン対戦は全員同じルールで遊ぶ（ルール設定は使わない）
  const onlineRules = useMemo(() => makeRules(), []);

  const goAccount = (from: Screen) => {
    setBack(from);
    setScreen('account');
  };

  if (screen === 'game' && setup) {
    return <GameScreen r={rules} setup={setup} onExit={() => setScreen('party')} />;
  }
  if (screen === 'account') return <AccountScreen user={user} onBack={() => setScreen(back)} />;
  if (screen === 'decks') return <DeckScreen r={onlineRules} uid={user?.uid ?? null} onBack={() => setScreen('title')} onLogin={() => goAccount('decks')} />;
  if (screen === 'online') return <OnlineLobby r={onlineRules} user={user} onBack={() => setScreen('title')} onLogin={() => goAccount('online')} />;
  if (screen === 'party') {
    return (
      <PartyEditor
        r={rules}
        parties={parties}
        cpu={cpu}
        sources={decks.map((d) => ({ name: d.name, party: d.party }))}
        onChange={setParties}
        onBack={() => setScreen('title')}
        onStart={() => {
          setSetup({ parties, cpu, cpuLevel });
          setScreen('game');
        }}
      />
    );
  }
  const go = (c: Player | null) => {
    setCpu(c);
    setScreen('party');
  };
  return (
    <div className="title-screen">
      <div className="account-chip">
        {!ready ? null : user ? (
          <button onClick={() => goAccount('title')}>👤 {displayName(user)}</button>
        ) : (
          <button onClick={() => goAccount('title')}>ログイン／新規登録</button>
        )}
      </div>
      <div className="title-box">
        <h1>将棋大乱闘</h1>
        <p className="subtitle">5×9の盤で、偉人カードの駒を戦わせる。王を取るか、HPを0にしたら勝ち。</p>
        <div className="title-btns">
          <button className="primary big" onClick={() => setScreen('online')}>
            オンライン対戦
          </button>
          <button className="big" onClick={() => setScreen('decks')}>
            マイデッキ
          </button>
          <button className="big" onClick={() => go(null)}>
            2人で対戦（同じ端末）
          </button>
          <div className="title-row">
            <button className="big" onClick={() => go(1)}>
              CPUと対戦（自分が先手）
            </button>
            <button className="big" onClick={() => go(0)}>
              CPUと対戦（自分が後手）
            </button>
          </div>
        </div>
        <div className="title-opts">
          <label>
            CPUの強さ
            <select value={cpuLevel} onChange={(e) => setCpuLevel(e.target.value as CpuLevel)}>
              <option value="easy">よわい</option>
              <option value="normal">ふつう</option>
            </select>
          </label>
          <button onClick={() => setShowSettings(true)}>ルール設定（ローカル対戦用）</button>
        </div>
        <p className="dim small">カードデータ v{rules.db.version}（{rules.db.list.length}種）</p>
      </div>
      {showSettings && <RuleSettings config={rules.config} onChange={setConfig} onClose={() => setShowSettings(false)} />}
    </div>
  );
}
