import React, { memo } from "react";
import {
  Alert,
  Button,
  Card,
  Col,
  Row,
  Skeleton,
  Space,
  Tag,
  Typography,
} from "antd";
import {
  CheckCircleOutlined,
  ClockCircleOutlined,
  ReloadOutlined,
} from "@ant-design/icons";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useDashboardStats } from "../../hooks/useDashboardStats";
import type { DashboardStats } from "../../types/dashboard";

const { Text, Title } = Typography;

interface GlobalSignalPanelProps {
  compact?: boolean;
}

const toPercent = (part: number, total: number) =>
  total > 0 ? Math.round((part / total) * 100) : 0;

const CompactPanel: React.FC<{
  data: DashboardStats;
  onRefresh: () => void;
  t: (key: string, options?: Record<string, unknown>) => string;
}> = ({ data, onRefresh, t }) => (
  <Space size="middle" wrap>
    <Tag color="green">
      {t("dashboard.compact_online")} {data.onlineAccounts ?? 0}
    </Tag>
    <Tag color="blue">
      {t("dashboard.compact_sent")} {data.todaySent ?? 0}
    </Tag>
    <Tag color="orange">
      {t("dashboard.compact_failed")} {data.todayFailed ?? 0}
    </Tag>
    <Button icon={<ReloadOutlined />} size="small" onClick={onRefresh}>
      {t("common.refresh")}
    </Button>
  </Space>
);

const GlobalSignalPanel: React.FC<GlobalSignalPanelProps> = ({ compact = false }) => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { data, loading, error, refresh } = useDashboardStats(30_000);
  const onlineRatio = toPercent(data.onlineAccounts ?? 0, data.totalAccounts ?? 0);
  const completionRate = Math.max(0, Math.min(100, data.completionRate ?? 0));
  const healthScore = Math.max(
    0,
    Math.min(
      100,
      Math.round(
        onlineRatio * 0.55 +
          completionRate * 0.35 -
          (data.todayFailed ?? 0) * 4 -
          (data.deadAccounts ?? 0) * 3
      )
    )
  );

  const executionPressure = Math.max(
    0,
    (data.runningTasks ?? 0) - ((data.onlineAccounts ?? 0) * 2 || 0)
  );
  const riskLoad = (data.deadAccounts ?? 0) + (data.cooldownAccounts ?? 0);
  const lastUpdatedLabel = data.system?.lastUpdate
    ? new Date(data.system.lastUpdate).toLocaleString()
    : t("dashboard.awaiting_first_sync", { defaultValue: "Awaiting first sync" });
  const overviewStats = [
    {
      key: "online",
      label: t("dashboard.account.online"),
      value: data.onlineAccounts ?? 0,
      tone: onlineRatio >= 40 ? "ready" : "cooldown",
      meta: t("dashboard.cards.online_meta", { percent: onlineRatio }),
      onClick: () => navigate("/admin/accounts?status=Ready"),
    },
    {
      key: "sent",
      label: t("dashboard.message.todaySent"),
      value: data.todaySent ?? 0,
      tone: "cooldown",
      meta: t("dashboard.cards.sent_meta"),
      onClick: () => navigate("/admin/conversations"),
    },
    {
      key: "failed",
      label: t("dashboard.message.todayFailed"),
      value: data.todayFailed ?? 0,
      tone: (data.todayFailed ?? 0) > 0 ? "dead" : "ready",
      meta: data.todayFailed
        ? t("dashboard.cards.failed_meta_active")
        : t("dashboard.cards.failed_meta_clear"),
      onClick: () => navigate("/admin/dashboard"),
    },
    {
      key: "running",
      label: t("dashboard.running_tasks"),
      value: data.runningTasks ?? 0,
      tone: executionPressure > 0 ? "busy" : "cooldown",
      meta: t("dashboard.running_of_total", { running: data.runningTasks ?? 0, total: data.totalTasks ?? 0 }),
      onClick: () => navigate("/admin/dashboard"),
    },
  ];
  const healthSignals = [
    {
      key: "coverage",
      label: t("dashboard.inventory_coverage"),
      meta: t("dashboard.inventory_coverage_meta"),
      value: `${onlineRatio}%`,
      color: onlineRatio >= 40 ? "green" : "orange",
    },
    {
      key: "quality",
      label: t("dashboard.execution_quality"),
      meta: t("dashboard.execution_quality_meta"),
      value: `${completionRate}%`,
      color: completionRate >= 80 ? "green" : "orange",
    },
    {
      key: "failures",
      label: t("dashboard.failure_pressure"),
      meta: t("dashboard.failure_pressure_meta"),
      value: String(data.todayFailed ?? 0),
      color: (data.todayFailed ?? 0) > 0 ? "orange" : "green",
    },
  ];

  if (loading) {
    return (
      <div className="cm-page" style={{ padding: 18 }}>
        <Skeleton active paragraph={{ rows: 6 }} />
      </div>
    );
  }

  if (error) {
    return (
      <Card className="cm-page" style={{ padding: 10 }}>
        <Alert
          type="error"
          showIcon
          message={t("common.error")}
          description={error}
          action={<Button icon={<ReloadOutlined />} onClick={refresh}>{t("common.retry")}</Button>}
        />
      </Card>
    );
  }

  if (compact) {
    return <CompactPanel data={data} onRefresh={refresh} t={t} />;
  }

  return (
    <div className="cm-page" style={{ padding: 18 }}>
      <div className="cm-page-header cm-page-header--dashboard">
        <div>
          <Text className="cm-kpi-eyebrow">{t("dashboard.overview_eyebrow")}</Text>
        </div>
        <Space wrap className="cm-dashboard-toolbar">
          <div className="cm-health-pill">
            <CheckCircleOutlined style={{ color: "var(--cm-green)" }} />
            <span>{t("dashboard.system_health")}: {healthScore}%</span>
          </div>
          <div className="cm-health-pill cm-health-pill--muted">
            <ClockCircleOutlined style={{ color: "var(--cm-text-secondary)" }} />
            <span>{lastUpdatedLabel}</span>
          </div>
          <Button icon={<ReloadOutlined />} onClick={refresh}>
            {t("common.refresh")}
          </Button>
        </Space>
      </div>

      <div className="cm-toolbar-shell">
        <div className="cm-toolbar-stats">
          {overviewStats.map((stat) => (
            <button
              key={stat.key}
              type="button"
              className={`cm-toolbar-stat cm-toolbar-stat--${stat.tone}`}
              onClick={stat.onClick}
            >
              <span className="cm-toolbar-stat__label">{stat.label}</span>
              <strong className="cm-toolbar-stat__value">{stat.value}</strong>
              <span className="cm-toolbar-stat__meta">{stat.meta}</span>
            </button>
          ))}
        </div>
        <div className="cm-toolbar-group cm-toolbar-group--actions">
          <Tag color={riskLoad > 0 ? "orange" : "green"}>
            {t("dashboard.risk_inventory")}: {riskLoad}
          </Tag>
          <Button onClick={() => navigate("/admin/accounts")}>{t("dashboard.open_inventory")}</Button>
          <Button type="primary" className="cm-primary-button" onClick={() => navigate("/admin/accounts?tab=proxy-pool")}>
            {t("dashboard.validate_proxy_routing")}
          </Button>
        </div>
      </div>

      <Row gutter={[16, 16]}>
        <Col xs={24} xl={15}>
          <div className="cm-section-card" style={{ padding: 14 }}>
            <div className="cm-page-header" style={{ marginBottom: 12 }}>
              <div>
                <Text className="cm-kpi-eyebrow">{t("dashboard.execution_capacity")}</Text>
                <Title level={4} className="cm-page-title">
                  {t("dashboard.task_throughput")}
                </Title>
              </div>
              <Text style={{ color: "var(--cm-text-secondary)" }}>
                {t("dashboard.running_of_total", { running: data.runningTasks ?? 0, total: data.totalTasks ?? 0 })}
              </Text>
            </div>
            <Row gutter={[16, 16]}>
              <Col xs={24} md={12}>
                <div className="cm-glass-card" style={{ borderRadius: 16, padding: 14 }}>
                  <Text className="cm-kpi-eyebrow">{t("dashboard.completion_rate")}</Text>
                  <div style={{ marginTop: 12 }}>
                    <Title level={2} style={{ color: "var(--cm-text-primary)", margin: 0 }}>
                      {completionRate}%
                    </Title>
                    <Text style={{ color: "var(--cm-text-secondary)" }}>
                      {t("dashboard.success_quality")}
                    </Text>
                  </div>
                </div>
              </Col>
              <Col xs={24} md={12}>
                <div className="cm-glass-card" style={{ borderRadius: 16, padding: 14, height: "100%" }}>
                  <Text className="cm-kpi-eyebrow">{t("dashboard.immediate_actions")}</Text>
                  <Space direction="vertical" size={10} style={{ width: "100%", marginTop: 12 }}>
                    <Button block onClick={() => navigate("/admin/accounts?status=Dead")}>{t("dashboard.recover_locked_inventory")}</Button>
                    <Button block onClick={() => navigate("/admin/conversations")}>{t("dashboard.prioritize_live_conversations")}</Button>
                    <Button block type="primary" className="cm-primary-button" onClick={() => navigate("/admin/accounts?tab=proxy-pool")}>
                      {t("dashboard.validate_proxy_routing")}
                    </Button>
                  </Space>
                </div>
              </Col>
            </Row>
          </div>
        </Col>
        <Col xs={24} xl={9}>
          <div className="cm-section-card" style={{ padding: 14, height: "100%" }}>
            <Text className="cm-kpi-eyebrow">{t("dashboard.live_status")}</Text>
            <Title level={4} className="cm-page-title" style={{ marginTop: 6 }}>
              {t("dashboard.operational_signals")}
            </Title>
            <div className="cm-signal-list" style={{ marginTop: 10 }}>
              {healthSignals.map((signal) => (
                <div key={signal.key} className="cm-signal-item">
                  <div>
                    <strong>{signal.label}</strong>
                    <span>{signal.meta}</span>
                  </div>
                  <Tag color={signal.color}>{signal.value}</Tag>
                </div>
              ))}
              <div className="cm-signal-item">
                <div>
                  <strong>{t("dashboard.cooldown_accounts")}</strong>
                  <span>{t("dashboard.cooldown_accounts_meta")}</span>
                </div>
                <Tag color="orange">{data.cooldownAccounts ?? 0}</Tag>
              </div>
              <div className="cm-signal-item">
                <div>
                  <strong>{t("dashboard.running_tasks")}</strong>
                  <span>{t("dashboard.running_tasks_meta")}</span>
                </div>
                <Tag color="blue">{data.runningTasks ?? 0}</Tag>
              </div>
              <div className="cm-signal-item">
                <div>
                  <strong>{t("dashboard.last_update")}</strong>
                  <span>{t("dashboard.last_update_meta")}</span>
                </div>
                <Tag>
                  {data.system?.lastUpdate
                    ? new Date(data.system.lastUpdate).toLocaleTimeString()
                    : "--"}
                </Tag>
              </div>
            </div>
          </div>
        </Col>
      </Row>
    </div>
  );
};

export default memo(GlobalSignalPanel);
