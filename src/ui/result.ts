import { circleOrder, isEvil, scriptOf, seatName } from '../engine/core';
import type { ScriptDef } from '../engine/editions';
import { ROLES, TEAM_NAME, roleName, type Team } from '../engine/roles';
import type { GameState } from '../engine/types';
import { EMBLEM } from './Emblem';

/** 游戏在第几夜/第几天结束（取"阵营获胜"那条记录） */
export function endWhen(s: GameState): { n: number; unit: '夜' | '天' } {
  const e = [...s.log].reverse().find((x) => x.text.includes('阵营获胜'));
  return { n: e?.night ?? s.night, unit: e?.phase === 'night' ? '夜' : '天' };
}

/** 关键时刻：按时间排的死亡（同一夜/天合成一条），最后一条是胜负 */
export function keyMoments(s: GameState): { when: string; text: string }[] {
  const byTime = new Map<number, { when: string; texts: string[] }>();
  for (const x of s.seats) {
    if (!x.death) continue;
    const t = x.death.night * 2 + (x.death.when === 'day' ? 1 : 0);
    const it = byTime.get(t) ?? { when: `第 ${x.death.night} ${x.death.when === 'night' ? '夜' : '天'}`, texts: [] };
    it.texts.push(`${seatName(x.n)} ${roleName(x.role)} ${x.death.cause}`);
    byTime.set(t, it);
  }
  const out = [...byTime.entries()].sort((a, b) => a[0] - b[0]).map(([, v]) => ({ when: v.when, text: v.texts.join('；') }));
  const w = endWhen(s);
  out.push({ when: `第 ${w.n} ${w.unit}`, text: `${s.winReason}，${s.winner === 'evil' ? '邪恶' : '善良'}获胜` });
  return out;
}

/* ---------------- 结果图（1080×1350，发群用） ---------------- */

const W = 1080;
const H = 1350;
const SERIF = '"Noto Serif SC", "Songti SC", STSong, serif';
const SANS = 'system-ui, -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif';
const C = { bg: '#110d10', text: '#efe6d8', text2: '#bfb1a1', text3: '#9c8f80', line: '#3b3035', gold: '#d1ad66', good: '#72a0e3', evil: '#e5594e' };

function rrect(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}

function emblem(g: CanvasRenderingContext2D, team: 'good' | 'evil', x: number, y: number, size: number) {
  const col = team === 'evil' ? C.evil : C.good;
  g.save();
  g.translate(x, y);
  g.scale(size / 64, size / 64);
  g.strokeStyle = col;
  g.fillStyle = col;
  g.lineCap = 'round';
  if (team === 'good') {
    g.lineWidth = 2.4;
    g.beginPath();
    g.arc(32, 32, 22.5, 0, Math.PI * 2);
    g.stroke();
    g.stroke(new Path2D(EMBLEM.rays));
    g.fill(new Path2D(EMBLEM.flame));
    g.save();
    g.globalAlpha = 0.45;
    g.fillStyle = '#000';
    g.beginPath();
    g.ellipse(32, 29.6, 2.1, 3.1, 0, 0, Math.PI * 2);
    g.fill();
    g.restore();
    g.globalAlpha = 0.72;
    rrect(g, 28.6, 36, 6.8, 12.5, 1.5);
    g.fill();
  } else {
    // 月蚀：大圆减去偏上的圆
    g.save();
    g.beginPath();
    g.arc(32, 32, 25, 0, Math.PI * 2);
    g.clip();
    g.beginPath();
    g.arc(32, 32, 25, 0, Math.PI * 2);
    g.arc(39, 26, 20.5, 0, Math.PI * 2);
    g.fill('evenodd');
    g.restore();
    g.translate(6, -6);
    g.globalAlpha = 0.85;
    g.lineWidth = 1.9;
    g.stroke(new Path2D(EMBLEM.smoke));
    g.globalAlpha = 0.9;
    g.lineWidth = 1.6;
    g.stroke(new Path2D(EMBLEM.wick));
    g.globalAlpha = 0.72;
    rrect(g, 28.6, 36.5, 6.8, 11.5, 1.5);
    g.fill();
  }
  g.restore();
}

function mark(g: CanvasRenderingContext2D, x: number, y: number, size: number) {
  g.save();
  g.translate(x, y);
  g.scale(size / 64, size / 64);
  g.fillStyle = C.text;
  for (let i = 0; i < 12; i++) {
    const a = ((-90 + i * 30) * Math.PI) / 180;
    g.beginPath();
    g.arc(32 + 25 * Math.cos(a), 32 + 25 * Math.sin(a), 2.7, 0, Math.PI * 2);
    g.fill();
  }
  g.fillStyle = C.gold;
  g.fill(new Path2D(EMBLEM.markFlame));
  g.fillStyle = '#fff3d6';
  g.beginPath();
  g.ellipse(32, 30.8, 2.4, 3.4, 0, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = C.text;
  rrect(g, 28.4, 37.5, 7.2, 11, 1.6);
  g.fill();
  g.restore();
}

/** 行首不能是这些标点：放不下也挂在上一行末尾 */
const NO_START = '，。、；：！？）」』”’》】';

/** 按宽度把中文一个字一个字折行 */
function wrap(g: CanvasRenderingContext2D, text: string, maxW: number): string[] {
  const lines: string[] = [];
  let cur = '';
  for (const ch of text) {
    if (cur && g.measureText(cur + ch).width > maxW && !NO_START.includes(ch)) {
      lines.push(cur);
      cur = ch;
    } else cur += ch;
  }
  if (cur) lines.push(cur);
  return lines;
}

/** 复盘圆桌：阵营色的环保留，死人里面加斜纹、右上角"亡" */
function circle(g: CanvasRenderingContext2D, s: GameState, x: number, y: number, size: number) {
  const seats = circleOrder(s).map((n) => s.seats.find((t) => t.n === n)!);
  const N = seats.length;
  const cx = x + size / 2;
  const cy = y + size / 2;
  const R = size * 0.41;
  const d = Math.min(0.17, ((2 * Math.PI * 0.41) / N) * 0.86) * size;
  g.save();
  g.setLineDash([3, 5]);
  g.strokeStyle = C.line;
  g.lineWidth = 1.5;
  g.beginPath();
  g.arc(cx, cy, size * 0.39, 0, Math.PI * 2);
  g.stroke();
  g.restore();
  const roleFont = Math.min(22, d * 0.3);
  seats.forEach((t, i) => {
    const a = ((-90 + (i * 360) / N) * Math.PI) / 180;
    const tx = cx + R * Math.cos(a);
    const ty = cy + R * Math.sin(a);
    const evil = isEvil(t);
    const dead = !t.alive;
    g.save();
    g.beginPath();
    g.arc(tx, ty, d / 2, 0, Math.PI * 2);
    const fill = g.createRadialGradient(tx - d * 0.15, ty - d * 0.2, 0, tx, ty, d / 2);
    fill.addColorStop(0, '#3a2d31');
    fill.addColorStop(1, '#1c1518');
    g.fillStyle = dead ? '#161113' : fill;
    g.fill();
    if (dead) {
      g.clip();
      g.strokeStyle = '#211a1d';
      g.lineWidth = 5;
      for (let k = -d; k < d; k += 10) {
        g.beginPath();
        g.moveTo(tx - d / 2 + k, ty + d / 2);
        g.lineTo(tx + d / 2 + k, ty - d / 2);
        g.stroke();
      }
    }
    g.restore();
    g.beginPath();
    g.arc(tx, ty, d / 2 - 2, 0, Math.PI * 2);
    g.strokeStyle = evil ? (dead ? 'rgba(229,89,78,.6)' : C.evil) : dead ? 'rgba(114,160,227,.55)' : C.good;
    g.lineWidth = 4;
    g.stroke();
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillStyle = C.text2;
    g.font = `700 ${Math.round(roleFont * 0.78)}px ${SANS}`;
    g.fillText(String(t.n), tx, ty - roleFont * 0.62);
    g.fillStyle = dead ? C.text3 : C.text;
    g.font = `900 ${Math.round(roleFont)}px ${SERIF}`;
    g.fillText(ROLES[t.role].short, tx, ty + roleFont * 0.42);
    if (dead) {
      const bx = tx + d * 0.36;
      const by = ty - d * 0.36;
      g.beginPath();
      g.arc(bx, by, 14, 0, Math.PI * 2);
      g.fillStyle = '#000';
      g.fill();
      g.strokeStyle = '#54454b';
      g.lineWidth = 1.5;
      g.stroke();
      g.fillStyle = C.text2;
      g.font = `700 15px ${SANS}`;
      g.fillText('亡', bx, by + 1);
    }
  });
  const alive = s.seats.filter((t) => t.alive).length;
  g.textAlign = 'center';
  g.fillStyle = C.text;
  g.font = `900 30px ${SERIF}`;
  g.fillText(`${alive} / ${s.seats.length}`, cx, cy - 12);
  g.fillStyle = C.text2;
  g.font = `20px ${SANS}`;
  g.fillText('存活', cx, cy + 22);
  g.textAlign = 'left';
}

/** 画结果图；返回 PNG 的 dataURL（微信里长按能存）和 Blob（系统分享用） */
export async function drawResult(s: GameState): Promise<{ url: string; blob: Blob }> {
  await Promise.all([document.fonts.load(`900 40px "Noto Serif SC"`), document.fonts.load(`600 40px "Noto Serif SC"`)]).catch(() => undefined);
  const cv = document.createElement('canvas');
  cv.width = W;
  cv.height = H;
  const g = cv.getContext('2d')!;
  const team = s.winner === 'evil' ? 'evil' : 'good';
  const col = team === 'evil' ? C.evil : C.good;
  const w = endWhen(s);

  g.fillStyle = C.bg;
  g.fillRect(0, 0, W, H);
  const glow = g.createRadialGradient(W / 2, 0, 0, W / 2, 0, 760);
  glow.addColorStop(0, team === 'evil' ? 'rgba(229,89,78,.17)' : 'rgba(114,160,227,.16)');
  glow.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = glow;
  g.fillRect(0, 0, W, 760);

  // 页眉：记号 + 名字；右边日期、剧本、人数
  mark(g, 72, 60, 52);
  g.textBaseline = 'middle';
  g.fillStyle = C.text;
  g.font = `900 30px ${SERIF}`;
  g.fillText('钟楼说书人', 138, 87);
  const now = new Date(s.endedAt ?? Date.now());
  g.textAlign = 'right';
  g.fillStyle = C.text2;
  g.font = `24px ${SANS}`;
  g.fillText(`${now.getFullYear()}.${now.getMonth() + 1}.${now.getDate()} · ${scriptOf(s).name} · ${s.count} 人`, W - 72, 87);
  g.textAlign = 'left';

  // 胜负
  emblem(g, team, 72, 160, 200);
  g.textBaseline = 'alphabetic';
  g.fillStyle = col;
  g.font = `900 104px ${SERIF}`;
  g.fillText(team === 'evil' ? '邪恶阵营' : '善良阵营', 308, 262);
  g.fillText('获胜', 308, 372);
  g.fillStyle = C.text;
  g.font = `32px ${SANS}`;
  wrap(g, `${s.winReason} · 第 ${w.n} ${w.unit}`, W - 72 - 308)
    .slice(0, 2)
    .forEach((ln, i) => g.fillText(ln, 308, 430 + i * 42));

  // 复盘圆桌 + 图例
  circle(g, s, 72, 510, 560);
  g.textBaseline = 'middle';
  g.font = `21px ${SANS}`;
  let lx = 80;
  for (const [label, c] of [['善良', C.good], ['邪恶', C.evil], ['已死亡', '#54454b']] as const) {
    g.beginPath();
    g.arc(lx + 9, 1094, 9, 0, Math.PI * 2);
    g.strokeStyle = c;
    g.lineWidth = 3;
    g.stroke();
    g.fillStyle = C.text2;
    g.fillText(label, lx + 26, 1095);
    lx += 26 + g.measureText(label).width + 30;
  }

  // 关键时刻（放不下就只留后面的）
  const mx = 676;
  const mw = W - 72 - mx;
  g.textBaseline = 'alphabetic';
  g.fillStyle = C.text;
  g.font = `600 30px ${SERIF}`;
  g.fillText('关键时刻', mx, 560);
  g.font = `24px ${SANS}`;
  const blocks = keyMoments(s).map((m) => ({ when: m.when, lines: wrap(g, m.text, mw) }));
  const hOf = (b: { lines: string[] }) => 30 + b.lines.length * 34 + 22;
  let budget = 1130 - 590;
  const shown: typeof blocks = [];
  for (let i = blocks.length - 1; i >= 0 && budget >= hOf(blocks[i]); i--) {
    shown.unshift(blocks[i]);
    budget -= hOf(blocks[i]);
  }
  let my = 600;
  shown.forEach((b, i) => {
    g.fillStyle = C.text3;
    g.font = `20px ${SANS}`;
    g.fillText(b.when, mx, my + 20);
    g.fillStyle = C.text;
    g.font = `24px ${SANS}`;
    b.lines.forEach((ln, j) => g.fillText(ln, mx, my + 54 + j * 34));
    my += hOf(b);
    if (i < shown.length - 1) {
      g.fillStyle = C.line;
      g.fillRect(mx, my - 12, mw, 1);
    }
  });

  // 页脚：非官方声明 + 网址
  g.fillStyle = C.line;
  g.fillRect(72, 1196, W - 144, 1);
  g.fillStyle = C.text2;
  g.font = `700 20px ${SANS}`;
  g.fillText('非官方工具', 72, 1246);
  const lw = g.measureText('非官方工具').width;
  g.fillStyle = C.text3;
  g.font = `20px ${SANS}`;
  g.fillText('，与任何桌游发行方无关', 72 + lw, 1246);
  g.fillText('由说书人用「钟楼说书人」生成', 72, 1278);
  g.textAlign = 'right';
  g.fillStyle = C.text2;
  g.font = `22px ${SANS}`;
  g.fillText('jia1267.github.io', W - 72, 1246);
  g.fillText('/botc-storyteller', W - 72, 1278);
  g.textAlign = 'left';

  const url = cv.toDataURL('image/png');
  const blob = await new Promise<Blob>((res, rej) => cv.toBlob((b) => (b ? res(b) : rej(new Error('toBlob'))), 'image/png'));
  return { url, blob };
}

/* ---------------- 剧本图（没有现成图片的剧本、自由配板由网页画一张） ---------------- */

/** 按角色表画一张剧本图：四个阵营分段，每个角色一行名字 + 能力。高度按内容算 */
export async function drawScriptSheet(sc: ScriptDef): Promise<{ url: string; blob: Blob }> {
  await Promise.all([document.fonts.load(`900 40px "Noto Serif SC"`), document.fonts.load(`600 40px "Noto Serif SC"`)]).catch(() => undefined);
  const teams: Team[] = ['townsfolk', 'outsider', 'minion', 'demon'];
  const nameW = 210;
  const textX = 72 + nameW;
  const textW = W - 72 - textX;
  // 先量一遍高度
  const probe = document.createElement('canvas').getContext('2d')!;
  probe.font = `26px ${SANS}`;
  const rows = teams.map((t) => ({
    t,
    roles: sc.roles.filter((r) => ROLES[r].team === t).map((r) => ({ r, lines: wrap(probe, ROLES[r].ability, textW) })),
  }));
  const rowH = (n: number) => Math.max(1, n) * 36 + 26;
  let h = 300;
  for (const sec of rows) if (sec.roles.length) h += 86 + sec.roles.reduce((a, x) => a + rowH(x.lines.length), 0);
  h += 150;

  const cv = document.createElement('canvas');
  cv.width = W;
  cv.height = h;
  const g = cv.getContext('2d')!;
  g.fillStyle = C.bg;
  g.fillRect(0, 0, W, h);
  const glow = g.createRadialGradient(W / 2, 0, 0, W / 2, 0, 700);
  glow.addColorStop(0, 'rgba(209,173,102,.14)');
  glow.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = glow;
  g.fillRect(0, 0, W, 700);

  // 页眉
  mark(g, 72, 60, 52);
  g.textBaseline = 'middle';
  g.fillStyle = C.text2;
  g.font = `600 26px ${SERIF}`;
  g.fillText('钟楼说书人 · 剧本', 138, 87);
  g.textBaseline = 'alphabetic';
  g.fillStyle = C.gold;
  g.font = `900 84px ${SERIF}`;
  g.fillText(sc.name, 72, 222);
  g.fillStyle = C.text2;
  g.font = `26px ${SANS}`;
  g.fillText(`${sc.min === sc.max ? sc.min : `${sc.min}–${sc.max}`} 人 · ${sc.roles.length} 个角色`, 72, 268);

  let y = 300;
  for (const sec of rows) {
    if (!sec.roles.length) continue;
    const evil = sec.t === 'minion' || sec.t === 'demon';
    y += 40;
    g.fillStyle = evil ? C.evil : C.good;
    g.font = `900 34px ${SERIF}`;
    g.fillText(TEAM_NAME[sec.t], 72, y + 16);
    g.fillStyle = C.line;
    g.fillRect(72 + g.measureText(TEAM_NAME[sec.t]).width + 20, y + 4, W - 144 - g.measureText(TEAM_NAME[sec.t]).width - 20, 1);
    y += 46;
    for (const x of sec.roles) {
      g.fillStyle = C.text;
      g.font = `900 30px ${SERIF}`;
      g.fillText(roleName(x.r), 72, y + 30);
      g.fillStyle = C.text2;
      g.font = `26px ${SANS}`;
      x.lines.forEach((ln, i) => g.fillText(ln, textX, y + 30 + i * 36));
      y += rowH(x.lines.length);
    }
  }

  // 页脚
  y = h - 104;
  g.fillStyle = C.line;
  g.fillRect(72, y, W - 144, 1);
  g.fillStyle = C.text2;
  g.font = `700 20px ${SANS}`;
  g.fillText('非官方工具', 72, y + 48);
  const lw = g.measureText('非官方工具').width;
  g.fillStyle = C.text3;
  g.font = `20px ${SANS}`;
  g.fillText('，能力是说书人助手的白话转述，以实体规则书为准', 72 + lw, y + 48);
  g.textAlign = 'right';
  g.fillStyle = C.text2;
  g.font = `22px ${SANS}`;
  g.fillText('jia1267.github.io/botc-storyteller', W - 72, y + 82);
  g.textAlign = 'left';

  const url = cv.toDataURL('image/png');
  const blob = await new Promise<Blob>((res, rej) => cv.toBlob((b) => (b ? res(b) : rej(new Error('toBlob'))), 'image/png'));
  return { url, blob };
}
