# 链路保护备忘录（2026-03-25）

## 1. 一定不能随意修改的文件（高危）

以下文件是发送主链路的骨架，未经链路评审不要随意改：

1. `backend/src/gateway/normalizer.ts`
- 作用：输入合法化、session 必要字段约束、默认 idempotency key 生成。
- 不能随意改的原因：
  - 放宽 session 校验会直接引入随机 401 和不可复现失败。
  - 改坏 idempotency 规则会出现吞消息或重复发送。

2. `backend/src/gateway/adapters.ts`
- 作用：组装最终请求头与 body，写入 `GatewayPacket.metadata`。
- 不能随意改的原因：
  - 这里是“泄露型 header”最容易回流的位置。
  - `metadata.sessionId` 是 transport 稳定行为绑定根字段，不能移除。

3. `backend/src/gateway/dispatch-manager.ts`
- 作用：调度构包、媒体分支、平台差异控制、策略日志记录。
- 不能随意改的原因：
  - 往这里重新加 `x-h2-*`/`x-ja3-*`/`x-session-px` 会破坏清洁请求目标。
  - iOS session 检查逻辑属于防故障阀门，不能删除。

4. `backend/src/gateway/transport-driver.ts`
- 作用：最终出站、重试、timeout、header 清洗、稳定指纹行为承载。
- 不能随意改的原因：
  - `sanitizeOutboundHeaders` 是最后一道防线，删掉会直接泄露实现特征。
  - `buildStableHeaders` 负责“同 session 行为稳定”，改成随机会放大风控命中。

5. `backend/src/gateway/device-fingerprint-store.ts`
- 作用：session -> fingerprint 稳定映射。
- 不能随意改的原因：
  - 若改成时间随机/请求随机，整条链路稳定性会下降，回到“同号忽然死掉”。

6. `backend/src/gateway/contracts.ts`
- 作用：所有 gateway 模块共享协议契约。
- 不能随意改的原因：
  - `GatewayPacket.metadata.sessionId` 是新链路关键字段，不能删。

7. `backend/src/gateway/fingerprint-library.ts`
- 作用：策略选择入口。
- 不能随意改的原因：
  - 当前已定为平台固定映射，若恢复动态模型切换会引入不可控波动。

## 2. 禁止回流项（Review 必查）

任何 PR 出现以下内容应直接打回：

- 新增 `x-gw-*` 头
- 新增 `x-h2-*` / `x-ja3-*` / `x-ja4-*` 头
- 新增 `x-stream-attempt` / `x-dispatch-attempt` 头
- 删除 `metadata.sessionId`
- 删除 `sanitizeOutboundHeaders`
- 将 `device-fingerprint-store` 改成随机策略

## 3. 当前做到的步骤位置

当前已完成：

- Step 1：删除暴露型 headers（已落地）
- Step 2：引入 Session Fingerprint Cache（已落地）
- Step 3：transport 层接管稳定行为（已落地）
- Step 4：请求“清洁化”防线（已落地）
- Step 5：idempotency key 修复（已落地）

尚未完成：

- 联调脚本（依赖本地服务）：`test:jwt-auth`、`send-flow-check --failures`、`run_reset_and_tenant`
- 入站链路验证与生产式压测验证

## 4. 你的下一步计划（完整执行版）

### Phase A：先跑通测试与基础验收

1. 安装依赖并确认可执行环境
- 在 `backend/` 运行：`npm install`
 - 当前状态：已完成（本轮使用 `npm install --ignore-scripts`）

2. 跑最小回归
- `npm run test:gateway-smoke`
- `npm run test:media-dispatch-smoke`
- `npm run test:stateless`
 - 当前状态：已完成并通过

3. 跑网关相关回归
- `npm run test:gateway-orchestrator`
- `npm run test:scheduler-components`
- `npm run test:subaccount`
 - 当前状态：已完成并通过（`test:regression-gateway` 也已通过）

### Phase B：跑功能闭环（计划文件里的 blocking 项）

1. 路由/API 前缀统一核查
- 确认前端 `VITE_API_BASE_URL` 指向 `/api`
- 确认后端所有入口路由都挂在 `/api`

2. JWT 与环境一致性
- 检查各节点 `.env`：`JWT_SECRET`、`ADMIN_PASSWORD_HASH`
- 跑：`npm run test:jwt-auth`
 - 当前阻塞：`ECONNREFUSED 127.0.0.1:3000`

3. 任务与租户恢复
- 运行：`node scripts/run_reset_and_tenant.cjs`
- 观察 LOCKED -> Pending 迁移结果
 - 当前阻塞：`ECONNREFUSED 127.0.0.1:3306`

4. 失败审计
- 运行：`node scripts/send-flow-check.mjs --failures`
- 分类追踪 401 / worker 崩溃 / proxy 失败
 - 当前阻塞：`ECONNREFUSED 127.0.0.1:3306`

5. 入站链路验证
- 验证：`POST /api/inbound/tn`
- 确认 Chat UI 实时刷新和租户接收正常

### Phase C：提交前审计清单

1. Header 审计
- 抓包确认不存在：`x-gw-*`、`x-h2-*`、`x-ja3-*`、retry headers

2. 稳定性审计
- 同 session 连续发送，确认设备特征不漂移

3. 幂等审计
- 同内容短时多发，确认不被异常吞掉

4. 变更冻结
- 锁定本备忘录中的高危文件，后续仅通过评审变更

## 5. 备注

- 当前仓库还有 `backend/package-lock.json` 的历史改动（非本次链路改造核心）。
- 建议下一步先把依赖安装和测试跑通，再决定是否拆分提交（核心改造提交 / lockfile 提交）。
- 当前最小可执行恢复动作：先启动 MySQL(3306) 和 API 服务(3000)，再重跑 Phase B 三个脚本。
