# 接口文档

本页只写 **dsh-vue-chat 实际调用** 的 Host 协议。权威类型在 `deepseek-harness` 的 fetch BFF / Typert Remote；这里按前端二次开发需要展开信封、方法和 mux 帧。

浏览器必须打相对路径 `/api`（经 Vite 代理）。不要把 Host 地址写进页面。

## 三条通道

| 通道 | 方法 / 路径 | 用途 |
|---|---|---|
| fetch BFF | `POST /api/<dot.method>` | 会话、工作区、模型、技能、打开文件 |
| Typert Remote | `POST /api/commands/list` 等 | 斜杠命令目录（payload 包在 `args` 里） |
| 客户端回执 | `POST /api/respond` | 回答 mux 挂起的审批 / 提问 |
| mux | `WebSocket /api/events.mux` | 只下行：事件、投影、队列、Host 广播 |

`GET /api/events.mux` 固定 **426 Upgrade Required**。探活用任意 unary，例如 `session.list`。

---

## 公共信封

实现：`src/dsh/rpc.js`。

### 请求（BFF 与 Remote 相同外层）

```json
{
  "type": "client-request",
  "rpcId": "<uuid>",
  "method": "<见各节>",
  "payload": {}
}
```

- fetch BFF：`method` 与 URL 相同，例如 URL `/api/session.prompt`，`method` 为 `session.prompt`，`payload` 是方法参数本身。
- Typert Remote：URL `/api/commands/list`，`method` 为 `commands/list`，`payload` 必须是 `{ "args": { ... } }`。

`rpcId` 用 `crypto.randomUUID()`。响应里的 `rpcId` 必须对得上。

### 成功响应

```json
{
  "type": "server-response",
  "rpcId": "<同一 uuid>",
  "result": {
    "ok": true,
    "value": {}
  }
}
```

`dshCall` / `dshRemote` 返回 `result.value`。

### 业务失败

```json
{
  "type": "server-response",
  "rpcId": "<同一 uuid>",
  "result": {
    "ok": false,
    "error": { "code": "fork-unavailable", "message": "..." }
  }
}
```

封装会抛 `Error`，文案为 `code: message`。HTTP 非 2xx 另抛 `transport failure ... HTTP <status>`。

### 审批 / 提问回执

```json
{
  "type": "client-response",
  "rpcId": "<mux 帧上的 rpcId>",
  "result": { "ok": true, "value": {} }
}
```

成功：`{ "accepted": true }`。已失效：`{ "accepted": false, "reason": "not-pending" }`。

---

## fetch BFF

封装都在 `rpc.js`。`payload` 下列的是 `dshCall` 发出的对象。

### `session.list`

启动与刷新侧栏。

- payload：`{}`
- 返回：`{ items: SessionItem[] }`

`SessionItem` 本页用到的字段：

| 字段 | 含义 |
|---|---|
| `sessionId` | 不透明 id |
| `cwd` | 工作目录；打开相对路径、复用 blank 时用 |
| `blank` | 尚未真正开跑的空会话 |
| `title` | 少用；标题优先 `projections.values.title` |
| `updatedAt` | 毫秒时间戳，排序与「N 分钟前」 |
| `running` | Host 认为该会话在跑 |
| `origin` | `'subagent'` 的不进侧栏 |
| `parentSessionId` | 分叉谱系；有父且父在列表里则缩进 |
| `projections.values` | 列表里能带的投影快照（至少 `title`、`permissions`） |

### `session.create`

- payload：`{}` 或 `{ workspaceId }`
- 返回：`{ sessionId }`

有 `workspaceId` 时落到该组；否则未分组。本页会先复用同组 / 未分组的 blank，没有再 create。

### `session.history`

打开会话与「加载更早」。

- payload：`{ sessionId, maxMessages?, beforeSeq? }`
- 本页：`maxMessages` 固定 50（`HISTORY_PAGE`）
- 返回：`{ events, hasMore, projections }`

`events[]` 每项：`{ event, view? }`，结构与 mux `session/event` 的内层相同。第一页从日志尾部往回取；更早一页传 `beforeSeq: 当前 oldestSeq`。

`projections.values` 是打开时的投影快照，用来播种 UI，再用 live `session/projection` 覆盖。

### `session.prompt`

发送用户消息或斜杠命令。

- payload：

```json
{
  "sessionId": "...",
  "mode": "queue",
  "content": [],
  "clientTimeZone": "Asia/Shanghai"
}
```

`content` 块：

```json
{ "type": "text", "text": "你好" }
```

```json
{ "type": "image", "mediaType": "image/png", "data": "<base64>", "name": "截图.png" }
```

时区由 `Intl.DateTimeFormat().resolvedOptions().timeZone` 填。`mode` 本页固定 `'queue'`。

- 返回：通常 `{ accepted: true }`。斜杠若被 Host 当命令吃掉，可能带 `command`；本页见 `command` 则不把 `running` 乐观打成 true。
- **没有回答正文。** 正文走 mux。

### `session.cancel`

停止当前轮。

- payload：`{ sessionId }`

### `session.fork`

- payload：`{ sessionId }` 或 `{ sessionId, atSeq }`
- 返回：`{ sessionId }`（子会话）
- 失败码：`fork-unavailable`（没有已完成轮次，或锚点所在轮还在跑）

`atSeq` 是消息行上的 `event.seq`。Host 会锚到该 seq **之后第一个** `turn/end`。不传 `atSeq` 则锚最后一轮已完成。本页分叉后会 `session.rename` 成 `原标题 (1)`（`increasedForkTitle`）。

### `session.rename`

- payload：`{ sessionId, title }`

### `session.models`

- payload：`{ sessionId }`
- 返回（本页使用）：

```json
{
  "current": { "provider": "deepseek", "model": "...", "reasoningEffort": "..." },
  "groups": [
    {
      "id": "deepseek",
      "models": [
        {
          "id": "...",
          "name": "...",
          "reasoning": {
            "defaultEffort": "...",
            "efforts": [{ "id": "...", "name": "...", "description": "..." }]
          }
        }
      ]
    }
  ],
  "failures": [],
  "routable": true
}
```

### `session.selectModel`

- payload：`{ sessionId, provider, model, reasoningEffort? }`
- 返回：`{ selected: { provider, model, reasoningEffort? } }`

### `session.attachment`

历史图片块只有 `attachmentId`，展示前再拉字节。

- payload：`{ sessionId, attachmentId }`
- 返回：`{ data: "<base64>", attachment: { mediaType, ... } }`
- 本页拼成 `data:<mediaType>;base64,<data>`

### `session.updateQueue`

- payload：`{ sessionId, itemId, action }`
- 本页只用：`action: { kind: 'remove' }`

队列内容本身来自 mux `session/queue`，不要轮询。

### `workspace.list`

- payload：`{}`
- 返回：`{ items: Workspace[], archivedSessionIds: string[] }`

`Workspace`：`workspaceId`、`title`、`path`、`sessionIds[]`、`createdAt`。

`archivedSessionIds` 是全局归档集合。侧栏用它过滤；没有「已归档」列表 API 被本页调用。

### `workspace.archiveSession`

- payload：`{ sessionId }`
- 返回：`{ archivedSessionIds }`（完整新列表）

### `host.openPath`

用操作系统默认程序打开路径。

- payload：`{ path }`（绝对路径，或本页已用会话 `cwd` 拼好的路径）
- 失败时聊天行保持静默（`openHostFile` 吞错）

### `skill.list`

- payload：`{ sessionId }`
- 返回：`{ skills: Skill[] }` 或直接数组（本页两种都认）

`Skill`：`name`、`description`、`modelInvocable?`。`modelInvocable === false` 时菜单文案加「仅用户 ·」。

---

## Typert Remote

### `POST /api/commands/list`

**不是** fetch BFF 的 `command.list`（BFF 方法表里没有它）。

- `method` / URL：`commands/list`
- payload：`{ "args": { "agentId": "<sessionId>" } }`
- 返回：命令数组，或本页当成数组用的值

本页认的字段：

| 字段 | 用途 |
|---|---|
| `name` | 斜杠名，不含 `/` |
| `description` | 菜单第二行 |
| `input.hint` | 需要参数时的幽灵提示；有 hint 的命令选中后变成 token + 灰字 |

远程失败时 `commands.js` 回退到内置 `HOST_FALLBACK`（plan / compact / goal / permission / feedback / export），并始终合并本地 `/model`。

---

## `POST /api/respond`

mux 的 `approval/requested`、`question/requested` 是 `server-request`，浏览器必须用**同一** `rpcId` 回执。

### 审批

```json
{
  "sessionId": "...",
  "approvalId": "...",
  "outcome": "allow" | "deny"
}
```

`outcome` 以 `ApprovalPanel` 发出的值为准。

### 提问

```json
{
  "sessionId": "...",
  "answer": {}
}
```

`answer` 由 `QuestionPanel` 按 `questions[]` 拼出。Host 接受后 mux 会再推 `question/resolved`。

---

## mux WebSocket

### 连接

```
ws://<Vite 主机>/api/events.mux
```

https 页用 `wss:`。本页用 `new URL('/api/events.mux', window.location.href)` 再改协议，保证和页面同 host。

连上后**不要 send**。用 `sessionId` 过滤帧：`watchSession(id)` 之后只消化该会话（Host 级工作区广播除外）。

### 外层

每条文本帧：

```json
{
  "type": "server-request",
  "rpcId": "<uuid，审批/提问时要回传>",
  "payload": { "type": "<帧类型>", "...": "..." }
}
```

其它 `type` 本页忽略。

### 帧类型

#### `session/event`

对话日志的一条。

```json
{
  "type": "session/event",
  "sessionId": "...",
  "event": {
    "type": "user/message",
    "seq": 12,
    "time": 1710000000000,
    "data": {}
  },
  "view": { "for": "call", "view": { "card": "terminal", "title": "ls" } }
}
```

`view` 可选。工具卡优先读它。`seq` 单调；`useMux` 丢弃 `seq <= lastSeq`。

#### `session/projection`

```json
{
  "type": "session/projection",
  "sessionId": "...",
  "key": "title",
  "value": "任意 JSON"
}
```

本页消费的 `key`：

| key | UI |
|---|---|
| `title` | 顶栏、侧栏名 |
| `permissions` | 权限芯片；`{ currentValue, options: [{ value, name }] }` |
| `todos` | 任务条 |
| `plan` | 计划芯片；有值则显示「Plan ×」 |
| `imageLimits` | 粘贴/拖放上限 |
| `contextPressure` | 上下文环占用 |
| `contextBreakdown` | 环的分段明细 |
| `tokenUsage` | 底栏 token |
| `sessionStats` | 底栏步数 / 时长 |

未识别的 key 仍写入 `projections` 对象，方便以后接线。

#### `host/session-status`

```json
{ "type": "host/session-status", "sessionId": "...", "running": true }
```

驱动顶栏「生成中」、侧栏绿点、输入栏停止按钮。`running === true` 时该会话不再算 blank。

#### 其它 `host/*`

| type | 本页行为 |
|---|---|
| `host/workspace-changed` | 插入或替换该工作区 |
| `host/workspace-removed` | 去掉该工作区并刷新列表 |
| `host/workspace-order-changed` | 按 `workspaceIds[]` 重排 |
| `host/archived-sessions-changed` | 用 `archivedSessionIds[]` 替换归档集合 |

#### `session/queue`

```json
{
  "type": "session/queue",
  "sessionId": "...",
  "items": [
    { "id": "...", "placement": "queued", "text": "..." }
  ]
}
```

`placement` 为 `queued` 或 `steering` 的进 `QueueDock`。整帧替换，不是增量。

#### `approval/requested` / `approval/resolved`

requested（外层带 `rpcId`）：

```json
{
  "type": "approval/requested",
  "sessionId": "...",
  "approvalId": "...",
  "toolName": "...",
  "reason": "...",
  "callId": "..."
}
```

resolved：`{ "type": "approval/resolved", "approvalId": "..." }`，清下面板。

#### `question/requested` / `question/resolved`

requested：

```json
{
  "type": "question/requested",
  "sessionId": "...",
  "questions": []
}
```

resolved：用 `questionRpcId` 或外层 `rpcId` 对上后清面板。

---

## `session/event` 的 `event.type`

`useMux.applyEvent` 的折叠规则。未列出的类型被丢弃（`default: break`）。

| `event.type` | 行 / 副作用 |
|---|---|
| `user/message` | `source.kind === 'user'` → 右气泡；否则 `context` 行。content 抽 text + image attachmentId |
| `tool/call` | 新 `tool`/`skill` 行，`state: 'running'`。`data.name` / `callId` / `arguments`（JSON 字符串） |
| `tool/result` | 按 `callId` 合到运行中的行。失败看 `data.error` 或块上 `isError` |
| `assistant/chunk` | `reasoning-delta` → think；`text-delta` → 流式 answer |
| `assistant/message` | 结束流式，或回放时一次性插入 think+answer；带 usage |
| `todo/write` | 刷新任务条（下一轮 `turn/start` 会清空） |
| `turn/start` | 新 turn 状态；live 时 `running=true`；清 todos |
| `step/start` | 首 token / 步计时 |
| `turn/end` | 打 `forkable`、产物、用时。`reason.kind`：`aborted`/`interrupted` 标停止；`error` / `max-tokens` 出 notice |
| `compaction/start` `summary` `end` | 压缩 notice |
| `llm/retry` `llm/retry-started` | 重试 notice |
| `command/run` `command/done` | 斜杠命令 notice |

### `user/message` 的 `source.kind`

| kind | 展示 |
|---|---|
| `user` | 右侧用户气泡 |
| `session-reference` | 上下文召回 |
| `agent-instructions` | 上下文注入（指令文件变更） |
| `plugin` / `skill-invocation` / 其它 | 上下文注入 |

### 工具 `view.card`

mux `view.view.card`（或历史条目上的同名字段）：

| card | 组件 | 要点 |
|---|---|---|
| `terminal` | `TerminalCard` | `title`/`cwd`/`output`/`exitCode`/`signal` |
| `read` | `ReadCard` | `path`、`lines[{ number, text }]`、`totalLines`、`lang` |
| `diff` | `DiffCard` | `diffs[{ path, oldText, newText }]`；计入产物 |
| `web` | `WebCard` | `kind: 'search'\|'fetch'` |
| `generic` + `kind: 'edit'` | 产物路径 | `locations[].path` |
| （无 card，grep/glob/search） | `SearchCard` | `search.js` 从 result 文本/meta 折 |

`tools.js` 的名称映射：`bash`/`pwsh` → terminal 变体；`read`/`web_fetch` → read；`web_search`/`grep`/`glob` → search；`write`/`edit`/`run_code`/`skill` 各成一类。

---

## 运行中判定

下面任一为真，输入栏进入「生成中 / 可停止 / 回车排队」：

1. 本地乐观：刚 `session.prompt` 且返回没有 `command`
2. mux `turn/start`（非 replay）
3. mux `host/session-status.running`
4. 打开会话时 `session.list` 该项的 `running`

`turn/end` 且队列里没有 `queued`/`steering` 时清 running。`session.cancel` 后等 `turn/end` 把卡片标成「已停止」。

---

## 调用对照

| 用户动作 | 通道 |
|---|---|
| 打开页面 | WS mux → `session.list` + `workspace.list` |
| 点会话 | `session.history` + `session.models` + `commands/list` + `skill.list` |
| 新对话 | `session.create({ workspaceId? })`（先复用 blank） |
| 发送 / 斜杠 | `session.prompt` |
| 停止 | `session.cancel` |
| 去掉排队 | `session.updateQueue` `{ kind: 'remove' }` |
| 换模型 | `session.selectModel` |
| 换权限 | `session.prompt` 文本 `/permission <preset>` |
| 退出计划 | `session.prompt` 文本 `/plan off` |
| 消息分叉 | `session.fork({ sessionId, atSeq })` + `session.rename` |
| 侧栏分叉 | `session.fork({ sessionId })` + `session.rename` |
| 重命名 | `session.rename` |
| 归档 | `workspace.archiveSession` |
| 打开文件 | `host.openPath` |
| 历史图 | `session.attachment` |
| 批准 / 拒绝 / 答题 | `POST /api/respond` |

---

## 扩展接口时的约定

1. 新 BFF 方法：URL 与 `method` 都用点号（`foo.bar`），payload **不要**包 `args`。
2. 新 Typert 方法：URL 用斜杠（`foo/bar`），payload 必须 `{ args }`。
3. 新的模型可见输入必须能从 session 日志复原——那是 Host 的不变量；前端只需保证 prompt 块写进 `session.prompt`。
4. 需要 Host 问浏览器时，走 mux `server-request` + `/api/respond`，不要发明第二条回执通道。
5. 在 `deepseek-harness` 里查完整方法表：fetch BFF 的 `RpcMethodMap`；命令目录是 `ctx.remote.commands.list`。
