// 開発用：もう一回対戦パネルの各段階の見た目（npm run dev → http://localhost:5173/#rematch）。ビルドには入らない
import type { Rules } from '../engine';
import { PRESET_PARTIES } from '../engine';
import type { Room } from '../online/rooms';
import { RematchPanel } from './OnlineLobby';

export function DevRematchPreview({ r }: { r: Rules }) {
  const party = PRESET_PARTIES[0].party;
  const base: Room = {
    code: 'DEV001', status: 'finished', hostUid: 'me', hostName: '自分', hostParty: party, guestUid: 'opp', guestName: '相手',
    guestParty: party, senteUid: 'me', moves: [], result: { winner: 0, reason: 'king', detail: '先手が王を取った' },
    gameNo: 1, rematchVotes: [], nextParties: {}, declined: null,
  };
  const states: [string, Partial<Room>][] = [
    ['まだ誰も押していない', {}],
    ['相手が押した', { rematchVotes: ['opp'] }],
    ['自分が押した', { rematchVotes: ['me'] }],
    ['2人とも同意 → デッキ選択', { rematchVotes: ['me', 'opp'] }],
    ['自分は選んだ', { rematchVotes: ['me', 'opp'], nextParties: { me: party } }],
    ['相手が退出', { declined: 'opp' }],
  ];
  const options = PRESET_PARTIES.map((p, i) => ({ key: `p:${i}`, name: `（おすすめ）${p.name}`, party: p.party }));
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 16, padding: 16 }}>
      {states.map(([label, patch]) => (
        <div key={label} className="modal result" style={{ maxWidth: 'none' }}>
          <div className="dim small">{label}</div>
          <h2>あなたの勝ち！</h2>
          <RematchPanel r={r} room={{ ...base, ...patch }} uid="me" code="DEV001" options={options} />
        </div>
      ))}
    </div>
  );
}
