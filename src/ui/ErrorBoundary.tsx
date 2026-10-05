import { Component, type ReactNode } from 'react';
import { STORE_KEY } from '../store';

/** 万一某一步出错，不要白屏：可以刷新，或者撤销上一步再刷新（存档还在） */
export class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  undoAndReload = () => {
    try {
      const d = JSON.parse(localStorage.getItem(STORE_KEY) ?? 'null');
      if (d?.hist?.length) localStorage.setItem(STORE_KEY, JSON.stringify({ cur: d.hist[d.hist.length - 1], hist: d.hist.slice(0, -1) }));
    } catch {
      /* 存档坏了就只刷新 */
    }
    location.reload();
  };

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <main className="main">
        <div className="stack">
          <h2>这一步出错了</h2>
          <p className="muted">游戏进度已经自动存好了。先试试刷新；还不行就撤销上一步再刷新。</p>
          <button className="btn btn-primary btn-block" onClick={() => location.reload()}>
            刷新
          </button>
          <button className="btn btn-outline btn-block" onClick={this.undoAndReload}>
            撤销上一步并刷新
          </button>
          <p className="dim">错误信息：{this.state.error.message}</p>
        </div>
      </main>
    );
  }
}
