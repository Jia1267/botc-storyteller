import { useCallback, useEffect, useState } from 'react';
import { clone } from './engine/core';
import { newGame } from './engine/setup';
import { seeded, type Rng } from './engine/rng';
import type { GameState } from './engine/types';

const KEY = 'botc-storyteller-v1';
export const STORE_KEY = KEY;
const MAX_HISTORY = 300;

interface Saved {
  cur: GameState;
  hist: GameState[];
}

/** 老版本的存档（只有暗流涌动）补上新字段 */
function migrate(x: GameState): GameState {
  const base = newGame();
  return {
    ...base,
    ...x,
    script: x.script ?? 'tb',
    demonChar: x.demonChar ?? (x.seats.length ? 'imp' : null),
    gained: x.gained ?? {},
    ns: x.ns ? { ...{ doneActors: [], woke: [], lunaticPick: null }, ...x.ns } : null,
  };
}

function load(): Saved | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const d = JSON.parse(raw) as Saved;
    if (d?.cur?.v !== 1) return null;
    return { cur: migrate(d.cur), hist: d.hist.map(migrate) };
  } catch {
    return null;
  }
}

function save(d: Saved) {
  try {
    localStorage.setItem(KEY, JSON.stringify(d));
  } catch {
    /* 存不下就算了，不影响本局继续 */
  }
}

/** 游戏状态 + 撤销 + 自动存档（刷新/锁屏/没电后回到原来那一步） */
export function useGame() {
  const [data, setData] = useState<Saved>(() => load() ?? { cur: newGame(), hist: [] });

  useEffect(() => save(data), [data]);

  /** 每次改动都存一份旧状态，用来撤销 */
  const commit = useCallback((fn: (s: GameState) => void) => {
    setData((d) => {
      const next = clone(d.cur);
      fn(next);
      return { cur: next, hist: [...d.hist.slice(-(MAX_HISTORY - 1)), d.cur] };
    });
  }, []);

  /** 不进撤销历史的改动（例如切换台词风格） */
  const tweak = useCallback((fn: (s: GameState) => void) => {
    setData((d) => {
      const next = clone(d.cur);
      fn(next);
      return { cur: next, hist: d.hist };
    });
  }, []);

  const undo = useCallback(() => {
    setData((d) => (d.hist.length ? { cur: d.hist[d.hist.length - 1], hist: d.hist.slice(0, -1) } : d));
  }, []);

  const reset = useCallback(() => {
    setData((d) => ({ cur: { ...newGame(), style: d.cur.style }, hist: [] }));
  }, []);

  return { s: data.cur, canUndo: data.hist.length > 0, commit, tweak, undo, reset };
}

export type Game = ReturnType<typeof useGame>;

/** 每一步的推荐用固定种子：刷新页面后推荐不会变 */
export function stepRng(s: GameState, extra = 0): Rng {
  return seeded(s.log.length * 7919 + s.night * 131 + (s.ns?.slot ?? 0) * 17 + extra);
}
