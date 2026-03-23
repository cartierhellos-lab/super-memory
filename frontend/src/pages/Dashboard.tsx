// src/pages/Dashboard.tsx
import React, { memo } from "react";
import GlobalSignalPanel from "../components/Dashboard/GlobalSignalPanel";

/**
 * Dashboard – 系统概览面板
 * 仅显示 GlobalSignalPanel（账户概览 + 任务概览 + 健康状态）
 *
 * 任务入口已并入账户概览，不再保留独立 tasks 页面作为主导航项。
 */
const Dashboard: React.FC = () => {
  return (
    <section className="cm-dashboard-shell">
      <div className="cm-dashboard-backdrop" />
      <div className="cm-dashboard-frame">
        <GlobalSignalPanel compact={false} />
      </div>
    </section>
  );
};

export default memo(Dashboard);
