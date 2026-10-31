import { StrictMode, Suspense, lazy } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { isRoomCode } from './room/protocol';
import { ErrorBoundary } from './ui/ErrorBoundary';
import './styles.css';

// 房间页面（玩家手机、开房测试）用到 Firebase，按需加载，说书人主页面不变大
const PlayerApp = lazy(() => import('./ui/room/PlayerApp'));
const HostTest = lazy(() => import('./ui/room/HostTest'));

const params = new URLSearchParams(location.search);
const room = params.get('room')?.toUpperCase() ?? null;
const page = isRoomCode(room) ? <PlayerApp code={room} /> : params.has('roomtest') ? <HostTest /> : <App />;

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <Suspense fallback={<p className="dim" style={{ padding: 24 }}>正在打开房间…</p>}>{page}</Suspense>
    </ErrorBoundary>
  </StrictMode>,
);
