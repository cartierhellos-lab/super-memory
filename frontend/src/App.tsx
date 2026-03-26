// src/App.tsx
import React, { useEffect, useMemo, lazy, Suspense } from 'react';
import { ConfigProvider, theme as antTheme, Spin } from 'antd';
import { Routes, Route, Navigate, useLocation, Outlet } from 'react-router-dom';
import zhCN from 'antd/locale/zh_CN';
import enUS from 'antd/locale/en_US';
import { useTranslation } from 'react-i18next';

import { trackPageView } from './utils/analytics';
import './styles/global-polish.css';

import ProtectedRoute from './components/ProtectedRoute';
import RouteErrorFallback from './components/RouteErrorFallback';
import { isAuthenticated, getUserRole } from './utils/jwt-auth';
import {
  canAccessAccountManager,
  canUseConversations,
  getDefaultAdminRoute,
} from './utils/access-control';

import AdminLayout from './layouts/AdminLayout';
import DesktopTitleBar from './components/DesktopTitleBar';
import UpdatePromptModal from './components/UpdatePromptModal';
import PrivacyModal from './components/PrivacyModal';

const Login = lazy(() => import('./pages/Login'));
const Dashboard = lazy(() => import('./pages/Dashboard'));
const Chat = lazy(() => import('./pages/Chat'));
const AccountManager = lazy(() => import('./pages/AccountManager'));
const Profile = lazy(() => import('./pages/Profile'));
const PrivacyPolicy = lazy(() => import('./pages/PrivacyPolicy'));
const ChildrenPrivacy = lazy(() => import('./pages/ChildrenPrivacy'));
const DoNotSell = lazy(() => import('./pages/DoNotSell'));
const NotFound = lazy(() => import('./pages/NotFound'));

const App = () => {
  const location = useLocation();
  const { i18n } = useTranslation();

  useEffect(() => {
    trackPageView(location.pathname);
  }, [location.pathname]);

  const isLoggedIn = isAuthenticated();
  const userRole = getUserRole();
  const defaultAdminRoute = getDefaultAdminRoute(userRole);

  const defaultRoute = useMemo(
    () => (isLoggedIn ? defaultAdminRoute : '/login'),
    [defaultAdminRoute, isLoggedIn]
  );

  const antdTheme = useMemo(() => ({
      algorithm: antTheme.defaultAlgorithm,
    token: {
      colorPrimary: '#55616c',
      colorInfo: '#5f7892',
      colorSuccess: '#2f7a62',
      colorWarning: '#9b7441',
      colorError: '#a35c68',
      colorLink: '#55616c',
      colorBgBase: '#f6f3f1',
      colorBgLayout: '#efeae7',
      colorBgContainer: '#ffffff',
      colorBorder: '#ddd6d2',
      colorBorderSecondary: '#e8e1dd',
      colorText: '#201c19',
      colorTextSecondary: '#655c57',
      colorTextTertiary: '#8d827b',
      borderRadius: 14,
      borderRadiusLG: 22,
      fontFamily: "'IBM Plex Sans', 'Segoe UI', sans-serif",
    },
  }), []);

  const showDesktopUI = isLoggedIn;
  const resolvedLanguage = i18n.resolvedLanguage || i18n.language || 'en-US';
  const antdLocale = resolvedLanguage === 'zh-CN' || resolvedLanguage.startsWith('zh') ? zhCN : enUS;

  const Loader = (
    <Spin
      size="large"
      tip="Loading…"
      style={{ display: 'block', margin: '10% auto' }}
    />
  );

  return (
    <ConfigProvider theme={antdTheme} locale={antdLocale}>
      {showDesktopUI && <DesktopTitleBar />}
      {showDesktopUI && <UpdatePromptModal />}
      <PrivacyModal />

      <Suspense fallback={Loader}>
        <Routes>
          <Route element={<Outlet />} errorElement={<RouteErrorFallback />}>
            <Route path="/login" element={<Login />} />
            <Route path="/" element={<Navigate to={defaultRoute} replace />} />

            {/* Public compliance pages (opened from PrivacyModal) */}
            <Route path="/privacy-policy" element={<PrivacyPolicy />} />
            <Route path="/children-privacy" element={<ChildrenPrivacy />} />
            <Route path="/privacy/do-not-sell" element={<DoNotSell />} />

            <Route
              element={
                <ProtectedRoute allowedRoles={['super_admin', 'agent', 'user']}>
                  <AdminLayout />
                </ProtectedRoute>
              }
            >
              <Route path="/admin/dashboard" element={<Dashboard />} />
              <Route
                path="/admin/accounts"
                element={canAccessAccountManager(userRole) ? <AccountManager /> : <Navigate to={defaultAdminRoute} replace />}
              />
              <Route
                path="/admin/conversations"
                element={canUseConversations(userRole) ? <Chat /> : <Navigate to={defaultAdminRoute} replace />}
              />
              <Route path="/admin/tasks" element={<Navigate to="/admin/dashboard" replace />} />
              <Route path="/admin/profile" element={<Profile />} />
              {/* /admin/settings 重定向到 profile（设置已合并） */}
              <Route path="/admin/settings" element={<Profile />} />
            </Route>

            <Route path="/404" element={<NotFound />} />
            <Route path="*" element={<Navigate to="/404" replace />} />
          </Route>
        </Routes>
      </Suspense>
    </ConfigProvider>
  );
};

export default App;
