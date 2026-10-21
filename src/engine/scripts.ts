import { seatName } from './core';
import type { SlotId } from './types';

/** 一步的台词：simple = 简洁标准，atmo = 氛围旁白 */
type Lines = { simple: string[]; atmo: string[] };

export const SLOT_TITLE: Record<SlotId, string> = {
  dusk: '入夜',
  minionInfo: '爪牙互认',
  demonInfo: '恶魔得知爪牙与伪装',
  poisoner: '投毒者',
  washerwoman: '洗衣妇',
  librarian: '图书管理员',
  investigator: '调查员',
  chef: '厨师',
  empath: '共情者',
  fortuneteller: '占卜师',
  butler: '管家',
  spy: '间谍',
  monk: '僧侣',
  scarletwoman: '红唇女郎接任',
  imp: '小恶魔',
  ravenkeeper: '守鸦人',
  undertaker: '送葬者',
  dawn: '天亮',
  lunatic: '疯子',
  lilmonsta: '小怪宝：爪牙选照看者',
  widow: '寡妇',
  fearmonger: '恐惧之灵',
  pixie: '小精灵',
  chambermaid: '侍女',
  vortox: '涡流',
  duchess: '公爵夫人的拜访者',
  amnesiac: '失忆者',
  balloonist: '气球驾驶员',
  bureaucrat: '官员（旅行者）',
  thief: '窃贼（旅行者）',
  alchemist: '炼金术士',
  godfather: '教父',
  devilsadvocate: '魔鬼代言人',
  exorcist: '驱魔人',
  zombuul: '僵怖',
  flowergirl: '卖花女孩',
  marionette: '恶魔得知提线木偶',
  harpy: '鹰身女妖',
  stHarpy: '说书人的鹰身女妖能力',
  stPoisoner: '说书人的投毒者能力',
  dreamer: '筑梦师',
  seamstress: '女裁缝',
  bountyhunter: '赏金猎人',
  general: '将军',
  alhadikhia: '哈迪寂亚',
  sweetheart: '心上人死了：选一人醉酒',
  barber: '理发师死了：恶魔换角色',
  plaguedoctor: '瘟疫医生死了：你获得能力',
  sailor: '水手',
  courtier: '侍臣',
  pukka: '普卡',
  grandmother: '祖母',
  innkeeper: '旅店老板',
  gambler: '赌徒',
  shabaloth: '沙巴洛斯',
  po: '珀',
  assassin: '刺客',
  gossip: '造谣者的声明成真：选一人死亡',
  professor: '教授',
  tinker: '修补匠',
  moonchild: '月之子的选择',
  clockmaker: '钟表匠',
  snakecharmer: '舞蛇人',
  mathematician: '数学家',
  towncrier: '城镇公告员',
  oracle: '神谕者',
  philosopher: '哲学家',
  juggler: '杂耍艺人',
  sage: '贤者',
  eviltwin: '镜像双子互认',
  witch: '女巫',
  cerenovus: '洗脑师',
  pithag: '麻脸巫婆',
  fanggu: '方古',
  nodashii: '诺-达鲺',
  vigormortis: '亡骨魔',
  steward: '事务官',
  knight: '骑士',
  noble: '贵族',
  shugenja: '修行者',
  highpriestess: '女祭司',
  king: '国王',
  choirboy: '唱诗男孩',
  nightwatchman: '守夜人',
  farmer: '农夫死了：一人变成农夫',
  acrobat: '杂技演员',
  preacher: '传教士',
  poppygrower: '罂粟种植者死了：邪恶互认',
  huntsman: '巡山人',
  damsel: '爪牙得知落难少女在场',
  snitch: '告密者：爪牙得到伪装',
  ogre: '食人魔',
  hatter: '帽匠死了：邪恶换角色',
  qutler: 'Q宝',
  boffin: '科学怪人：恶魔得知善良能力',
  wizard: '巫师',
  organgrinder: '街头风琴手',
  mezepheles: '灵言师',
  ojo: '奥赫',
  lleech: '痢蛭',
  yaggababble: '牙噶巴卜',
  lordoftyphon: '堤丰之首',
  kazali: '卡扎力',
  riot: '暴乱：爪牙变成暴乱',
  legion: '军团：今晚谁死',
  summoner: '召唤师',
  villageidiot: '村夫',
  engineer: '工程师',
  lycanthrope: '半兽人',
  cultleader: '异教领袖的阵营',
  apprentice: '学徒（旅行者）',
  barista: '咖啡师（旅行者）',
  harlot: '流莺（旅行者）',
  bonecollector: '集骨者（旅行者）',
  cacklejack: '笑匠（旅行者）：一人换角色',
};

const SLOT_LINES: Partial<Record<SlotId, Lines>> = {
  summoner: {
    simple: ['请选择一名玩家，再在角色表上指一个恶魔：他会变成这个恶魔。'],
    atmo: ['召唤阵亮了起来……', '选一个容器，再选一个恶魔。'],
  },
  villageidiot: {
    simple: ['请选择一名玩家。'],
    atmo: ['村夫歪着头看着大家……', '你想看看谁？'],
  },
  engineer: {
    simple: ['你要用能力吗？要用就在角色表上指恶魔，或者指几个爪牙。'],
    atmo: ['工程师铺开了图纸……', '你要造出什么样的敌人？不用就摇头。'],
  },
  lycanthrope: {
    simple: ['请选择一名活着的玩家。'],
    atmo: ['满月升起，你感到了饥饿……', '选择你的猎物。'],
  },
  cultleader: {
    simple: ['你现在是这个阵营。'],
    atmo: ['教派的低语在你耳边回响……'],
  },
  ojo: {
    simple: ['请在角色表上指一个角色：他会死亡。'],
    atmo: ['奥赫的眼睛在黑暗里睁开……', '你要哪个角色的命？'],
  },
  lleech: {
    simple: ['请选择一名玩家。'],
    atmo: ['痢蛭在暗处蠕动……', '选择你的猎物。'],
  },
  yaggababble: {
    simple: ['这是你的秘密短语。'],
    atmo: ['一句话，一条命……', '记住这句话。'],
  },
  lordoftyphon: {
    simple: ['请选择一名玩家：他会死亡。'],
    atmo: ['堤丰的百个头颅同时睁开了眼睛……', '选择你的猎物。'],
  },
  kazali: {
    simple: ['请选择一名玩家：他会死亡。'],
    atmo: ['卡扎力的爪子划过黑暗……', '选择你的猎物。'],
  },
  riot: {
    simple: ['你现在是暴乱。'],
    atmo: ['街上燃起了火光……', '你加入了暴乱。'],
  },
  boffin: {
    simple: ['科学怪人选中了你们：恶魔拥有这个角色的能力。'],
    atmo: ['实验室里电光一闪……', '恶魔获得了这个能力。'],
  },
  wizard: {
    simple: ['你要许愿吗？'],
    atmo: ['水晶球亮了起来……', '说出你的愿望。'],
  },
  organgrinder: {
    simple: ['你要让自己醉酒到明天黄昏吗？点头或摇头。'],
    atmo: ['风琴的曲子越来越慢……', '今晚你要不要醉？'],
  },
  mezepheles: {
    simple: ['这是你的秘密词。'],
    atmo: ['一个词，一个契约……', '记住它。'],
  },
  huntsman: {
    simple: ['你要用能力吗？要用就指一名活着的玩家。'],
    atmo: ['猎人背起弓，走进山林……', '你要去找谁？不用就摇头。'],
  },
  damsel: {
    simple: ['落难少女在场。'],
    atmo: ['城堡里关着一位少女……', '找到她。'],
  },
  snitch: {
    simple: ['这三个角色不在场，你可以伪装成他们。'],
    atmo: ['有人把秘密说漏了嘴……', '这三个身份，没人在用。'],
  },
  ogre: {
    simple: ['请选择一名其他玩家。'],
    atmo: ['食人魔摸着肚子……', '你想和谁做朋友？'],
  },
  hatter: {
    simple: ['帽匠死了。你可以换成另一个同类型的角色，不换就摇头。'],
    atmo: ['疯帽匠的茶会开始了……', '要不要换一顶新帽子？'],
  },
  qutler: {
    simple: ['请选择一名玩家当你的主人。'],
    atmo: ['你要跟着谁投票？'],
  },
  steward: {
    simple: ['这名玩家是善良的。'],
    atmo: ['管家的账本上，有一个可靠的名字……', '这个人是善良的。'],
  },
  knight: {
    simple: ['这两名玩家都不是恶魔。'],
    atmo: ['骑士举起盾牌……', '这两个人，都不是恶魔。'],
  },
  noble: {
    simple: ['这三名玩家中，恰好有一人是邪恶的。'],
    atmo: ['贵族的宴会上来了三位客人……', '其中恰好一位，心怀不轨。'],
  },
  shugenja: {
    simple: ['离你最近的邪恶玩家，在这个方向。'],
    atmo: ['风从这边吹来，带着邪恶的气息……'],
  },
  highpriestess: {
    simple: ['我觉得你最该去找这个人聊聊。'],
    atmo: ['神谕在烛光里显现……', '去和这个人谈谈吧。'],
  },
  king: {
    simple: ['这个角色还活着。'],
    atmo: ['国王俯视着他的臣民……', '这个角色，还活在你的王国里。'],
  },
  choirboy: {
    simple: ['杀死国王的恶魔，是这名玩家。'],
    atmo: ['唱诗班的歌声停了……', '杀死国王的，就是他。'],
  },
  nightwatchman: {
    simple: ['你要用能力吗？要用就指一名玩家：他会知道你是守夜人。'],
    atmo: ['守夜人提着灯，在街上巡逻……', '你要让谁知道你的身份？不用就摇头。'],
  },
  acrobat: {
    simple: ['请选择一名玩家。'],
    atmo: ['走钢丝的人张开双臂……', '选一个人。'],
  },
  preacher: {
    simple: ['请选择一名玩家。'],
    atmo: ['布道的钟声响起……', '你要向谁传道？'],
  },
  clockmaker: {
    simple: ['恶魔和离他最近的爪牙之间，隔了这么多步。'],
    atmo: ['钟摆来回摆动……', '从恶魔到他最近的爪牙，要走这么多步。'],
  },
  snakecharmer: {
    simple: ['请选择一名活着的玩家。'],
    atmo: ['笛声响起，蛇从篮子里探出头……', '你要对谁吹响笛子？'],
  },
  mathematician: {
    simple: ['从今天天亮到现在，有这么多个能力没有正常生效。'],
    atmo: ['数字不会说谎……', '从天亮到现在，有这么多个能力出了差错。'],
  },
  towncrier: {
    simple: ['今天白天，有没有爪牙提名过——'],
    atmo: ['公告员摇响了铃铛……', '今天，有没有爪牙站出来提名——'],
  },
  oracle: {
    simple: ['死去的玩家中，有这么多个是邪恶的。'],
    atmo: ['亡灵在你耳边低语……', '死者之中，有这么多个邪恶的灵魂。'],
  },
  philosopher: {
    simple: ['你要用能力吗？要用就在角色表上指一个善良角色。'],
    atmo: ['智者在书页间沉思……', '你要借用哪一位的智慧？不用就摇头。'],
  },
  juggler: {
    simple: ['你今天猜对了这么多个。'],
    atmo: ['抛向空中的球落了下来……', '你接住了这么多个。'],
  },
  sage: {
    simple: ['杀死你的恶魔，是这两个人之一。'],
    atmo: ['在生命的最后一刻，你看清了凶手的影子……', '他就在这两个人之中。'],
  },
  eviltwin: {
    simple: ['看清对方。这是他的角色。'],
    atmo: ['镜子的两边，两张一样的脸……', '看清你的另一半。'],
  },
  witch: {
    simple: ['请选择一名玩家：他明天提名就会死。'],
    atmo: ['坩埚里冒着绿色的泡泡……', '你要诅咒谁？'],
  },
  cerenovus: {
    simple: ['请选择一名玩家，再在角色表上指一个善良角色。'],
    atmo: ['低语钻进了某个人的梦里……', '选一个人，和一个他明天必须假装的角色。'],
  },
  pithag: {
    simple: ['请选择一名玩家，再在角色表上指一个角色：他会变成这个角色。'],
    atmo: ['坩埚翻滚，一张脸正在融化……', '选一个人，和他要变成的模样。'],
  },
  fanggu: {
    simple: ['请选择一名玩家：他会死亡。'],
    atmo: ['方古的獠牙在黑暗里闪了一下……', '选择你的猎物。'],
  },
  nodashii: {
    simple: ['请选择一名玩家：他会死亡。'],
    atmo: ['腐臭的气息从地底涌出……', '选择你的猎物。'],
  },
  vigormortis: {
    simple: ['请选择一名玩家：他会死亡。'],
    atmo: ['枯骨在棺材里翻了个身……', '选择你的猎物。'],
  },
  dusk: {
    simple: ['天黑请闭眼。'],
    atmo: ['夜幕降临，钟楼敲响了午夜的钟声。', '镇上的居民们，请闭上眼睛，低下头……', '黑暗里，有人醒着。'],
  },
  minionInfo: {
    simple: ['这是你们的恶魔。'],
    atmo: ['看清你们的同伴。', '这一位，就是你们侍奉的恶魔。'],
  },
  demonInfo: {
    simple: ['这些是你的爪牙。', '这三个角色不在场，你可以伪装成他们。'],
    atmo: ['这些，是为你效命的爪牙。', '这三个身份无人认领——你可以借用它们藏身。'],
  },
  poisoner: {
    simple: ['请选择一名玩家下毒。'],
    atmo: ['毒药已经备好。今夜，你要让谁尝一尝？'],
  },
  washerwoman: {
    simple: ['这两人中，有一人是这个角色。'],
    atmo: ['晾衣绳上的衣服，泄露了某人的秘密……', '这两人之中，有一人是——'],
  },
  librarian: {
    simple: ['这两人中，有一人是这个角色。'],
    atmo: ['书架深处，藏着一份名单……', '这两人之中，有一人是——'],
  },
  investigator: {
    simple: ['这两人中，有一人是这个爪牙。'],
    atmo: ['你在暗处跟踪了一整天……', '这两人之中，有一人是——'],
  },
  chef: {
    simple: ['这是相邻而坐的邪恶玩家的对数。'],
    atmo: ['宴席上，你闻到了阴谋的气味。', '相邻而坐的邪恶，有这么多对——'],
  },
  empath: {
    simple: ['这是你两边最近的存活玩家中，邪恶玩家的数量。'],
    atmo: ['你感受着身边人的心跳……', '你两侧最近的人里，邪恶的有——'],
  },
  fortuneteller: {
    simple: ['请选择两名玩家。'],
    atmo: ['水晶球中雾气翻涌……选择两个人吧。'],
  },
  butler: {
    simple: ['请选择你的主人。'],
    atmo: ['选择你明天要侍奉的主人。'],
  },
  spy: {
    simple: ['这是魔典。'],
    atmo: ['魔典就在你眼前。看吧，记住你想记住的。'],
  },
  monk: {
    simple: ['请选择一名玩家，今晚你保护他。'],
    atmo: ['今夜，你要为谁祈祷？'],
  },
  scarletwoman: {
    simple: ['你现在是小恶魔。'],
    atmo: ['你的主人倒下了……从此刻起，你就是恶魔。'],
  },
  imp: {
    simple: ['请选择一名玩家，他会死亡。'],
    atmo: ['恶魔，醒来吧。今夜，谁会死去？'],
  },
  ravenkeeper: {
    simple: ['你今晚死了。请选择一名玩家，你会得知他的角色。'],
    atmo: ['乌鸦在你的尸体旁盘旋……', '选择一个人，看清他的真面目。'],
  },
  undertaker: {
    simple: ['这是今天被处决的玩家的角色。'],
    atmo: ['你为今天的死者收殓……', '他真实的身份是——'],
  },
  lunatic: {
    simple: ['请选择一名玩家，他会死亡。'],
    atmo: ['恶魔，醒来吧。今夜，谁会死去？'],
  },
  lilmonsta: {
    simple: ['爪牙们，请商量由谁来照看小怪宝，指向那个人。'],
    atmo: ['小怪宝在摇篮里哭闹……', '爪牙们，决定今晚由谁来照看它。'],
  },
  widow: {
    simple: ['这是魔典。请选择一名玩家，他会中毒。'],
    atmo: ['你拥有了整个小镇的秘密……', '选一个人，让他今后再也分不清真假。'],
  },
  fearmonger: {
    simple: ['请选择一名玩家。'],
    atmo: ['恐惧在黑暗里蔓延……你要让谁成为你的猎物？'],
  },
  pixie: {
    simple: ['这个镇民角色在场。'],
    atmo: ['林间的小精灵悄悄告诉你——', '这个角色，就在你们中间。'],
  },
  chambermaid: {
    simple: ['请选择除你以外的两名存活玩家。', '他们之中今晚因为自己的能力醒来过的人数是——'],
    atmo: ['你整夜在走廊里巡视……选两扇门。', '今晚，这两间房里有人醒过——'],
  },
  vortox: {
    simple: ['请选择一名玩家，他会死亡。'],
    atmo: ['漩涡在黑暗中旋转……今夜，谁会被卷走？'],
  },
  duchess: {
    simple: ['今天拜访公爵夫人的人里，有这么多个是邪恶的。'],
    atmo: ['公爵夫人送来一封密信——', '今天的客人里，心怀不轨的有——'],
  },
  bureaucrat: {
    simple: ['请选择一名其他玩家，明天他的投票算 3 票。'],
    atmo: ['你手里握着官印……明天，谁的一票会变得格外沉重？'],
  },
  thief: {
    simple: ['请选择一名其他玩家，明天他的投票算负数。'],
    atmo: ['夜色正好下手……明天，你要偷走谁的一票？'],
  },
  balloonist: {
    simple: ['这名玩家的类型和你之前得知的都不同。'],
    atmo: ['热气球在夜空中升起，你看见了——', '这个人。'],
  },
  alchemist: {
    simple: ['你拥有这个爪牙的能力。'],
    atmo: ['坩埚里冒出了危险的气味……', '你拥有这个爪牙的能力。'],
  },
  godfather: {
    simple: ['这些外来者在场。'],
    atmo: ['家族的账本上记着这些名字——', '这些外来者在场。'],
  },
  devilsadvocate: {
    simple: ['请选择一名存活的玩家：如果他明天被处决，他不会死。'],
    atmo: ['你要为谁辩护？明天的绞索会为他松开。'],
  },
  exorcist: {
    simple: ['请选择一名玩家。'],
    atmo: ['你举起圣物……今晚要驱逐谁身上的邪祟？'],
  },
  zombuul: {
    simple: ['请选择一名玩家，他会死亡。'],
    atmo: ['坟墓里的东西醒了……今夜，谁会被拖进黑暗？'],
  },
  flowergirl: {
    simple: ['今天白天，恶魔有没有投过票——'],
    atmo: ['花篮里有一朵花枯萎了……', '今天，恶魔有没有举起过手——'],
  },
  marionette: {
    simple: ['这名玩家是你的提线木偶。'],
    atmo: ['看，这一位被你牵着线——他还以为自己是好人。'],
  },
  harpy: {
    simple: ['请选择两名玩家：先指第一个，再指第二个。'],
    atmo: ['鹰身女妖张开了翅膀……选出两个人。'],
  },
  dreamer: {
    simple: ['请选择一名玩家。', '他是这两个角色之一。'],
    atmo: ['你在梦里看见了一个人……', '他是这两者之一——'],
  },
  seamstress: {
    simple: ['你要用能力吗？要用就选两名玩家。'],
    atmo: ['针线在你手中穿梭……要缝合哪两个人的命运？'],
  },
  bountyhunter: {
    simple: ['这名玩家是邪恶的。'],
    atmo: ['悬赏令上的画像——', '这个人，是邪恶的。'],
  },
  general: {
    simple: ['这是我认为现在占优的阵营——'],
    atmo: ['将军，战局如何？依我看——'],
  },
  alhadikhia: {
    simple: ['请选择三名玩家。'],
    atmo: ['哈迪寂亚睁开了眼……选出三个人，让他们自己决定生死。'],
  },
  barber: {
    simple: ['理发师死了。你可以选择两名玩家交换角色，也可以不换。'],
    atmo: ['理发师的剃刀落进了你的手里……要不要换掉两个人的脸？'],
  },
  sailor: {
    simple: ['请选择一名存活的玩家。'],
    atmo: ['水手，今晚你要和谁一起喝酒？'],
  },
  courtier: {
    simple: ['你要用能力吗？要用就在角色表上指一个角色。'],
    atmo: ['宫廷的酒杯已经斟满……你要灌醉哪一位？'],
  },
  pukka: {
    simple: ['请选择一名玩家。'],
    atmo: ['普卡吐着信子……今夜，毒牙要咬向谁？'],
  },
  grandmother: {
    simple: ['这是你的孙子，他的角色是——'],
    atmo: ['你一眼就认出了自己的孙子——', '他是这个角色。'],
  },
  innkeeper: {
    simple: ['请选择两名玩家，今晚他们不会死。'],
    atmo: ['旅店还有两间空房……你要收留谁过夜？'],
  },
  gambler: {
    simple: ['请选择一名玩家，再在角色表上指出你猜的角色。'],
    atmo: ['押上你的性命吧……他是谁？'],
  },
  shabaloth: {
    simple: ['请选择两名玩家，他们会死亡。'],
    atmo: ['沙巴洛斯张开巨口……今夜要吞下哪两个人？'],
  },
  po: {
    simple: ['请选择一名玩家，他会死亡。也可以不选，下次选三个。'],
    atmo: ['珀在黑暗中蓄力……今夜出手，还是等待？'],
  },
  assassin: {
    simple: ['你要用能力吗？要用就选择一名玩家，他会死亡。'],
    atmo: ['匕首已经出鞘……今夜要不要动手？'],
  },
  professor: {
    simple: ['你要用能力吗？要用就选择一名死亡的玩家。'],
    atmo: ['实验室里的灯还亮着……你要试着救活谁？'],
  },
};

export function slotLines(slot: SlotId, style: 'simple' | 'atmo'): string[] {
  return SLOT_LINES[slot]?.[style] ?? [];
}

export function librarianZeroLines(style: 'simple' | 'atmo'): string[] {
  return style === 'simple' ? ['场上没有外来者。'] : ['书架深处的名单上……一个外来者也没有。'];
}

export function dawnLines(
  deaths: number[], style: 'simple' | 'atmo',
  extra: { fear?: boolean; leviathanDay?: number; hadikhia?: { picks: number[]; alive: boolean[] }; banshee?: number; revived?: number[] } = {},
): string[] {
  const list = deaths.map((n) => `${seatName(n)}`).join('、');
  const out =
    style === 'simple'
      ? ['天亮了，大家请睁眼。', deaths.length ? `昨晚，${list} 死了。` : '昨晚是平安夜，没有人死亡。']
      : ['晨光刺破了黑夜，大家请睁开眼睛。', deaths.length ? `可惜，昨夜 ${list} 再也没有醒来……` : '昨夜，钟楼小镇平安无事。'];
  if (extra.fear) out.push('恐惧之灵选择了一名新的目标。');
  if (extra.hadikhia?.picks.length)
    out.push(`恶魔昨晚选择了 ${extra.hadikhia.picks.map((n) => seatName(n)).join('、')}：${extra.hadikhia.picks.map((n, i) => `${seatName(n)}${extra.hadikhia!.alive[i] ? '活着' : '死了'}`).join('，')}。`);
  if (extra.revived?.length) out.push(`${extra.revived.map((n) => seatName(n)).join('、')} 复活了！`);
  if (extra.banshee) out.push(`${seatName(extra.banshee)} 是报丧女妖，被恶魔杀死了！从现在起她每天可以提名两次，投票时算两票。`);
  if (extra.leviathanDay === 1) out.push('另外：利维坦在场。');
  else if (extra.leviathanDay) out.push(`今天是第 ${extra.leviathanDay} 天，利维坦仍在场。`);
  return out;
}

export function dayStartLines(day: number, style: 'simple' | 'atmo'): string[] {
  if (style === 'simple') return [`现在是第 ${day} 天。大家可以自由讨论，也可以私聊。`];
  return [`第 ${day} 天。镇民们聚在广场上，交换着彼此的秘密……`, '有人说了真话，有人没有。'];
}

export function nominationLines(style: 'simple' | 'atmo'): string[] {
  if (style === 'simple')
    return [
      '讨论时间到。现在开始提名：每人每天只能提名一次，每人每天只能被提名一次。',
      '被提名的人可以辩护，然后从被提名者开始，按顺时针依次举手投票。',
    ];
  return [
    '钟声响起，审判开始。',
    '谁有怀疑的对象，现在可以提名。每人每天只能提名一次，也只能被提名一次。',
    '被提名者可以为自己辩护，然后从他开始，顺时针依次举手。',
  ];
}

export function executionLines(n: number | null, style: 'simple' | 'atmo', survived = false): string[] {
  if (n === null) return style === 'simple' ? ['今天没有人被处决。'] : ['今天，绞刑架空着。没有人被处决。'];
  if (survived) return style === 'simple' ? [`${seatName(n)} 被处决了，但他没有死。`] : ['绞索收紧……又松开了。', `${seatName(n)} 被处决了，但他没有死。`];
  return style === 'simple' ? [`${seatName(n)} 被处决了。`] : ['绞索收紧……', `${seatName(n)} 被处决了。`];
}

export function endLines(winner: 'good' | 'evil', style: 'simple' | 'atmo'): string[] {
  if (winner === 'good')
    return style === 'simple' ? ['游戏结束：善良阵营获胜！'] : ['恶魔的力量消散了，钟楼重归宁静。', '善良阵营获胜！'];
  return style === 'simple' ? ['游戏结束：邪恶阵营获胜！'] : ['黑暗吞没了整个小镇……', '邪恶阵营获胜！'];
}
