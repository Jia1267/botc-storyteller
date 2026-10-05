export type Team = 'townsfolk' | 'outsider' | 'minion' | 'demon';

export type RoleId =
  | 'washerwoman' | 'librarian' | 'investigator' | 'chef' | 'empath' | 'fortuneteller'
  | 'undertaker' | 'monk' | 'ravenkeeper' | 'virgin' | 'slayer' | 'soldier' | 'mayor'
  | 'butler' | 'drunk' | 'recluse' | 'saint'
  | 'poisoner' | 'spy' | 'scarletwoman' | 'baron'
  | 'imp'
  // 幽灵茶会 / 窃窃私语
  | 'chambermaid' | 'artist' | 'pixie' | 'cannibal' | 'balloonist' | 'fisherman' | 'savant' | 'amnesiac'
  | 'klutz' | 'lunatic' | 'mutant'
  | 'fearmonger' | 'widow' | 'goblin'
  | 'vortox' | 'lilmonsta' | 'leviathan';

/** 传奇角色：说书人的角色，不发给玩家 */
export type FabledId = 'sentinel' | 'duchess';

export interface RoleDef {
  id: RoleId;
  name: string;
  /** 魔典圆桌上显示的短名 */
  short: string;
  team: Team;
  ability: string;
  tips: string[];
  /** 配板强度：正数帮善良，负数帮邪恶 */
  weight: number;
  /** 作为恶魔伪装的好用程度（越难被拆穿越高），只对善良角色有意义 */
  bluff: number;
  /** 拿信息的角色：酒鬼以为自己是它时会收到假信息 */
  info?: boolean;
}

const R: RoleDef[] = [
  {
    id: 'washerwoman', name: '洗衣妇', short: '洗衣妇', team: 'townsfolk', weight: 1, bluff: 1, info: true,
    ability: '第一晚，你会得知两名玩家中有一人是某个特定的镇民角色。',
    tips: [
      '给他看一个场上真实存在的镇民角色，再指向两名玩家，其中一人就是这个角色。',
      '另一名（干扰项）可以是任何人，包括邪恶玩家。',
      '间谍可以被当成镇民出现在他的信息里。',
      '他中毒或其实是酒鬼时，角色和两个人都可以随便给。',
    ],
  },
  {
    id: 'librarian', name: '图书管理员', short: '图书', team: 'townsfolk', weight: 1, bluff: 1, info: true,
    ability: '第一晚，你会得知两名玩家中有一人是某个特定的外来者角色（或者得知场上没有外来者）。',
    tips: [
      '场上有外来者：给他看一个外来者角色，指向两名玩家，其中一人是这个角色。',
      '场上没有外来者：比"0"（握拳），表示没有外来者。',
      '酒鬼是外来者，可以直接给他看"酒鬼"。间谍可以被当成外来者。',
    ],
  },
  {
    id: 'investigator', name: '调查员', short: '调查员', team: 'townsfolk', weight: 1.5, bluff: 1, info: true,
    ability: '第一晚，你会得知两名玩家中有一人是某个特定的爪牙角色。',
    tips: [
      '给他看一个场上的爪牙角色，指向两名玩家，其中一人就是那个爪牙。',
      '干扰项通常选一名善良玩家，他会背上嫌疑。',
      '陌客可以被当成爪牙出现在他的信息里。',
    ],
  },
  {
    id: 'chef', name: '厨师', short: '厨师', team: 'townsfolk', weight: 1, bluff: 1, info: true,
    ability: '第一晚，你会得知场上有多少对邪恶玩家相邻而坐。',
    tips: [
      '绕桌一圈数：两个邪恶玩家挨着坐算一对，三个连着坐算两对。',
      '用手指比出数字。',
      '间谍可能被算作善良，陌客可能被算作邪恶，网页会把每种算法列出来。',
    ],
  },
  {
    id: 'empath', name: '共情者', short: '共情', team: 'townsfolk', weight: 2, bluff: 1, info: true,
    ability: '每晚，你会得知你左右两边最近的两名存活玩家中有几个是邪恶的。',
    tips: [
      '只看左右两边"最近的存活玩家"，死人直接跳过。',
      '每晚都会醒，用手指比 0、1 或 2。',
      '间谍可能被算作善良，陌客可能被算作邪恶。',
    ],
  },
  {
    id: 'fortuneteller', name: '占卜师', short: '占卜', team: 'townsfolk', weight: 2, bluff: 1, info: true,
    ability: '每晚，你选择两名玩家，得知其中是否有恶魔。有一名善良玩家会一直被你当成恶魔（干扰项）。',
    tips: [
      '他指两个人，你点头（有恶魔）或摇头（没有）。',
      '开局定好的干扰项也会让他得到"有"。',
      '陌客可能被当成恶魔。',
    ],
  },
  {
    id: 'undertaker', name: '送葬者', short: '送葬', team: 'townsfolk', weight: 1.5, bluff: 1.5, info: true,
    ability: '每晚（第一晚除外），你会得知今天白天被处决死亡的玩家的角色。',
    tips: [
      '只有白天有人被处决并死亡，当晚才叫醒他。',
      '给他看被处决者的角色；被处决的是酒鬼，就给他看"酒鬼"。',
      '间谍可能显示成善良角色，陌客可能显示成爪牙或恶魔。',
    ],
  },
  {
    id: 'monk', name: '僧侣', short: '僧侣', team: 'townsfolk', weight: 1.5, bluff: 2,
    ability: '每晚（第一晚除外），你选择一名其他玩家：今晚恶魔杀不死他。',
    tips: [
      '第一晚不叫醒。他指一个人（不能指自己）。',
      '僧侣中毒或其实是酒鬼时，保护无效。',
    ],
  },
  {
    id: 'ravenkeeper', name: '守鸦人', short: '守鸦', team: 'townsfolk', weight: 1.5, bluff: 2, info: true,
    ability: '如果你在夜里死亡，你会被唤醒，选择一名玩家并得知他的角色。',
    tips: [
      '只在他夜里死掉的那一晚叫醒他。',
      '他指一个人，你给他看那个人的角色。',
      '中毒或其实是酒鬼时，可以给任意角色。',
    ],
  },
  {
    id: 'virgin', name: '贞洁者', short: '贞洁', team: 'townsfolk', weight: 1.5, bluff: 0,
    ability: '你第一次被提名时，如果提名你的人是镇民，他会立刻被处决。',
    tips: [
      '第一次被提名就触发：提名者是镇民，提名者立刻被处决，今天的处决就此结束。',
      '提名者是外来者、爪牙或恶魔：什么都不发生，但能力已经用掉。',
      '间谍提名时可以被当成镇民。酒鬼是外来者，提名不会触发。',
    ],
  },
  {
    id: 'slayer', name: '猎手', short: '猎手', team: 'townsfolk', weight: 1.5, bluff: 0,
    ability: '整局一次，白天你可以公开选择一名玩家：如果他是恶魔，他死亡。',
    tips: [
      '任何人都可以宣称自己是猎手并开枪，只有真猎手在健康时开枪才有效。',
      '目标是恶魔，恶魔就死；否则什么都不发生。',
      '陌客可能被当成恶魔而被射死。',
    ],
  },
  {
    id: 'soldier', name: '士兵', short: '士兵', team: 'townsfolk', weight: 1, bluff: 2,
    ability: '恶魔杀不死你。',
    tips: ['恶魔夜里选中他，他不会死。', '他中毒或其实是酒鬼时，照样会被杀死。'],
  },
  {
    id: 'mayor', name: '镇长', short: '镇长', team: 'townsfolk', weight: 1.5, bluff: 1.5,
    ability: '如果只剩三名玩家存活且当天没有人被处决，善良阵营获胜。你在夜里被杀时，可能会有另一名玩家替你死亡。',
    tips: [
      '只剩 3 人存活、当天又没有人被处决：善良获胜。',
      '恶魔夜里选中他时，你可以让别人替他死，也可以就让他死。',
    ],
  },
  {
    id: 'butler', name: '管家', short: '管家', team: 'outsider', weight: -0.5, bluff: 1,
    ability: '每晚，你选择一名其他玩家作为主人：第二天只有主人投票时，你才可以投票。',
    tips: ['每晚叫醒他选一个主人（不能选自己）。', '投票限制靠他自己遵守，你留意一下就行。'],
  },
  {
    id: 'drunk', name: '酒鬼', short: '酒鬼', team: 'outsider', weight: -1.5, bluff: 0,
    ability: '你不知道自己是酒鬼。你以为自己是某个镇民，但你的能力不会生效。',
    tips: [
      '他以为自己是一个不在场的镇民。夜里按那个角色叫醒他，给的信息可以是假的。',
      '他的能力完全无效。千万别让他发现自己是酒鬼。',
    ],
  },
  {
    id: 'recluse', name: '陌客', short: '陌客', team: 'outsider', weight: -1, bluff: 1,
    ability: '你可能会被当成邪恶阵营、爪牙或恶魔，即使你已死亡。',
    tips: [
      '每次有人"查验"他时，由你决定要不要把他当成邪恶。',
      '常见用法：让占卜师查到"有恶魔"，或让调查员看到他是爪牙。',
    ],
  },
  {
    id: 'saint', name: '圣徒', short: '圣徒', team: 'outsider', weight: -1, bluff: 1.5,
    ability: '如果你被处决，你所在的阵营（善良）落败。',
    tips: ['被处决时邪恶立刻获胜（他中毒时除外）。', '夜里被恶魔杀死不会触发。'],
  },
  {
    id: 'poisoner', name: '投毒者', short: '投毒', team: 'minion', weight: -3, bluff: 0,
    ability: '每晚，你选择一名玩家：他今晚和明天白天中毒。',
    tips: [
      '中毒的人能力失效，拿到的信息可以是假的。',
      '投毒者死了，中毒立刻解除。',
    ],
  },
  {
    id: 'spy', name: '间谍', short: '间谍', team: 'minion', weight: -2, bluff: 0,
    ability: '每晚，你可以查看魔典。你可能会被当成善良阵营、镇民或外来者，即使你已死亡。',
    tips: ['每晚点"给间谍看"，把只读魔典给他看。', '每次有人查验他时，由你决定要不要把他当成善良。'],
  },
  {
    id: 'scarletwoman', name: '红唇女郎', short: '红唇', team: 'minion', weight: -2, bluff: 0,
    ability: '如果恶魔死亡时还有五名或更多玩家存活，你变成恶魔。',
    tips: [
      '恶魔死亡的那一刻，存活人数（算上刚死的恶魔）≥ 5，她就变成小恶魔，游戏继续。',
      '变身后当晚叫醒她，告诉她"你现在是小恶魔"。',
    ],
  },
  {
    id: 'baron', name: '男爵', short: '男爵', team: 'minion', weight: -1, bluff: 0,
    ability: '场上会多出两名外来者。',
    tips: ['配板时多两个外来者、少两个镇民（网页自动调整）。', '之后没有任何行动。'],
  },
  {
    id: 'imp', name: '小恶魔', short: '小恶魔', team: 'demon', weight: 0, bluff: 0,
    ability: '每晚（第一晚除外），你选择一名玩家：他死亡。如果你选择自己，你死亡，并由一名爪牙变成小恶魔。',
    tips: [
      '第一晚不杀人。',
      '指自己（自杀）：他死，一名爪牙变成新的小恶魔，当晚就叫醒新恶魔告诉他。',
      '恶魔中毒时杀人无效。',
    ],
  },

  /* ---------- 幽灵茶会 / 窃窃私语 ---------- */
  {
    id: 'chambermaid', name: '侍女', short: '侍女', team: 'townsfolk', weight: 1.5, bluff: 1, info: true,
    ability: '每晚，你选择除你以外的两名存活玩家，得知他们之中今晚有几人因为自己的能力醒来过。',
    tips: [
      '她指两个人（不能指自己），你用手指比出这两人今晚有几个因为自己的能力醒过。',
      '她在夜里很靠后才醒，网页会自动统计今晚谁醒过。疯子以为自己是恶魔而醒来，也算醒过。',
    ],
  },
  {
    id: 'artist', name: '艺术家', short: '艺术家', team: 'townsfolk', weight: 1.5, bluff: 1,
    ability: '整局一次，白天你可以私下问说书人一个是非题，并得到答案。',
    tips: [
      '他白天私下来找你，问一个能用"是/否"回答的问题。',
      '他健康时必须如实回答；中毒或醉酒时可以说假话；涡流在场时必须说假话。',
    ],
  },
  {
    id: 'pixie', name: '小精灵', short: '小精灵', team: 'townsfolk', weight: 1, bluff: 1, info: true,
    ability: '第一晚，你会得知一个在场的镇民角色。如果你"疯狂"地证明自己就是这个角色，那名玩家死亡时你会获得这个角色的能力。',
    tips: [
      '第一晚给他看一个在场的镇民角色名（不能是他自己）。',
      '之后他要一直公开坚持自己就是那个角色（疯狂）。那名玩家死亡时，网页会问你他有没有做到，做到了就获得能力。',
    ],
  },
  {
    id: 'cannibal', name: '食人族', short: '食人族', team: 'townsfolk', weight: 1.5, bluff: 1,
    ability: '你拥有最近一个被处决死亡的玩家的能力。如果那名玩家是邪恶的，你会中毒，直到下一个善良玩家被处决死亡。',
    tips: [
      '每次有人被处决死亡，他就换成那个人的能力。他不会被告知是什么能力，要自己推断。',
      '吃到邪恶玩家：他中毒，你按一个假的善良能力叫醒他，直到下一个善良玩家被处决死亡。',
      '网页会自动跟踪他现在的能力，并在夜里那个能力的位置叫醒他。',
    ],
  },
  {
    id: 'balloonist', name: '气球驾驶员', short: '气球', team: 'townsfolk', weight: 1.5, bluff: 1, info: true,
    ability: '每晚，你会得知一名玩家，他的角色类型和你之前得知过的都不同，直到场上每种角色类型你都得知过一次。[+1 外来者]',
    tips: [
      '每晚用手指向一名玩家，他的类型（镇民/外来者/爪牙/恶魔）不能和之前指过的重复。',
      '每种类型都指过以后，就不再叫醒他。',
      '配板时多一个外来者，网页自动调整。',
    ],
  },
  {
    id: 'fisherman', name: '渔夫', short: '渔夫', team: 'townsfolk', weight: 1, bluff: 1,
    ability: '整局一次，白天你可以找说书人，得到一条帮助你的阵营获胜的建议。',
    tips: ['建议要真的有帮助，但别直接说出谁是恶魔。', '网页会按当前局势给你几条建议参考。'],
  },
  {
    id: 'savant', name: '博学者', short: '博学者', team: 'townsfolk', weight: 2, bluff: 1,
    ability: '每个白天，你可以私下找说书人得知两条信息：一条是真的，一条是假的。',
    tips: [
      '每天最多一次。两条信息一真一假，不告诉他哪条是真的。',
      '网页会按魔典生成几组"一真一假"，你挑一组念。他中毒或醉酒时，两条都可以是假的。',
    ],
  },
  {
    id: 'amnesiac', name: '失忆者', short: '失忆', team: 'townsfolk', weight: 1, bluff: 1,
    ability: '你不知道自己的能力是什么。每个白天你可以私下猜一次，说书人会告诉你猜得有多准。',
    tips: [
      '开局时由你偷偷给他定一个能力（网页提供清单）。',
      '他的能力需要在夜里醒时，网页会在失忆者那一步叫醒他。',
      '他每天来猜一次，你按"完全正确 / 非常接近 / 有点接近 / 差得远"回答。',
    ],
  },
  {
    id: 'klutz', name: '呆瓜', short: '呆瓜', team: 'outsider', weight: -1, bluff: 1,
    ability: '当你得知自己死亡时，你要公开选择一名存活玩家：如果他是邪恶的，你的阵营落败。',
    tips: ['他死了以后（天亮宣布或被处决时），让他立刻公开选一名存活玩家。', '选到邪恶玩家，善良直接输。'],
  },
  {
    id: 'lunatic', name: '疯子', short: '疯子', team: 'outsider', weight: -0.5, bluff: 1,
    ability: '你以为自己是恶魔，但其实不是。真正的恶魔知道你是谁，也知道你每晚选了谁。',
    tips: [
      '发身份时给他看恶魔角色（小怪宝在场时给他看涡流）。',
      '他夜里"杀"的人不会死。',
      '真恶魔会被告知疯子是谁、每晚选了谁（小怪宝在场时告诉爪牙们）。',
    ],
  },
  {
    id: 'mutant', name: '畸形秀演员', short: '畸形秀', team: 'outsider', weight: -0.5, bluff: 1,
    ability: '如果你"疯狂"地证明自己是外来者，你可能会被处决。',
    tips: ['他公开说自己是外来者，就算"疯狂"了。', '你可以当场处决他（算当天的处决），也可以放过。'],
  },
  {
    id: 'fearmonger', name: '恐惧之灵', short: '恐惧', team: 'minion', weight: -2, bluff: 0,
    ability: '每晚，你选择一名玩家：如果你提名他并且他被处决，他的阵营落败。你第一次选择或更换目标时，所有玩家都会得知。',
    tips: [
      '每晚记下他选的目标。他第一次选或换了新目标，天亮时公开说"恐惧之灵选择了一名新的目标"（不说是谁）。',
      '他提名自己的目标、对方又被处决：那名玩家所在的阵营直接输。',
    ],
  },
  {
    id: 'widow', name: '寡妇', short: '寡妇', team: 'minion', weight: -2.5, bluff: 0,
    ability: '第一晚，你可以查看魔典并选择一名玩家：他中毒。之后会有一名善良玩家得知寡妇在场。',
    tips: ['第一晚给她看只读魔典，她选一人中毒（寡妇活着就一直中毒）。', '然后叫醒一名善良玩家，告诉他"寡妇在场"。'],
  },
  {
    id: 'goblin', name: '哥布林', short: '哥布林', team: 'minion', weight: -1.5, bluff: 0,
    ability: '如果你被提名时公开声称自己是哥布林，并且当天被处决，你的阵营获胜。',
    tips: ['处决他时问一句：他被提名时有没有公开说自己是哥布林？说了，邪恶获胜。'],
  },
  {
    id: 'vortox', name: '涡流', short: '涡流', team: 'demon', weight: -2, bluff: 0,
    ability: '每晚（第一晚除外），你选择一名玩家：他死亡。镇民的能力只会给出错误信息。如果某个白天没有人被处决，邪恶阵营获胜。',
    tips: [
      '涡流在场时，所有镇民拿到的信息都必须是假的，网页只给假选项。',
      '某天没人被处决，邪恶直接获胜。',
    ],
  },
  {
    id: 'lilmonsta', name: '小怪宝', short: '小怪宝', team: 'demon', weight: -1, bluff: 0,
    ability: '每晚，所有爪牙秘密决定由谁照看小怪宝，那名玩家被当作恶魔。每晚（第一晚除外），会有一名玩家死亡。[+1 爪牙]',
    tips: [
      '开局没有人是恶魔，多一个爪牙。',
      '每晚叫醒所有爪牙，让他们指出由谁照看小怪宝（只能是爪牙）。',
      '每晚（第一晚除外）由你决定谁死，不能是照看者。',
      '照看者死亡，善良获胜；红唇女郎存活且存活人数 ≥5 时由她接手照看。',
    ],
  },
  {
    id: 'leviathan', name: '利维坦', short: '利维坦', team: 'demon', weight: -1.5, bluff: 0,
    ability: '所有玩家都知道利维坦在场。如果超过一名善良玩家被处决，邪恶阵营获胜。第五个白天结束时，邪恶阵营获胜。',
    tips: ['第一个天亮时公开宣布"利维坦在场"。', '他晚上不杀人。', '第 2 个善良玩家被处决，或第 5 天结束，邪恶获胜。'],
  },
];

export interface FabledDef {
  id: FabledId;
  name: string;
  ability: string;
}

export const FABLED: Record<FabledId, FabledDef> = {
  sentinel: { id: 'sentinel', name: '哨兵', ability: '开局时，外来者可能会多一个或少一个。' },
  duchess: {
    id: 'duchess',
    name: '公爵夫人',
    ability: '每个白天，最多三名玩家可以一起拜访说书人。当晚（第一晚除外），每名拜访者会得知拜访者中有几个是邪恶的，但其中一人得到的数字是错的。',
  },
};

export const ROLES: Record<RoleId, RoleDef> = Object.fromEntries(R.map((r) => [r.id, r])) as Record<RoleId, RoleDef>;
export const ROLE_LIST = R;

export const TEAM_NAME: Record<Team, string> = {
  townsfolk: '镇民',
  outsider: '外来者',
  minion: '爪牙',
  demon: '恶魔',
};

export const rolesOfTeam = (t: Team): RoleId[] => R.filter((r) => r.team === t).map((r) => r.id);
export const isEvilTeam = (t: Team) => t === 'minion' || t === 'demon';
export const roleName = (id: RoleId) => ROLES[id].name;
