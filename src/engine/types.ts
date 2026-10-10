import type { FabledId, RoleId, Team } from './roles';
import type { ScriptId } from './editions';

export interface Seat {
  /** 座位号，从 1 开始，顺时针 */
  n: number;
  role: RoleId;
  /** 开局时的角色（红唇女郎/爪牙变成恶魔后，复盘要用） */
  startRole: RoleId;
  alive: boolean;
  /** sick = 死的时候中毒/醉酒（心上人、理发师、瘟疫医生的能力不触发） */
  death?: { night: number; when: 'night' | 'day'; cause: string; sick?: boolean };
  /** 一次性能力已用（贞洁者、猎手、艺术家、渔夫） */
  used?: boolean;
  /** 旅行者：阵营由说书人定；坐在 after 号的顺时针下一位 */
  traveller?: { alignment: 'good' | 'evil'; after: number };
  /** 旅行者中途离场 */
  left?: boolean;
  /** 阵营和角色类型不一致：赏金猎人的邪恶镇民、理发师换角色后保留原阵营 */
  alignment?: 'good' | 'evil';
}

export type Phase = 'setup' | 'deal' | 'night' | 'day' | 'end';
export type SetupStep = 'script' | 'count' | 'roles' | 'seats';

export type SlotId =
  | 'dusk' | 'minionInfo' | 'demonInfo' | 'poisoner' | 'washerwoman' | 'librarian' | 'investigator'
  | 'chef' | 'empath' | 'fortuneteller' | 'butler' | 'spy' | 'monk' | 'scarletwoman' | 'imp'
  | 'ravenkeeper' | 'undertaker' | 'dawn'
  | 'lunatic' | 'lilmonsta' | 'widow' | 'fearmonger' | 'pixie' | 'chambermaid' | 'vortox'
  | 'duchess' | 'amnesiac' | 'balloonist'
  | 'bureaucrat' | 'thief'
  | 'alchemist' | 'godfather' | 'devilsadvocate' | 'exorcist' | 'zombuul' | 'flowergirl'
  | 'marionette' | 'harpy' | 'stHarpy' | 'stPoisoner' | 'dreamer' | 'seamstress' | 'bountyhunter' | 'general'
  | 'alhadikhia' | 'sweetheart' | 'barber' | 'plaguedoctor'
  | 'sailor' | 'courtier' | 'pukka' | 'grandmother' | 'innkeeper' | 'gambler' | 'shabaloth' | 'po' | 'assassin'
  | 'gossip' | 'professor' | 'tinker' | 'moonchild';

export interface NightState {
  /** 当前所在的夜晚顺序位置 */
  slot: number;
  /** 当前这一步里已经处理完的人（同一个能力可能有两个人，例如食人族） */
  doneActors: number[];
  /** 今晚死亡的座位 */
  deaths: number[];
  /** 今晚僧侣的有效保护（僧侣中毒/酒鬼时为 null） */
  monk: number | null;
  /** 今晚因为自己的能力醒来过的座位（侍女用） */
  woke: number[];
  /** 疯子今晚选的人 */
  lunaticPick: number | null;
  /** 驱魔人选中了恶魔：恶魔今晚不醒 */
  exorcised?: boolean;
  /** 今晚已经走过的步骤（进度条用：用过一次性能力后这一步不会再"该跑"，但已经算一步） */
  ran?: number[];
  /** 旅店老板今晚保护的人（老板健康时） */
  innkeeper?: number[];
  /** 莽夫今晚已经被人选过了 */
  goonHit?: boolean;
  /** 今晚复活的人（天亮宣布） */
  revived?: number[];
  /** 哈迪寂亚今晚选的三个人和他们最后的死活（天亮宣布用） */
  hadikhia?: { picks: number[]; alive: boolean[] };
}

export interface LogEntry {
  night: number;
  phase: 'setup' | 'night' | 'day' | 'end';
  text: string;
  /** 给出去的信息是真是假（复盘时标出来） */
  truth?: 'true' | 'false';
}

export interface GameState {
  v: 1;
  script: ScriptId;
  phase: Phase;
  setupStep: SetupStep;
  count: number;
  seats: Seat[];
  /** 在场的恶魔角色（小怪宝时没有座位扮演它） */
  demonChar: RoleId | null;
  /** 启用的传奇角色 */
  fabled: FabledId[];
  /** 哨兵：外来者 -1 / 0 / +1 */
  sentinelDelta: number;
  /** 酒鬼以为自己是的镇民 */
  drunkFake: RoleId | null;
  /** 疯子以为自己是的恶魔 */
  lunaticFake: RoleId | null;
  /** 失忆者被偷偷定下的能力 */
  amnesiacAbility: RoleId | null;
  /** 中途获得的能力：食人族吃到的、小精灵疯狂成功后得到的 */
  gained: Record<number, RoleId>;
  /** 食人族吃到邪恶而中毒，直到善良被处决死亡 */
  cannibalPoisoned: boolean;
  /** 小精灵第一晚看到的镇民 */
  pixieRole: RoleId | null;
  pixieResolved: boolean;
  /** 寡妇下的毒（寡妇活着一直有效） */
  widowPoison: number | null;
  widowInformed: number | null;
  /** 恐惧之灵的目标；换了新目标天亮要宣布 */
  fearTarget: number | null;
  fearAnnounce: boolean;
  /** 恐惧之灵今天提名的人（每人每天只能提名一次） */
  fearNominated: number | null;
  /** 小怪宝的照看者 */
  babysitter: number | null;
  /** 红唇女郎接手照看，今晚爪牙不能改 */
  babysitterLocked: boolean;
  /** 气球驾驶员已经得知过的类型 */
  balloonShown: Team[];
  klutzResolved: boolean;
  /** 博学者最近一次来访是第几天 */
  savantDay: number;
  /** 公爵夫人今天的拜访者 */
  duchessVisitors: number[];
  /** 被处决的善良玩家数（利维坦） */
  goodExecutions: number;
  /** 明天投票的加成：官员 = 3，窃贼 = -1 */
  voteMods: Record<number, number>;
  /** 枪手最近一次开枪是第几天 */
  gunslingerDay: number;
  /** 炼金术士拥有的爪牙能力 */
  alchemistAbility: RoleId | null;
  /** 教父：外来者 +1 / −1 */
  godfatherDelta: number;
  /** 僵怖第一次死亡后假死：看起来死了，其实还活着 */
  zombuulFake: boolean;
  /** 魔鬼代言人某晚选的人（ok = 当时没中毒，保护有效） */
  advocate: { seat: number; night: number; ok: boolean } | null;
  /** 驱魔人某晚选的人（不能连选） */
  exorcistPick: { seat: number; night: number } | null;
  /** 卖花女孩：恶魔第几天投过票 */
  demonVotedDay: number;
  /** 提线木偶以为自己是的善良角色 */
  marionetteFake: RoleId | null;
  /** 鹰身女妖某晚的选择：mad 要疯狂证明 second 是邪恶的；done = 白天已经处理 */
  harpy: { mad: number; second: number; night: number; done: boolean } | null;
  /** 赏金猎人已经得知过的玩家（最后一个是现在盯着的） */
  bountyKnown: number[];
  /** 心上人死后一直醉酒的人 */
  sweetheartDrunk: number | null;
  sweetheartResolved: boolean;
  barberResolved: boolean;
  /** 瘟疫医生死后说书人获得的爪牙能力 */
  stAbility: RoleId | null;
  plagueResolved: boolean;
  /** 说书人用投毒者能力毒的人 */
  stPoison: { seat: number; night: number } | null;
  /** 报丧女妖被恶魔杀死，能力生效的座位 */
  bansheeActive: number | null;
  /** 戏法师最近一次猜是第几天 */
  alsaahirDay: number;
  /** 醉酒到黄昏（水手、旅店老板、侍臣、吟游诗人、莽夫）：第 from 夜到第 to 天（第 N 天跟在第 N 夜后面） */
  tempDrunk: { seat: number; from: number; to: number; why: string }[];
  /** 祖母的孙子 */
  grandchild: number | null;
  /** 普卡现在毒着的人（下一次普卡行动时死） */
  pukkaPoison: number | null;
  /** 沙巴洛斯上一晚选的人 */
  shabalothLast: number[];
  shabalothNight: number;
  /** 珀上一次没选人：今晚要选三个 */
  poCharged: boolean;
  /** 造谣者的声明是真的那一天 */
  gossipTrueDay: number;
  /** 月之子死后公开选的人（当晚他若是善良的就死） */
  moonchildPick: number | null;
  moonchildResolved: boolean;
  /** 主谋：恶魔被处决后多出来的那一天 */
  mastermindDay: number;
  /** 恶魔的 3 个伪装 */
  bluffs: RoleId[];
  /** 占卜师干扰项 */
  redHerring: number | null;
  /** 配板强度（标准分，正数偏善良） */
  setupZ: number;
  dealIndex: number;
  /** 当前/最近一夜的编号；第 N 天跟在第 N 夜后面 */
  night: number;
  ns: NightState | null;
  poison: { seat: number; night: number } | null;
  butlerMaster: number | null;
  /** 白天变成恶魔、当晚需要被告知的座位（红唇女郎接任） */
  pendingNewDemon: number | null;
  /** 今天：undefined = 还没定，null = 没人被处决，数字 = 被处决的座位 */
  executed: number | null | undefined;
  /** 最近一次处决死亡（给送葬者、食人族） */
  lastExecution: { night: number; seat: number } | null;
  winner: 'good' | 'evil' | null;
  winReason: string;
  /** 真实信息指向某个座位的次数（平衡用） */
  exposure: Record<number, number>;
  infoTrue: number;
  infoFalse: number;
  log: LogEntry[];
  style: 'simple' | 'atmo';
}
