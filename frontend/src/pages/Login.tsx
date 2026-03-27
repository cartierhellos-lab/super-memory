import React, { useMemo, useState } from 'react';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { message } from 'antd';
import { clearAuth, setAuthToken } from '../utils/jwt-auth';
import { apiUrl } from '../api';
import { getDefaultAdminRoute, normalizeAppRole } from '../utils/access-control';
import './Login.css';

const CAPTCHA_CHARS = '346789ABCDEFGHJKMNPQRTUVWXY';

const createCaptcha = () =>
  Array.from({ length: 4 }, () => CAPTCHA_CHARS[Math.floor(Math.random() * CAPTCHA_CHARS.length)]).join('');

const normalizeCaptchaValue = (value: string) =>
  value
    .trim()
    .toUpperCase()
    .replace(/0/g, 'O')
    .replace(/[IL]/g, '1')
    .replace(/Z/g, '2')
    .replace(/S/g, '5');
const LOGIN_THEME_KEY = 'cm-login-theme';

const Login: React.FC = () => {
  const navigate = useNavigate();
  const { i18n, t } = useTranslation();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [captchaInput, setCaptchaInput] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [captcha, setCaptcha] = useState(() => createCaptcha());
  const loginTheme = useMemo<'light' | 'dark'>(() => {
    if (typeof window === 'undefined') return 'light';
    const next = window.localStorage.getItem(LOGIN_THEME_KEY);
    return next === 'dark' ? 'dark' : 'light';
  }, []);

  const isZh = i18n.language === 'zh-CN' || i18n.language.startsWith('zh');
  const canSubmit = useMemo(
    () => Boolean(username.trim() && password.trim() && captchaInput.trim()) && !loading,
    [username, password, captchaInput, loading]
  );

  const refreshCaptcha = () => {
    setCaptcha(createCaptcha());
    setCaptchaInput('');
  };

  const handleLogin = async () => {
    if (!username.trim() || !password.trim()) {
      const msg = isZh ? '请输入用户名和密码' : 'Please enter username and password';
      setError(msg);
      message.error(msg);
      return;
    }

    if (normalizeCaptchaValue(captchaInput) !== normalizeCaptchaValue(captcha)) {
      const msg = isZh ? '验证码错误' : 'Captcha incorrect';
      setError(msg);
      message.error(msg);
      refreshCaptcha();
      return;
    }

    setLoading(true);
    setError('');
    try {
      const response = await axios.post(apiUrl('/login'), {
        username: username.trim(),
        password,
      });

      const { token, user } = response.data || {};
      if (!token || !user) {
        throw new Error(isZh ? '登录返回数据不完整' : 'Login response is incomplete');
      }

      setAuthToken(token, {
        id: user.id,
        username: user.username,
        role: user.role,
        tenantId: user.tenantId,
      });
      setPassword('');

      navigate(getDefaultAdminRoute(normalizeAppRole(user.role)), { replace: true });
    } catch (err: any) {
      clearAuth();
      let msg = err?.response?.data?.error || err?.response?.data?.message || err?.message || (isZh ? '登录失败' : 'Login failed');
      if (typeof msg === 'string' && (msg.includes('CORS') || msg.includes('8080'))) {
        msg = isZh
          ? '无法连接后端。请先启动 backend，再确认 frontend 的 VITE_BACKEND_TARGET 指向本地服务。'
          : 'Backend connection failed. Start the backend first, then confirm VITE_BACKEND_TARGET points to the local service.';
      }
      setError(String(msg));
      message.error(String(msg));
      refreshCaptcha();
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="cm-login-shell" data-theme={loginTheme}>
      <div className="cm-login-overlay" />
      <div className="cm-login-layout">
        <section className="loginCard">
          <div className="cm-login-card-top">
            <div className="cm-login-card-logo">
              <img src="/favicon.png" alt={t('brand.name', { defaultValue: 'Cartier&Miller' })} />
            </div>
            <div className="cm-login-card-brand">
              <div className="title cm-brand-title">{t('brand.name', { defaultValue: 'Cartier&Miller' })}</div>
              <div className="cm-kpi-eyebrow">{t('login.workspace_entry', { defaultValue: isZh ? '进入工作区' : 'Enter workspace' })}</div>
            </div>
          </div>
          {error ? <div className="errorText">{error}</div> : null}

          <div className="inputGroup">
            <label htmlFor="login-username" className="fieldLabel">
              {t('auth.username', { defaultValue: isZh ? '用户名' : 'Username' })}
            </label>
            <input
              id="login-username"
              name="username"
              className="input"
              placeholder={t('login.username_placeholder', { defaultValue: isZh ? '输入管理员账号' : 'Enter your operator username' })}
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleLogin()}
              autoComplete="username"
            />
          </div>

          <div className="inputGroup">
            <label htmlFor="login-password" className="fieldLabel">
              {t('auth.password', { defaultValue: isZh ? '密码' : 'Password' })}
            </label>
            <input
              id="login-password"
              name="password"
              className="input"
              type={showPassword ? 'text' : 'password'}
              placeholder={t('login.password_placeholder', { defaultValue: isZh ? '输入登录密码' : 'Enter your password' })}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleLogin()}
              autoComplete="current-password"
            />
            <button
              type="button"
              className="eye"
              onClick={() => setShowPassword((value) => !value)}
              aria-label={showPassword ? t('login.hide_password', { defaultValue: isZh ? '隐藏密码' : 'Hide password' }) : t('login.show_password', { defaultValue: isZh ? '显示密码' : 'Show password' })}
            >
              {showPassword ? t('login.hide_short', { defaultValue: 'Hide' }) : t('login.show_short', { defaultValue: 'Show' })}
            </button>
          </div>

          <div className="inputGroup">
            <label htmlFor="login-captcha" className="fieldLabel">
              {t('login.captcha_label', { defaultValue: isZh ? '验证码校验' : 'Captcha Verification' })}
            </label>
            <div className="captchaRow">
              <input
                id="login-captcha"
                name="captcha"
                className="captchaInput"
                placeholder={t('login.captcha_placeholder', { defaultValue: isZh ? '输入验证码' : 'Enter captcha' })}
                value={captchaInput}
                onChange={(e) => setCaptchaInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleLogin()}
                autoComplete="one-time-code"
              />
              <button
                type="button"
                className="captchaBox"
                onClick={refreshCaptcha}
                title={t('login.refresh_captcha', { defaultValue: isZh ? '点击刷新验证码' : 'Click to refresh captcha' })}
                aria-label={t('login.refresh_captcha', { defaultValue: isZh ? '刷新验证码' : 'Refresh captcha' })}
              >
                {captcha}
              </button>
            </div>
          </div>

          <button
          type="button"
          className="loginBtn"
          disabled={!canSubmit}
          onClick={handleLogin}
        >
            {loading ? t('login.logging_in', { defaultValue: isZh ? '登录中...' : 'Logging in...' }) : t('login.enter_control_center', { defaultValue: isZh ? '进入控制台' : 'Enter Control Center' })}
          </button>

          <div className="cm-login-footnote">
            {t('login.footnote', {
              defaultValue: isZh
                ? '登录即表示你已知悉当前隐私与服务协议更新。'
                : 'Signing in confirms awareness of the latest privacy and service agreement update.'
            })}
          </div>
        </section>
      </div>
    </div>
  );
};

export default Login;
