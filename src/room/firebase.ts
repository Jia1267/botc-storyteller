// 房间用的 Firebase：只在打开房间页面时才加载（主页面不变大）。
// 这段配置本来就是公开放在网页里的；谁能读写什么由数据库安全规则管（见 room/rules.json）。
import { initializeApp } from 'firebase/app';
import { browserLocalPersistence, indexedDBLocalPersistence, initializeAuth, signInAnonymously } from 'firebase/auth';
import { getDatabase } from 'firebase/database';

const app = initializeApp({
  apiKey: 'AIzaSyDXmMH336s3gQcOxzt6XARfXCohw-tuXrE',
  authDomain: 'shuoshuren-a38f8.firebaseapp.com',
  databaseURL: 'https://shuoshuren-a38f8-default-rtdb.firebaseio.com',
  projectId: 'shuoshuren-a38f8',
  appId: '1:183040243499:web:b28c587e07a3037524f76e',
});

const auth = initializeAuth(app, { persistence: [indexedDBLocalPersistence, browserLocalPersistence] });
export const db = getDatabase(app);

/** 匿名登录：同一台手机同一个浏览器每次都是同一个身份，刷新、锁屏回来还能认出是谁 */
export async function signIn(): Promise<string> {
  await auth.authStateReady();
  if (auth.currentUser) return auth.currentUser.uid;
  return (await signInAnonymously(auth)).user.uid;
}
