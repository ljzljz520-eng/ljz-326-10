# 🤖 机甲纪元 · 机器人社团赛事官网

零依赖 Node.js 全栈项目（内置 HTTP 服务 + JSON 文件持久化 + 原生前端），面向机器人社团赛事场景：
首页展示 **赛程 / 参赛队伍 / 规则下载 / 现场公告**；成员登录后可 **提交报名资料、查看审核状态、查看队伍排名**；
管理员可 **发布新闻公告、审核报名、维护排行榜、处理忘记密码申请**。

## 启动

```bash
npm start          # 或 node server/server.js
# http://localhost:3000   （可用 PORT=xxxx 修改端口）
```

首次启动自动生成：

- `data/db.json`：模拟数据（账号、报名、队伍、赛程、排行榜、公告新闻、找回申请）
- `public/rules/*.txt`：可下载的竞赛规则与安全检查清单

删除 `data/db.json` 重启即可恢复初始模拟数据。

## 演示账号

| 角色 | 用户名 | 密码 | 说明 |
| --- | --- | --- | --- |
| 管理员 | `admin` | `admin123` | 内容发布、报名审核、排行榜、找回密码处理 |
| 成员 | `zhangsan` | `member123` | 已有「已通过」报名，可看本队排名 |
| 成员 | `lisi` | `member123` | 报名「待审核」，可修改资料 |
| 成员 | `wangwu` | `member123` | 报名「已驳回」，且有一条忘记密码申请 |

## 页面

- `/index.html` 首页：赛程时间线、队伍卡片、规则下载、现场公告、赛事新闻
- `/rankings.html` 公开排行榜（可按项目筛选）
- `/login.html` 登录 / 成员注册 / 忘记密码申请（hash 切换 `#register` `#forgot`）
- `/member.html` 成员中心：我的报名（提交/修改/审核状态/审核意见）、本队排名、账号设置、改密
- `/admin.html` 管理后台：总览、报名审核、新闻公告 CRUD、排行榜 CRUD、忘记密码处理

## 接口边界

统一约定：鉴权头 `Authorization: Bearer <token>`；成功 `{ "ok": true, "data": ... }`，
失败 `{ "ok": false, "error": { "code", "message" } }`，状态码语义化（400/401/403/404/409/500）。

### 公开接口

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/api/health` | 健康检查 |
| POST | `/api/auth/register` | 成员注册（角色固定 member），返回 token |
| POST | `/api/auth/login` | 登录，返回 token + 用户信息 |
| GET | `/api/schedules` | 赛程列表（按日期升序） |
| GET | `/api/teams?category=` | 参赛队伍列表 |
| GET | `/api/rankings?category=` | 排行榜（按项目、名次排序） |
| GET | `/api/posts?type=announcement|news&limit=n` | 已发布公告/新闻（置顶优先） |
| GET | `/api/posts/:id` | 已发布内容详情 |
| GET | `/api/rules` | 可下载规则文件清单 |
| GET | `/api/rules/download/:file` | 下载规则文件（Attachment） |
| POST | `/api/password-resets` | 提交忘记密码申请（防重复提交） |

### 成员接口（需登录，Bearer token）

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/api/me/profile` | 本人资料 |
| PUT | `/api/me/profile` | 修改姓名/邮箱/手机 |
| PUT | `/api/me/password` | 修改密码（校验原密码） |
| POST | `/api/uploads` | 上传报名附件（base64，≤5MB，类型白名单），返回附件 id |
| GET | `/api/uploads/:id/download` | 下载附件（本人或管理员） |
| POST | `/api/registrations` | 提交报名（队名/项目/2-5 名队员且含 1 名队长/联系方式/≥1 个附件）；有待审核或已通过记录时 409 |
| GET | `/api/registrations/me` | 本人报名列表（含状态、审核意见、附件清单） |
| PUT | `/api/registrations/:id` | 待审核状态下修改本人报名（同样校验队长唯一、跨队查重与附件） |
| GET | `/api/me/ranking` | 本人已通过队伍的排行榜成绩 |

### 管理员接口（需 admin 角色）

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/api/admin/stats` | 后台统计总览 |
| GET | `/api/admin/users` | 用户列表 |
| GET | `/api/admin/registrations?status=` | 全部报名（含提交人信息） |
| PUT | `/api/admin/registrations/:id/review` | 审核 `{decision: approved/rejected, comment}`；通过自动在排行榜占位 |
| GET | `/api/admin/posts?type=` | 内容列表（含草稿） |
| POST | `/api/admin/posts` | 发布公告/新闻（可存草稿、置顶） |
| PUT | `/api/admin/posts/:id` | 编辑 / 发布 / 撤回 / 置顶 |
| DELETE | `/api/admin/posts/:id` | 删除内容 |
| GET | `/api/admin/rankings` | 排名列表 |
| POST | `/api/admin/rankings` | 新增排名（校验胜+平+负≤场次、同项目队名唯一） |
| PUT | `/api/admin/rankings/:id` | 录入/修改成绩，保存后自动按积分重排名次 |
| DELETE | `/api/admin/rankings/:id` | 移除记录并重新排名 |
| POST | `/api/admin/rankings/recompute` | 全量按积分重算名次 |
| GET | `/api/admin/password-resets?status=` | 找回申请列表 |
| PUT | `/api/admin/password-resets/:id` | 处理申请：`done`（可同时重置密码）或 `rejected` |

## 边界说明（当前版本）

- 赛程与队伍介绍为只读模拟数据（种子数据），暂未提供后台维护接口；排行榜在报名通过后自动占位。
- 规则文件为服务端 `public/rules/` 下的 TXT，经鉴权无关的下载接口下发（`Content-Disposition: attachment`）。
- 报名校验：每队 2-5 人且**必须恰好 1 名队长**（分工含“队长”）；同一队员（按学号/姓名）**不得跨队、跨项目**出现在其它待审核/已通过报名中（提交、修改、管理员通过时均拦截，409）。
- 报名材料为**可审查附件**：成员先经 `/api/uploads` 上传文件（pdf/图片/zip/txt/Office，单个 ≤5MB，每报名最多 8 个），提交报名时引用附件 id；管理员在审核页可逐个下载查阅。`materials` 字段仅作补充文字说明。
- 忘记密码采用「用户申请 → 管理员线下核实 → 后台标记处理/重置密码」的流程，未接入邮件短信。

## 目录结构

```
server/
  server.js   # HTTP 入口、静态托管
  api.js      # 全部 REST 接口与校验
  auth.js     # HS256 JWT（零依赖）
  store.js    # JSON 持久化、scrypt 密码哈希、种子数据
public/
  index/rankings/login/member/admin .html
  css/style.css
  js/common.js index.js member.js admin.js
  rules/      # 可下载规则（首次启动生成）
data/db.json  # 运行后生成
data/uploads/ # 报名附件文件（运行后生成）
```
