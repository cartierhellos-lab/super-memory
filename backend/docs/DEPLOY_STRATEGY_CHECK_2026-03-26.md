# 部署策略核对清单（2026-03-26）

目标文件：`/部署策略`
基准提交：`a1bc1ab5503fa11ad8536c76e21c323044b7caf8`

## 1. 核心要求落实

- Session 稳定指纹绑定：已完成
  - 代码：`src/gateway/device-fingerprint-store.ts`
  - 说明：同一 `sessionId` 生成确定性 `tlsProfile/h2/headerOrderSeed/retryJitterSeed`

- Header 顺序稳定：已完成
  - 代码：`src/gateway/header-order.ts` + `src/gateway/transport-driver.ts`
  - 说明：发送前使用 tuple 排序，避免对象重排导致顺序漂移

- 行为节奏模型：已完成
  - 代码：`src/behavior/behavior-profile.ts` + `src/behavior/behavior-engine.ts`
  - 说明：包含 `baseInterval/burst/cooldown/activeHours/activityTier`

- Dispatch 接入行为决策：已完成
  - 代码：`src/gateway/dispatch-engine.ts`
  - 说明：`pause` 决策会释放 session 并按 delay 重入队列

- Retry 具有人类节奏且与 session 绑定：已完成
  - 代码：`src/gateway/transport-driver.ts` + `src/gateway/dispatch-engine.ts`
  - 说明：transport 层使用 session 派生 jitter；dispatch 层失败重试延迟已改为优先使用 `sessionId`

- 请求层防泄露：已完成
  - 代码：`src/gateway/transport-driver.ts`
  - 说明：统一剥离 `x-gw-* / x-h2-* / x-ja*` 等泄露头

- 监控最低要求日志：已完成
  - 代码：`src/gateway/transport-driver.ts`
  - 说明：新增
    - `[gateway:request] { sessionId, traceId, latency, status, retryCount }`
    - `[gateway:fingerprint]` 抽样日志（`sessionId/tlsProfile/h2/headerSeed`）

## 2. 策略“上线前自检”映射

- 请求层
  - 无 `x-gw-* / x-h2-*`：代码防线已存在，网关烟测覆盖
  - 无 retry header：发送阶段无 retry 头注入逻辑

- 行为层
  - 每个 session 行为不同：`buildBehaviorProfile(sessionId)` 哈希分层
  - 有 pause（秒级 + 分钟级）：`baseInterval/cooldown/非活跃时段 1h pause`
  - 有非活跃时间：`activeHours` 判定

- 指纹层
  - 同 session header 顺序不变：seed 固定 + tuple 排序
  - 同 session retry 节奏一致：session seed 派生 jitter

- 系统层
  - 重启后一致：纯函数 deterministic，无运行时随机状态依赖
  - 多节点一致：同输入同输出（sessionId 哈希）

## 3. 新增自检测试

- 文件：`src/tests/deploy-strategy-check.test.ts`
- 脚本：`npm run test:deploy-strategy`
- 覆盖：
  - 指纹 deterministic
  - header 顺序稳定
  - 行为决策 deterministic（同时间桶）
  - 群体分层（active/occasional/silent）
