#!/usr/bin/env node
import 'dotenv/config';
import puppeteer from 'puppeteer';
import { pool } from '../src/shared/db.js';
import { decrypt, decryptProxyPassword } from '../src/shared/crypto.js';
import TextNowAutomation from '../src/services/textnow-automation.js';

type AccountRow = {
  id: number;
  username: string;
  password: string;
  proxy_url?: string | null;
  tn_session_token_cipher?: Buffer | null;
  tn_session_id?: string | null;
};

const buildSessionizedProxyUrl = (rawProxyUrl: string, sessionKey: string) => {
  const value = String(rawProxyUrl || '').trim();
  if (!value) return value;
  try {
    const parsed = new URL(value);
    const normalizedSession = String(sessionKey || '').trim() || 'default';

    if (parsed.username) {
      const username = decodeURIComponent(parsed.username);
      if (username.includes('{session}')) {
        parsed.username = username.replaceAll('{session}', normalizedSession);
      } else if (/(sess(?:ion)?[-_:]?)([a-z0-9]+)/i.test(username)) {
        parsed.username = username.replace(/(sess(?:ion)?[-_:]?)([a-z0-9]+)/i, `$1${normalizedSession}`);
      } else {
        parsed.username = `${username}-session-${normalizedSession}`;
      }
    } else {
      parsed.searchParams.set('session', normalizedSession);
    }
    return parsed.toString();
  } catch {
    return value;
  }
};

const parseArgs = () => {
  const args = process.argv.slice(2);
  const get = (name: string) => {
    const idx = args.indexOf(name);
    return idx >= 0 ? args[idx + 1] : '';
  };
  return {
    accountId: Number(get('--account') || get('-a') || 0),
    proxyUrl: String(get('--proxy') || get('-p') || '').trim(),
    headed: args.includes('--headed'),
    attemptLogin: args.includes('--attempt-login'),
  };
};

const parseProxyUrl = (raw: string) => {
  const value = String(raw || '').trim();
  if (!value) return null;
  try {
    const parsed = new URL(value);
    return {
      server: `${parsed.protocol}//${parsed.hostname}:${parsed.port || (parsed.protocol === 'https:' ? '443' : '80')}`,
      username: decodeURIComponent(parsed.username || ''),
      password: decodeURIComponent(parsed.password || ''),
    };
  } catch {
    return null;
  }
};

async function loadAccount(accountId: number): Promise<AccountRow> {
  const [rows] = await pool.query('SELECT id, username, password, proxy_url, tn_session_token_cipher, tn_session_id FROM accounts WHERE id = ? LIMIT 1', [accountId]) as any[];
  if (!rows?.length) {
    throw new Error(`Account ${accountId} not found`);
  }
  return rows[0] as AccountRow;
}

async function resolveProxyUrlForAccount(accountId: number, fallbackProxyUrl = '') {
  const [bindingRows] = await pool.query(
    `SELECT p.id,
            p.protocol,
            p.host,
            p.port,
            p.username,
            p.password,
            p.auth_pass_enc,
            p.proxy_url_template,
            ap.session_key
       FROM account_proxy_bindings ap
       INNER JOIN proxies p ON p.id = ap.proxy_id
      WHERE ap.account_id = ?
        AND ap.is_active = 1
        AND p.is_active = 1
      ORDER BY ap.is_primary DESC, ap.id ASC
      LIMIT 1`,
    [accountId]
  ) as any[];
  const binding = bindingRows?.[0];
  if (binding) {
    const plainPass =
      binding.password != null && binding.password !== ''
        ? String(binding.password)
        : decryptProxyPassword(binding.auth_pass_enc);
    const base =
      String(binding.proxy_url_template || '').trim() ||
      `${String(binding.protocol || 'http')}://${binding.username ? `${encodeURIComponent(binding.username)}:${encodeURIComponent(plainPass || '')}@` : ''}${binding.host}:${binding.port}`;
    return buildSessionizedProxyUrl(base, String(binding.session_key || `acc-${accountId}`));
  }

  if (fallbackProxyUrl) {
    return buildSessionizedProxyUrl(fallbackProxyUrl, `acc-${accountId}`);
  }
  return '';
}

async function main() {
  const { accountId, proxyUrl, headed, attemptLogin } = parseArgs();
  if (!accountId) {
    console.error('Usage: node --import tsx scripts/debug-textnow-login.ts --account <id> [--proxy <url>] [--attempt-login] [--headed]');
    process.exit(1);
  }

  const account = await loadAccount(accountId);
  const effectiveProxyUrl = proxyUrl || await resolveProxyUrlForAccount(accountId, String(account.proxy_url || ''));
  const proxyConfig = parseProxyUrl(effectiveProxyUrl);
  const browser = await puppeteer.launch({
    headless: headed ? false : true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      ...(proxyConfig?.server ? [`--proxy-server=${proxyConfig.server}`] : []),
    ],
  });

  try {
    const page = await browser.newPage();
    if (proxyConfig?.username) {
      await page.authenticate({ username: proxyConfig.username, password: proxyConfig.password });
    }

    const automation = new TextNowAutomation(page);
    await page.goto('https://app.textnow.com/login', {
      waitUntil: 'networkidle2',
      timeout: 30000,
    }).catch(() => undefined);
    const snapshot = await automation.captureDebugSnapshot(`manual-login-account-${accountId}`, {
      accountId,
      username: account.username,
      proxyUrl: effectiveProxyUrl,
      proxyServer: proxyConfig?.server || '',
      attemptLogin,
      hasSessionCookie: Boolean(account.tn_session_token_cipher),
      sessionId: account.tn_session_id || '',
    });

    console.log('Initial snapshot:', snapshot);

    if (attemptLogin) {
      const sessionCookie =
        account.tn_session_token_cipher && Buffer.isBuffer(account.tn_session_token_cipher)
          ? decrypt(account.tn_session_token_cipher)
          : account.tn_session_token_cipher
            ? decrypt(Buffer.from(account.tn_session_token_cipher))
            : '';

      if (sessionCookie) {
        console.log('Session cookie present for account, but this debug run will exercise the username/password login path.');
      }

      const result = await automation.login(account.username, account.password);
      console.log('Login attempt result:', result);
    }
  } finally {
    await browser.close().catch(() => undefined);
    await pool.end().catch(() => undefined);
  }
}

main().catch(async (error) => {
  console.error(error);
  await pool.end().catch(() => undefined);
  process.exit(1);
});
