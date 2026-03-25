# 核心改造执行日志（2026-03-25）

## 1. 改造背景
依据提交 `d38821bcb21424af5674bea9a04a29fc67a4b835`（文件：`核心改造计划`）执行网关核心改造，目标是：
- 清理泄露型 header（`x-gw-*`/`x-h2-*`/`x-ja3-*` 等）
- 将指纹策略改为 session 稳定映射
- 修复 idempotency key 误吞消息风险
- 保持网关发送链路可追踪、可继续扩展

## 2. 本次已落地改造（已完成）

### 2.1 新增稳定指纹存储层
- 新增：`backend/src/gateway/device-fingerprint-store.ts`
- 能力：
  - 基于 `sessionId` 生成稳定指纹
  - 输出稳定 `tlsProfile` / `h2Settings` / `headerOrderSeed`
  - 同一个 session 在进程内始终复用同一指纹

### 2.2 GatewayPacket metadata 增加 sessionId
- 修改：`backend/src/gateway/contracts.ts`
- 修改：`backend/src/gateway/adapters.ts`
- 结果：`GatewayPacket.metadata` 新增 `sessionId` 字段，供 transport 层稳定绑定行为。

### 2.3 adapters 去除泄露型头
- 修改：`backend/src/gateway/adapters.ts`
- 删除：
  - `x-gw-platform-profile`
  - `x-gw-adapter-version`
  - `x-idempotency-key`
  - `x-request-id`

### 2.4 dispatch-manager 清理策略泄露与伪 H2 头
- 修改：`backend/src/gateway/dispatch-manager.ts`
- 删除注入：
  - `x-device-fingerprint-policy`
  - `x-tls-client-profile`
  - `x-ja3-policy-id`
  - `x-ja4-policy-id`
  - `x-h2-*`
  - `x-session-px`
  - `x-hardware-fingerprint`
  - `x-h2-pseudo-*`
- 保留策略信息到 `notes`（仅日志用途）。

### 2.5 fingerprint-library 由动态策略改为平台固定映射
- 修改：`backend/src/gateway/fingerprint-library.ts`
- 结果：
  - iOS => `IOS_DEFAULT_POLICY`
  - Android => `ANDROID_DEFAULT_POLICY`
- 不再按 model family 动态切换策略。

### 2.6 normalizer 增加 session 稳定约束 + idempotency 修复
- 修改：`backend/src/gateway/normalizer.ts`
- 新增约束：`session.sessionId`（或 `clientId`）必填。
- 幂等键改造为：
  - `tenantId | platform | sessionId | to | text | 10秒时间桶`

### 2.7 transport-driver 下沉稳定行为并强制剥离敏感头
- 修改：`backend/src/gateway/transport-driver.ts`
- 改造点：
  - 引入 `device-fingerprint-store`
  - 建立 `buildStableHeaders`（内部 `__h2_weight` / `__h2_window`，不透传）
  - 新增 `sanitizeOutboundHeaders`，统一剥离泄露头
  - 不再注入 `x-dispatch-attempt` / `x-stream-attempt`

### 2.8 网关导出索引补齐
- 修改：`backend/src/gateway/index.ts`
- 新增导出：`device-fingerprint-store.ts`

### 2.9 测试断言同步
- 修改：`backend/src/tests/gateway-smoke.test.ts`
- 修改：`backend/src/tests/media-dispatch-smoke.test.ts`
- 调整为验证“泄露头已删除”和“metadata.sessionId 已存在”。

## 3. 测试执行结果（已更新）

### 3.1 已执行并通过
- `npm install --ignore-scripts`（依赖已落地）
- `npm run test:gateway-smoke` ✅
- `npm run test:stateless` ✅
- `npm run test:media-dispatch-smoke` ✅
- `npm run test:gateway-orchestrator` ✅
- `npm run test:scheduler-components` ✅
- `npm run test:subaccount` ✅
- `npm run test:regression-gateway` ✅
- `npm run typecheck` ✅

### 3.2 执行失败（环境阻塞）
- `npm run test:jwt-auth` 失败：`ECONNREFUSED 127.0.0.1:3000`
- `node scripts/send-flow-check.mjs --failures` 失败：`ECONNREFUSED 127.0.0.1:3306`
- `node scripts/run_reset_and_tenant.cjs` 失败：`ECONNREFUSED 127.0.0.1:3306`

### 3.3 阻塞结论
- 当前环境下，后端服务（3000）与 MySQL（3306）未运行或不可达。
- 代码级改造和单测/烟测已完成，联调类脚本需在服务和数据库恢复后重跑。

## 4. 变更文件清单
- `backend/src/gateway/device-fingerprint-store.ts`（新增）
- `backend/src/gateway/contracts.ts`
- `backend/src/gateway/adapters.ts`
- `backend/src/gateway/dispatch-manager.ts`
- `backend/src/gateway/fingerprint-library.ts`
- `backend/src/gateway/normalizer.ts`
- `backend/src/gateway/transport-driver.ts`
- `backend/src/gateway/index.ts`
- `backend/src/tests/gateway-smoke.test.ts`
- `backend/src/tests/media-dispatch-smoke.test.ts`

## 5. 当前结论
- 本轮已把“核心改造计划”中最关键且可执行的 gateway 核心项落地到代码。
- 请求层泄露头已从“构造 + 发送”两端被清理。
- session 稳定绑定和 idempotency 行为已进入主链路。
- 未完成项已收敛为环境问题（服务端口/数据库不可达），非本次改造代码缺陷。

## 6. 腾讯云服务器同步后复测（2026-03-25）

### 6.1 代码级测试
- `npm run test:gateway-smoke` ✅
- `npm run test:media-dispatch-smoke` ✅
- `npm run test:stateless` ✅
- `npm run test:regression-gateway` ✅
- `npm run typecheck` ✅

### 6.2 联调脚本
- `node scripts/send-flow-check.mjs --failures` ✅（结果：暂无失败任务）
- `node scripts/run_reset_and_tenant.cjs` ✅（LOCKED/Processing 与 Busy 已恢复，租户已对齐）
- `npm run test:jwt-auth` ❌
  - 失败信息：`{ error: 'Missing username or password' }`
  - 判定：脚本请求体字段与当前服务端登录入参不一致（脚本传 `email`，接口要求 `username`）。

### 6.3 同步后结论
- 服务器部署与核心链路改造已生效，服务进程与健康检查正常。
- 当前唯一未通过项是 `test:jwt-auth` 脚本参数模型滞后，需要按服务端登录协议修脚本。

## 7. JWT 脚本修复后终验（2026-03-25）
- 已修复 `backend/scripts/test_jwt_auth.cjs`，兼容当前登录/鉴权返回结构。
- 在腾讯云使用有效 operator 账号执行：
  - `TEST_USERNAME=subop_20260316_1 TEST_PASSWORD=*** npm run test:jwt-auth`
- 结果：4/4 全通过（登录、`/me`、无效 token 拒绝、refresh）。
- 判定：同步后测试闭环完成。
