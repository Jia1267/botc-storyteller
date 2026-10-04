import { createContext, useContext, useEffect, useState } from 'react';
import { Icon } from './icons';

export interface TimerState {
  total: number;
  endAt: number | null;
  left: number;
  start(): void;
  pause(): void;
  reset(): void;
  setMinutes(m: number): void;
}

export const TimerCtx = createContext<TimerState>(null!);
export const useTimer = () => useContext(TimerCtx);

/** 讨论计时器：白天页和盖屏共用一个 */
export function useTimerState(): TimerState {
  const [total, setTotal] = useState(300);
  const [endAt, setEndAt] = useState<number | null>(null);
  const [left, setLeft] = useState(300);
  return {
    total,
    endAt,
    left,
    start: () => setEndAt(Date.now() + left * 1000),
    pause: () => {
      if (endAt !== null) setLeft(Math.round((endAt - Date.now()) / 1000));
      setEndAt(null);
    },
    reset: () => {
      setEndAt(null);
      setLeft(total);
    },
    setMinutes: (m: number) => {
      const t = Math.max(1, Math.min(30, m)) * 60;
      setTotal(t);
      setEndAt(null);
      setLeft(t);
    },
  };
}

function fmt(sec: number) {
  const neg = sec < 0;
  const a = Math.abs(Math.round(sec));
  return `${neg ? '+' : ''}${Math.floor(a / 60)}:${String(a % 60).padStart(2, '0')}`;
}

/** 只有这个组件每秒刷新，避免整页重绘 */
export function TimerDisplay({ big = false, controls = true }: { big?: boolean; controls?: boolean }) {
  const t = useTimer();
  const [, tick] = useState(0);
  useEffect(() => {
    if (t.endAt === null) return;
    const id = setInterval(() => tick((x) => x + 1), 250);
    return () => clearInterval(id);
  }, [t.endAt]);
  const remaining = t.endAt !== null ? (t.endAt - Date.now()) / 1000 : t.left;
  return (
    <div className="timer">
      <div className={`t${big ? ' big' : ''}${remaining < 0 ? ' over' : ''}`} role="timer" aria-live="off">
        {fmt(remaining)}
      </div>
      {remaining < 0 && <div className="evil">时间到了</div>}
      {controls && (
        <div className="row" style={{ justifyContent: 'center' }}>
          <button className="icon-btn" aria-label="少一分钟" onClick={() => t.setMinutes(t.total / 60 - 1)}>
            <Icon name="minus" />
          </button>
          <span className="dim">{t.total / 60} 分钟</span>
          <button className="icon-btn" aria-label="多一分钟" onClick={() => t.setMinutes(t.total / 60 + 1)}>
            <Icon name="plus" />
          </button>
          {t.endAt === null ? (
            <button className="btn btn-primary btn-sm" onClick={t.start}>
              <Icon name="play" size={18} /> 开始
            </button>
          ) : (
            <button className="btn btn-ghost btn-sm" onClick={t.pause}>
              <Icon name="pause" size={18} /> 暂停
            </button>
          )}
          <button className="icon-btn" aria-label="重置" onClick={t.reset}>
            <Icon name="reset" />
          </button>
        </div>
      )}
    </div>
  );
}

/** 一键盖屏：变成计时器，别人瞄到也只看到时间 */
export function Cover({ onBack }: { onBack: () => void }) {
  return (
    <div className="cover">
      <button className="icon-btn back" aria-label="返回" onClick={onBack}>
        <Icon name="x" />
      </button>
      <div className="dim">讨论时间</div>
      <TimerDisplay big />
    </div>
  );
}
