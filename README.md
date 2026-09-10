# DSH Vue Chat

独立的 Vue 3 + JavaScript 演示：通过本机 `dsh web` 的 fetch BFF 和 mux WebSocket 复刻官方 Web 对话。浏览器**不直接请求 DeepSeek**；`session.prompt` 只返回受理回执，正文、工具卡片、审批、排队都来自 mux。

本仓库与 `deepseek-harness` 同级。二次开发只改这里，不要改 Harness。接口字段与信封见 [docs/api.md](docs/api.md)。

## 15 分钟上手

### 1. 启动 Host

在 `deepseek-harness` 目录：

```sh
pnpm dsh --profile web
```

默认监听 **http://127.0.0.1:3080**。需要可用的 `DEEPSEEK_API_KEY`（Harness 根目录 `.env` 或环境变量）。没钥匙时页面能连上 Host，但模型请求会失败。

### 2. 启动本项目

```sh
npm install
npm run dev
```

打开 Vite 打印的地址，一般是 `http://localhost:5173`。地址栏请固定一种主机名：`localhost` **或** `127.0.0.1`，不要混用。

Host 不在 3080 时（PowerShell）：

```powershell
$env:DSH_WEB_URL="http://127.0.0.1:8080"; npm run dev
```

改过 `vite.config.js` 必须重启 `npm run dev`。页面里所有请求都走相对路径 `/api`，不要写死 `localhost:3080`。

### 3. 确认链路

1. 侧栏出现会话或「新会话」。
2. 输入一句话回车，出现用户气泡，随后 Think / 工具卡 / 回答。
3. 浏览器 Network 里应看到 `POST /api/session.prompt`（200）和 `WS /api/events.mux`。

常见失败见文末「排障」。

## 架构

```
浏览器 (localhost:5173)
  │
  ├─ POST /api/<method>          fetch BFF（会话、工作区、模型、技能、打开文件）
  ├─ POST /api/commands/list     Typert Remote（斜杠命令目录）
  ├─ POST /api/respond           回答 mux 挂起的审批 / 提问
  └─ WS  /api/events.mux         只下行：事件、投影、队列、Host 状态
          │
          ▼
Vite 代理（changeOrigin: false, ws: true）
          │
          ▼
dsh web Host (127.0.0.1:3080)
          │
          ▼
DeepSeek API
```

`vite.config.js` 必须 `changeOrigin: false`。Host 的 `/api` 栅栏要求 `Origin.host === Host`；Vite 默认把 Host 改成 `127.0.0.1:3080` 后，mux 升级会 403。

mux **只下行**。不要在这条 WebSocket 上 `send` 业务数据。探活用 `POST /api/session.list`，不要 `GET /api/events.mux`（普通 GET 固定 426）。

## 目录

```
dsh-vue-chat/
  vite.config.js          /api → DSH_WEB_URL 或 127.0.0.1:3080
  src/main.js             挂载 App
  src/App.vue             只渲染 QaChat
  src/style.css           全局样式
  src/components/         页面与卡片
  src/dsh/                协议与折叠逻辑（二次开发优先改这里）
  docs/api.md             接口信封、RPC、mux 帧
```

### `src/dsh/` 职责

| 文件 | 做什么 |
|---|---|
| `rpc.js` | `dshCall` / `dshRemote` / `respond` 以及本页用到的全部 RPC 封装 |
| `useMux.js` | 连 mux，把帧折成 `rows`；维护 running / queue / approval / question |
| `sessions.js` | 会话列表、工作区分组、谱系缩进、历史分页、分叉标题、localStorage |
| `commands.js` | 斜杠目录：Host 命令 + 技能 + 本地 `/model`；claim / hint / 模糊过滤 |
| `tools.js` | `tool/call` → 行；`tool/result` + mux `view` → 卡片数据 |
| `search.js` | grep / glob / web_search 结果卡 |
| `deliverables.js` | 当轮产物路径、用时、首 token、tok/s |
| `images.js` | 粘贴/拖放校验；历史图用 `attachmentId` 拉回 |
| `markdown.js` | 助手 Markdown；`` `文件名` `` 对应当轮产物则成胶囊 |
| `open-file.js` | 相对路径拼会话 `cwd`，再 `host.openPath` |
| `context.js` | 非用户 `user/message` → 左侧「上下文注入 / 召回」 |
| `labels.js` | 权限芯片、模型芯片文案 |
| `stats.js` | 底栏 token / 步数文案 |
| `cap.js` | 卡片头尾截断行数 |

### 组件职责

| 组件 | 做什么 |
|---|---|
| `QaChat.vue` | 页面编排：开会话、发消息、投影、侧栏动作、滚动 |
| `SessionSidebar.vue` | 工作区分组、展开其余 N 个、分组切换 |
| `SessionRow.vue` | 一行会话：重命名 / 分叉 / 归档 |
| `ComposerBar.vue` | 输入胶囊：+、权限、斜杠菜单、模型、上下文环、发送/停止 |
| `AssistantMarkdown.vue` | 助手正文 + 产物胶囊 |
| `ProducedFiles.vue` | 「产物」条 |
| `MessageActions.vue` | 复制 / 分叉 / 用时；只挂在已结束轮次末尾，悬停才显示 |
| `*Card.vue` | Search / Read / Terminal / Diff / Web |
| `TodoPanel.vue` | 任务条（`todos` 投影） |
| `TurnStatus.vue` | 运行中「Deep diving...」 |
| `QueueDock.vue` | 排队 / steer 条 |
| `ApprovalPanel.vue` / `QuestionPanel.vue` | 审批与提问 |
| `StatsLine.vue` / `ContextMeter.vue` | 底栏统计、上下文环 |

## 数据流

### 启动

1. `useMux().connect()`：先 unary 探活，再升级 WebSocket。
2. `session.list` + `workspace.list` 填侧栏。
3. 恢复 `sessionStorage` 里的会话，否则打开最近一条，再否则 `session.create`。

### 打开会话

1. `watchSession(id)` 过滤后续 mux 帧。
2. `beginSwitch()` 把切换期间的 live 事件缓冲起来。
3. `session.history`（每页 50）`replayEntries`；`session.models`；`loadCatalog`。
4. 用 history 尾页的 `projections.values` 播种权限、计划、上下文、统计。
5. `endSwitch()` 回放缓冲，避免漏掉切换时到达的帧。

之后 `session/projection` 按 `seq` 覆盖同名 key。当前页使用的 key：`title`、`permissions`、`todos`、`plan`、`imageLimits`、`contextPressure`、`contextBreakdown`、`tokenUsage`、`sessionStats`。

### 发送

`session.prompt` 的 `content` 是块数组。文本是 `{ type: 'text', text }`；新图是 `{ type: 'image', mediaType, data, name }`（`data` 为 base64，无 data-URL 前缀）。历史图是 `{ type: 'image', attachment: { attachmentId } }`，展示时再调 `session.attachment`。

斜杠命令也走 `session.prompt`（整行文本，例如 `/permission danger-full-access`、`/plan off`）。`compact` / `export` 无参数时 Composer 直接发送。

本页 `prompt()` 默认 `mode: 'queue'`：空闲即开一轮；运行中则进入 `session/queue`。

### 对话行 `rows`

`useMux` 里的 `rows` 是 **`reactive([])`，不是 `ref`**。遍历写 `for (const row of rows)`，不要 `rows.value`。

| `row.type` | 来源 |
|---|---|
| `user` | `user/message` 且 `source.kind === 'user'`（右侧气泡） |
| `context` | 其它 `user/message`（左侧注入/召回） |
| `think` | `assistant/chunk` 的 `reasoning-delta` |
| `answer` | `text-delta` / `assistant/message` |
| `tool` / `skill` | `tool/call` + `tool/result` |
| `notice` | 压缩、重试、命令、截断、错误 |

工具卡优先用 mux 帧上的 `view`（`{ for: 'call'|'result', view }`），没有再回退 `tool/result.meta`。

`turn/end` 时才把用时 / 首 token / tok/s 和 `forkable` 打到该轮最后一条 `answer`。轮次还在跑时（中间还有工具卡）不出现复制和统计。悬停该条消息才显现。消息「分叉」带 `atSeq`；侧栏「分叉会话」不带（锚到最后一轮已完成）。进行中的 turn 会 `fork-unavailable`。

分叉子会话有 `parentSessionId`，**不是** `origin === 'subagent'`。侧栏用 `flattenLineage` 缩进挂在父会话下；只排除 subagent。

归档走 `workspace.archiveSession`。和官方一样：全局隐藏、搜索不到、没有取消归档 UI。日志还在，产品未暴露 unarchive。

## 二次开发

优先改 `src/dsh/` 的纯函数，再在组件里接线。新 RPC 先加到 `rpc.js`，页面不要直接 `fetch`。

### 加一种工具卡

1. 在 `tools.js` 的 `TOOL_VARIANTS` 登记工具名 → 变体。
2. 从 mux `view.card` 或 `event.data.meta` 抽出卡片对象（参考 `readCardFromView` / `webCardFromView`）。
3. 在 `createToolRow` / `applyToolResult` 写入 `row.xxx`。
4. 新建 `XxxCard.vue`，在 `QaChat.vue` 按 `row.xxx` 渲染。
5. 若该工具会改文件，在 `deliverables.js` 的 `producedPaths` 认 `view.locations`。

### 加一条斜杠命令

- **Host 已有**：会出现在 `POST /api/commands/list`，只需改文案或 hint（`commands.js` 的 `HINT_ZH`）。
- **仅前端**：加到 `CLIENT_COMMANDS`，设 `action`，在 `ComposerBar.vue` 的 `chooseSlash` 处理（`/model` 已是这种）。
- **技能**：来自 `skill.list`，选中后插入 `/{name} `。

不要调用不存在的 fetch BFF `command.list`。官方目录是 Typert Remote：`POST /api/commands/list`，payload 为 `{ args: { agentId } }`。

### 加一个投影

1. 打开会话后看 `session.history` 的 `projections.values`，以及 mux `session/projection`。
2. 在 `QaChat.applyProjection` 读 `frame.key`。
3. 传给对应芯片 / 面板。

### 加一个侧栏动作

`SessionRow.vue` 发事件 → `QaChat` 调 `rpc.js`。需要实时刷新时，在 `applyHost` 认 `host/*` 帧（工作区变更已处理）。

### 加一种对话行

在 `useMux.applyEvent` 的 `switch (event.type)` 里 `rows.push(...)`，然后在 `QaChat` 模板加 `v-else-if`。`seq` 去重已经做了：`event.seq <= lastSeq` 会丢掉。

加载更早历史用 `prependOlder`：先重放旧页，再拼回现有 `rows`，并靠滚动高度差保住视口。

## 本地存储

| key | 位置 | 内容 |
|---|---|---|
| `dsh-vue-chat.sessionId` | `sessionStorage` | 当前会话 |
| `dsh-vue-chat.workspace.view` | `localStorage` | `{ groupBy: 'workspace'\|'flat', expanded: { [workspaceId]: boolean } }` |

隐私模式写失败被吞掉，内存状态仍可用。

## 已对齐 / 未做

已对齐：会话列表与工作区分组、权限/模型芯片、任务条、Markdown 与产物胶囊、打开文件、运行中停止、排队、审批与提问、图片、计划芯片、斜杠命令+技能、复制与分叉、侧栏 ⋯、超过 5 条折叠、分叉谱系缩进。

未做（官方有或产品未暴露）：Cmd/Ctrl+Enter steer、图片灯箱、完整 goal UI、子代理会话、工作区增删改/拖拽、会话搜索、取消归档。

## 排障

| 现象 | 原因 | 处理 |
|---|---|---|
| mux / RPC 403 | `localhost` 与 `127.0.0.1` 混用，或代理改写了 Host | 地址栏统一主机名；保持 `changeOrigin: false` |
| `GET /api/events.mux` 426 | 用普通 HTTP 打了只升级 WebSocket 的路径 | 忽略；探活用 `POST /api/session.list` |
| 404 | Host 没起来或端口不对 | `pnpm dsh --profile web`；设 `DSH_WEB_URL` |
| 改了代理仍 403 | Vite 没重启 | 停掉再 `npm run dev` |
| 侧栏没有刚分叉的会话 | 把 `parentSessionId` 当成了 subagent | 只排除 `origin === 'subagent'` |
| `rows.value is not iterable` | 把 `reactive([])` 当 `ref` | 直接遍历 `rows` |
| 归档后「没了」 | 产品设计，不是删除 | 没有已归档列表；日志仍在 Host |
| 斜杠菜单只有本地几条 | 调了错误的 `command.list` | 用 `dshRemote('commands/list', { agentId })` |

## 脚本

```sh
npm run dev       # Vite，默认 5173
npm run build     # 产出 dist/
npm run preview   # 预览构建结果（仍需 Host + 自行配代理）
```
