// アカウント（メール＋パスワード）
import { useEffect, useState } from 'react';
import {
  type User,
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signOut,
  updateProfile,
} from 'firebase/auth';
import { auth } from './firebase';

export function useAuth(): { user: User | null; ready: boolean } {
  const [user, setUser] = useState<User | null>(auth.currentUser);
  const [ready, setReady] = useState(false);
  useEffect(
    () =>
      onAuthStateChanged(auth, (u) => {
        setUser(u);
        setReady(true);
      }),
    [],
  );
  return { user, ready };
}

export async function register(email: string, password: string, name: string) {
  const cred = await createUserWithEmailAndPassword(auth, email, password);
  await updateProfile(cred.user, { displayName: name });
  return cred.user;
}

export const login = (email: string, password: string) => signInWithEmailAndPassword(auth, email, password);
export const logout = () => signOut(auth);
export const resetPassword = (email: string) => sendPasswordResetEmail(auth, email);

export async function rename(name: string) {
  if (!auth.currentUser) return;
  await updateProfile(auth.currentUser, { displayName: name });
}

export const displayName = (u: User | null) => u?.displayName || u?.email?.split('@')[0] || 'プレイヤー';

/** Firebase のエラーを日本語に */
export function authErrorText(e: unknown): string {
  const code = (e as { code?: string })?.code ?? '';
  const map: Record<string, string> = {
    'auth/invalid-email': 'メールアドレスの形が正しくありません',
    'auth/email-already-in-use': 'このメールアドレスはすでに登録されています',
    'auth/weak-password': 'パスワードは6文字以上にしてください',
    'auth/invalid-credential': 'メールアドレスかパスワードが違います',
    'auth/wrong-password': 'メールアドレスかパスワードが違います',
    'auth/user-not-found': 'このメールアドレスは登録されていません',
    'auth/too-many-requests': '試行回数が多すぎます。しばらく待ってからもう一度お試しください',
    'auth/network-request-failed': '通信できませんでした。ネットワークを確認してください',
    'auth/operation-not-allowed': 'メール登録がまだ有効になっていません（管理者の設定待ち）',
  };
  return map[code] ?? `エラーが発生しました（${code || String(e)}）`;
}
