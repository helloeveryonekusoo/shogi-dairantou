// アカウント：新規登録・ログイン・パスワード再設定・名前の変更・ログアウト
import { useState } from 'react';
import type { User } from 'firebase/auth';
import { authErrorText, displayName, login, logout, register, rename, resetPassword } from '../online/auth';

type Mode = 'login' | 'register' | 'reset';

export function AccountScreen({ user, onBack }: { user: User | null; onBack: () => void }) {
  const [mode, setMode] = useState<Mode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  const [newName, setNewName] = useState(displayName(user));

  const run = async (fn: () => Promise<unknown>, okText?: string) => {
    setBusy(true);
    setMsg(null);
    try {
      await fn();
      if (okText) setMsg({ text: okText, ok: true });
    } catch (e) {
      setMsg({ text: authErrorText(e), ok: false });
    } finally {
      setBusy(false);
    }
  };

  if (user) {
    return (
      <div className="simple-screen">
        <header className="screen-head">
          <button onClick={onBack}>← 戻る</button>
          <h2>アカウント</h2>
          <span />
        </header>
        <div className="form-box">
          <p>
            ログイン中：<b>{displayName(user)}</b>
            <br />
            <span className="dim small">{user.email}</span>
          </p>
          <label className="field">
            対戦で表示される名前
            <input value={newName} maxLength={20} onChange={(e) => setNewName(e.target.value)} />
          </label>
          <div className="modal-btns">
            <button disabled={busy || !newName.trim()} onClick={() => run(() => rename(newName.trim()), '名前を変更しました')}>
              名前を変更
            </button>
            <button onClick={() => run(logout)}>ログアウト</button>
          </div>
          {msg && <p className={msg.ok ? 'ok-text' : 'err-text'}>{msg.text}</p>}
        </div>
      </div>
    );
  }

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (mode === 'login') void run(() => login(email.trim(), password));
    else if (mode === 'register') {
      if (!name.trim()) return setMsg({ text: '名前を入れてください', ok: false });
      void run(() => register(email.trim(), password, name.trim()));
    } else void run(() => resetPassword(email.trim()), 'パスワード再設定のメールを送りました');
  };

  return (
    <div className="simple-screen">
      <header className="screen-head">
        <button onClick={onBack}>← 戻る</button>
        <h2>{mode === 'login' ? 'ログイン' : mode === 'register' ? '新規登録' : 'パスワード再設定'}</h2>
        <span />
      </header>
      <form className="form-box" onSubmit={submit}>
        <div className="tabs">
          <button type="button" className={mode === 'login' ? 'on' : ''} onClick={() => setMode('login')}>
            ログイン
          </button>
          <button type="button" className={mode === 'register' ? 'on' : ''} onClick={() => setMode('register')}>
            新規登録（無料）
          </button>
        </div>
        {mode === 'register' && (
          <label className="field">
            名前（対戦相手に表示されます）
            <input value={name} maxLength={20} onChange={(e) => setName(e.target.value)} autoComplete="nickname" />
          </label>
        )}
        <label className="field">
          メールアドレス
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" required />
        </label>
        {mode !== 'reset' && (
          <label className="field">
            パスワード{mode === 'register' ? '（6文字以上）' : ''}
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete={mode === 'register' ? 'new-password' : 'current-password'}
              required
              minLength={6}
            />
          </label>
        )}
        <button className="primary" type="submit" disabled={busy}>
          {mode === 'login' ? 'ログイン' : mode === 'register' ? '登録する' : '再設定メールを送る'}
        </button>
        {mode === 'login' && (
          <button type="button" className="link-btn" onClick={() => setMode('reset')}>
            パスワードを忘れたとき
          </button>
        )}
        {mode === 'reset' && (
          <button type="button" className="link-btn" onClick={() => setMode('login')}>
            ログインに戻る
          </button>
        )}
        {msg && <p className={msg.ok ? 'ok-text' : 'err-text'}>{msg.text}</p>}
      </form>
    </div>
  );
}
