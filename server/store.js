/**
 * 数据存储层（零依赖）
 * - JSON 文件持久化（data/db.json），首次启动自动生成模拟种子数据
 * - 写入采用：内存修改 -> 序列化写临时文件 -> rename 原子替换
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DATA_DIR = path.join(__dirname, '..', 'data');
const DB_FILE = path.join(DATA_DIR, 'db.json');
const PUBLIC_DIR = path.join(__dirname, '..', 'public');
const RULES_DIR = path.join(PUBLIC_DIR, 'rules');

/* ---------------- 密码哈希（scrypt） ---------------- */

function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
  const hash = crypto.scryptSync(String(password), salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

function verifyPassword(password, stored) {
  if (!stored || !stored.includes(':')) return false;
  const [salt, hash] = stored.split(':');
  const check = crypto.scryptSync(String(password), salt, 64);
  const expect = Buffer.from(hash, 'hex');
  return check.length === expect.length && crypto.timingSafeEqual(check, expect);
}

/* ---------------- 工具 ---------------- */

const now = () => new Date().toISOString();
const newId = (prefix) =>
  `${prefix}_${Date.now().toString(36)}${crypto.randomBytes(4).toString('hex')}`;

/* ---------------- 种子数据 ---------------- */

function seedData() {
  return {
    users: [
      {
        id: 'u_admin',
        username: 'admin',
        realName: '系统管理员',
        role: 'admin',
        email: 'admin@robolocal.cn',
        phone: '13800000000',
        password: hashPassword('admin123'),
        createdAt: '2026-08-01T08:00:00.000Z'
      },
      {
        id: 'u_zhangsan',
        username: 'zhangsan',
        realName: '张三',
        role: 'member',
        email: 'zhangsan@example.com',
        phone: '13900000001',
        password: hashPassword('member123'),
        createdAt: '2026-08-10T08:00:00.000Z'
      },
      {
        id: 'u_lisi',
        username: 'lisi',
        realName: '李四',
        role: 'member',
        email: 'lisi@example.com',
        phone: '13900000002',
        password: hashPassword('member123'),
        createdAt: '2026-08-12T08:00:00.000Z'
      },
      {
        id: 'u_wangwu',
        username: 'wangwu',
        realName: '王五',
        role: 'member',
        email: 'wangwu@example.com',
        phone: '13900000003',
        password: hashPassword('member123'),
        createdAt: '2026-08-15T08:00:00.000Z'
      }
    ],
    registrations: [
      {
        id: 'reg_seed_1',
        userId: 'u_zhangsan',
        teamName: '疾风机器人队',
        category: '相扑机器人',
        members: [
          { name: '张三', role: '队长', studentId: '20240011' },
          { name: '赵小川', role: '硬件', studentId: '20240012' },
          { name: '孙晴', role: '编程', studentId: '20240013' }
        ],
        advisor: '陈建国',
        contact: '13900000001',
        materials: '已提交安全责任书与器材清单（模拟）。',
        status: 'approved',
        reviewComment: '材料齐全，审核通过。',
        reviewedBy: 'admin',
        createdAt: '2026-08-20T03:00:00.000Z',
        reviewedAt: '2026-08-22T02:30:00.000Z',
        updatedAt: '2026-08-22T02:30:00.000Z'
      },
      {
        id: 'reg_seed_2',
        userId: 'u_lisi',
        teamName: '智械工坊',
        category: '迷宫机器人',
        members: [
          { name: '李四', role: '队长', studentId: '20240021' },
          { name: '周舟', role: '编程', studentId: '20240022' }
        ],
        advisor: '林敏',
        contact: '13900000002',
        materials: '器材清单待补充，先提交占位。',
        status: 'pending',
        reviewComment: '',
        reviewedBy: null,
        createdAt: '2026-09-05T06:00:00.000Z',
        reviewedAt: null,
        updatedAt: '2026-09-05T06:00:00.000Z'
      },
      {
        id: 'reg_seed_3',
        userId: 'u_wangwu',
        teamName: '雷霆小队',
        category: '任务挑战赛',
        members: [
          { name: '王五', role: '队长', studentId: '20240031' }
        ],
        advisor: '',
        contact: '13900000003',
        materials: '仅一人组队，人数不足。',
        status: 'rejected',
        reviewComment: '队伍人数不符合赛事规则（每队 2-5 人），请补充队员后重新提交。',
        reviewedBy: 'admin',
        createdAt: '2026-09-02T01:00:00.000Z',
        reviewedAt: '2026-09-03T01:20:00.000Z',
        updatedAt: '2026-09-03T01:20:00.000Z'
      }
    ],
    teams: [
      {
        id: 't_1',
        name: '疾风机器人队',
        school: '市第一中学',
        category: '相扑机器人',
        slogan: '稳如磐石，动若疾风',
        members: ['张三', '赵小川', '孙晴'],
        advisor: '陈建国',
        logoColor: '#38bdf8'
      },
      {
        id: 't_2',
        name: '智械工坊',
        school: '理工附中',
        category: '迷宫机器人',
        slogan: '代码筑路，智慧通关',
        members: ['李四', '周舟'],
        advisor: '林敏',
        logoColor: '#a78bfa'
      },
      {
        id: 't_3',
        name: '雷霆小队',
        school: '市南实验中学',
        category: '任务挑战赛',
        slogan: '雷霆出击，使命必达',
        members: ['王五', '钱多多'],
        advisor: '吴海涛',
        logoColor: '#f472b6'
      },
      {
        id: 't_4',
        name: '钢铁苍穹',
        school: '育才中学',
        category: '相扑机器人',
        slogan: '钢铁意志，制擂全场',
        members: ['冯磊', '陈晨', '蒋萌', '韩雪'],
        advisor: '马丽',
        logoColor: '#34d399'
      },
      {
        id: 't_5',
        name: '迷宫漫步者',
        school: '外国语学校',
        category: '迷宫机器人',
        slogan: '每一条迷宫，都有最优解',
        members: ['褚亮', '卫青', '尤静'],
        advisor: '许文峰',
        logoColor: '#fbbf24'
      },
      {
        id: 't_6',
        name: '火种计划',
        school: '经开区实验学校',
        category: '任务挑战赛',
        slogan: '点燃火种，点燃创造',
        members: ['潘越', '朱可', '秦岭', '何欢', '高阳'],
        advisor: '罗一',
        logoColor: '#fb7185'
      }
    ],
    schedules: [
      {
        id: 's_1',
        stage: '报名阶段',
        title: '线上报名开放',
        date: '2026-09-01',
        endDate: '2026-09-20',
        venue: '赛事官网在线提交',
        description: '成员登录后在「成员中心」提交报名资料，逾期系统关闭提交入口。',
        status: 'ongoing'
      },
      {
        id: 's_2',
        stage: '资格审核',
        title: '报名资料审核',
        date: '2026-09-21',
        endDate: '2026-09-25',
        venue: '线上',
        description: '组委会对队伍名单、安全责任书与器材清单进行资格审核。',
        status: 'upcoming'
      },
      {
        id: 's_3',
        stage: '小组赛',
        title: '三个项目小组循环赛',
        date: '2026-10-10',
        endDate: '2026-10-11',
        venue: '市青少年活动中心 一层馆',
        description: '相扑 / 迷宫 / 任务挑战三个项目分别进行小组循环，积分前四晋级。',
        status: 'upcoming'
      },
      {
        id: 's_4',
        stage: '决赛日',
        title: '淘汰赛与总决赛',
        date: '2026-10-17',
        endDate: '2026-10-17',
        venue: '市青少年活动中心 主赛场',
        description: '淘汰赛、季军赛与总决赛，现场颁奖并同步更新排行榜。',
        status: 'upcoming'
      },
      {
        id: 's_5',
        stage: '技术工作坊',
        title: '赛前传感器训练营',
        date: '2026-09-12',
        endDate: '2026-09-12',
        venue: '线上会议室',
        description: '讲解灰度、超声波与视觉模块在本次赛题中的典型用法。',
        status: 'upcoming'
      }
    ],
    rankings: [
      {
        id: 'rk_1',
        teamId: 't_1',
        teamName: '疾风机器人队',
        category: '相扑机器人',
        played: 3,
        wins: 3,
        draws: 0,
        losses: 0,
        score: 9,
        rank: 1,
        updatedAt: '2026-09-08T10:00:00.000Z'
      },
      {
        id: 'rk_2',
        teamId: 't_4',
        teamName: '钢铁苍穹',
        category: '相扑机器人',
        played: 3,
        wins: 2,
        draws: 0,
        losses: 1,
        score: 6,
        rank: 2,
        updatedAt: '2026-09-08T10:00:00.000Z'
      },
      {
        id: 'rk_3',
        teamId: 't_5',
        teamName: '迷宫漫步者',
        category: '迷宫机器人',
        played: 2,
        wins: 2,
        draws: 0,
        losses: 0,
        score: 6,
        rank: 1,
        updatedAt: '2026-09-08T10:00:00.000Z'
      },
      {
        id: 'rk_4',
        teamId: 't_2',
        teamName: '智械工坊',
        category: '迷宫机器人',
        played: 2,
        wins: 1,
        draws: 0,
        losses: 1,
        score: 3,
        rank: 2,
        updatedAt: '2026-09-08T10:00:00.000Z'
      },
      {
        id: 'rk_5',
        teamId: 't_6',
        teamName: '火种计划',
        category: '任务挑战赛',
        played: 2,
        wins: 1,
        draws: 1,
        losses: 0,
        score: 4,
        rank: 1,
        updatedAt: '2026-09-08T10:00:00.000Z'
      },
      {
        id: 'rk_6',
        teamId: 't_3',
        teamName: '雷霆小队',
        category: '任务挑战赛',
        played: 2,
        wins: 0,
        draws: 1,
        losses: 1,
        score: 1,
        rank: 2,
        updatedAt: '2026-09-08T10:00:00.000Z'
      }
    ],
    posts: [
      {
        id: 'p_1',
        type: 'announcement',
        title: '【现场公告】开幕式时间调整通知',
        content:
          '因场馆设备调试，原定于 10 月 17 日 9:00 的开幕式调整为 9:30 开始，地点不变（市青少年活动中心主赛场），请各队提前 30 分钟签到。',
        pinned: true,
        published: true,
        author: '系统管理员',
        createdAt: '2026-09-09T01:30:00.000Z',
        updatedAt: '2026-09-09T01:30:00.000Z'
      },
      {
        id: 'p_2',
        type: 'announcement',
        title: '【现场公告】比赛日检录与安全须知',
        content:
          '1. 所有参赛机器人须通过安全检查（电压不超过 12V，无尖锐外露件）；\n2. 检录时请携带报名表与学生证；\n3. 赛场内仅允许队员进入，指导老师在观摩区观赛。',
        pinned: false,
        published: true,
        author: '系统管理员',
        createdAt: '2026-09-07T06:00:00.000Z',
        updatedAt: '2026-09-07T06:00:00.000Z'
      },
      {
        id: 'p_3',
        type: 'announcement',
        title: '【现场公告】工作坊线上会议室链接已发放',
        content: '9 月 12 日传感器训练营的会议室链接已通过报名邮箱发送，未收到的队伍请联系组委会。',
        pinned: false,
        published: true,
        author: '系统管理员',
        createdAt: '2026-09-06T08:10:00.000Z',
        updatedAt: '2026-09-06T08:10:00.000Z'
      },
      {
        id: 'p_4',
        type: 'news',
        title: '2026 赛季三大比赛项目正式公布',
        content:
          '本届赛事设相扑机器人、迷宫机器人、任务挑战赛三个项目，覆盖结构设计、传感融合与自主决策等核心能力。',
        pinned: false,
        published: true,
        author: '系统管理员',
        createdAt: '2026-08-28T02:00:00.000Z',
        updatedAt: '2026-08-28T02:00:00.000Z'
      },
      {
        id: 'p_5',
        type: 'news',
        title: '六支种子队伍风采抢先看',
        content: '官网「参赛队伍」栏目已上线首批六支参赛队伍介绍，更多队伍信息将在报名截止后更新。',
        pinned: false,
        published: true,
        author: '系统管理员',
        createdAt: '2026-08-25T02:00:00.000Z',
        updatedAt: '2026-08-25T02:00:00.000Z'
      }
    ],
    passwordResets: [
      {
        id: 'pr_seed_1',
        username: 'wangwu',
        realName: '王五',
        contact: '13900000003',
        reason: '更换手机号后收不到验证码，忘记原密码。',
        status: 'pending',
        handledBy: null,
        handleComment: '',
        createdAt: '2026-09-09T12:00:00.000Z',
        handledAt: null
      }
    ]
  };
}

/* ---------------- 加载 / 保存 ---------------- */

let db;

function ensureRuleFiles() {
  fs.mkdirSync(RULES_DIR, { recursive: true });
  const files = {
    'competition-rules-v2026.txt': `2026 机器人社团赛事竞赛规则（模拟版 v2026.1）

一、项目设置
  1. 相扑机器人：在直径 150cm 擂台上将对方机器人推出界外者获胜。
  2. 迷宫机器人：自主穿行标准迷宫，用时最短者获胜。
  3. 任务挑战赛：按顺序完成取物、避障、投放 3 个任务，按完成度与用时计分。

二、队伍要求
  1. 每队 2-5 名队员，设队长 1 名，可配指导老师 1 名。
  2. 同一队员不得跨队、跨项目报名。

三、器材安全
  1. 机器人电源电压不得超过 12V。
  2. 禁止使用燃烧、腐蚀类装置及尖锐外露结构。
  3. 开赛检录未通过安全检查者取消资格。

四、计分
  1. 小组赛胜 3 分、平 1 分、负 0 分。
  2. 同分依次比较：相互战绩 -> 净胜分 -> 总用时。

五、纪律
  1. 遥控/通信作弊直接取消全部成绩。
  2. 对裁判判罚有异议，由队长在 10 分钟内向仲裁组提交书面申诉。
`,
    'safety-checklist.txt': `参赛安全检查清单（模拟版）

[ ] 电池绝缘良好，固定牢靠，电压 <= 12V
[ ] 运动部件有防护，无尖锐外露件
[ ] 急停断电方式有效
[ ] 机器人尺寸重量符合项目要求
[ ] 已签署安全责任书（全体队员）
[ ] 携带学生证 / 报名确认信息用于检录
`
  };
  for (const [name, content] of Object.entries(files)) {
    const p = path.join(RULES_DIR, name);
    if (!fs.existsSync(p)) fs.writeFileSync(p, content, 'utf8');
  }
}

function load() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  ensureRuleFiles();
  if (fs.existsSync(DB_FILE)) {
    try {
      db = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
      return;
    } catch (e) {
      const backup = `${DB_FILE}.corrupt-${Date.now()}`;
      fs.renameSync(DB_FILE, backup);
      console.warn(`[store] db.json 解析失败，已备份为 ${backup}，重新生成种子数据`);
    }
  }
  db = seedData();
  save();
  console.log('[store] 已初始化种子数据 data/db.json');
}

function save() {
  const tmp = path.join(DATA_DIR, `.db.${process.pid}.${Date.now()}.tmp`);
  fs.writeFileSync(tmp, JSON.stringify(db, null, 2), 'utf8');
  fs.renameSync(tmp, DB_FILE);
}

/* ---------------- 查询辅助 ---------------- */

function publicUser(u) {
  if (!u) return null;
  const { password, ...rest } = u;
  return rest;
}

module.exports = {
  load,
  save,
  get db() {
    return db;
  },
  newId,
  now,
  hashPassword,
  verifyPassword,
  publicUser,
  PUBLIC_DIR,
  RULES_DIR
};
