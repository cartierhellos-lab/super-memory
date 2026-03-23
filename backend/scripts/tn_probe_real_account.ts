#!/usr/bin/env node
import 'dotenv/config';
import mysql from 'mysql2/promise';
import puppeteer from 'puppeteer';
import TextNowAutomation from '../src/services/textnow-automation.ts';
import { decrypt, decryptProxyPassword } from '../src/shared/crypto.ts';

type AccountRow = {
  id: number;
  phone: string;
  username: string | null;
  password: string | null;
  tn_session_id: string | null;
  tn_session_token_cipher: Buffer | null;
};

type ProxyRow = {
  id: number;
  protocol: string | null;
  host: string;
  port: number;
  username: string | null;
  password: string | null;
  auth_pass_enc: string | null;
};

async function main() {
  const accountId = Number(process.argv[2] || 11);
  const disableProxy = process.argv.includes('--no-proxy');
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST || '127.0.0.1',
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER || 'massmail',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'massmail',
  });

  let browser: puppeteer.Browser | null = null;

  try {
    const [accountRows] = await conn.query(
      `SELECT id, phone, username, password, tn_session_id, tn_session_token_cipher
       FROM accounts
       WHERE id = ?
       LIMIT 1`,
      [accountId]
    ) as any[];
    const account = accountRows?.[0] as AccountRow | undefined;
    if (!account) {
      throw new Error(`Account ${accountId} not found`);
    }

    let proxy: ProxyRow | undefined;
    let proxyServer: string | null = null;
    let proxyPassword = '';
    if (!disableProxy) {
      const [proxyRows] = await conn.query(
        `SELECT p.id, p.protocol, p.host, p.port, p.username, p.password, p.auth_pass_enc
         FROM account_proxy_bindings ap
         INNER JOIN proxies p ON p.id = ap.proxy_id
         WHERE ap.account_id = ? AND ap.is_active = 1 AND p.is_active = 1
         ORDER BY ap.is_primary DESC, ap.id ASC
         LIMIT 1`,
        [accountId]
      ) as any[];
      proxy = proxyRows?.[0] as ProxyRow | undefined;
      if (!proxy) {
        throw new Error(`No active proxy binding for account ${accountId}`);
      }

      const proxyProtocol = String(proxy.protocol || 'http').trim() || 'http';
      proxyServer = `${proxyProtocol}://${proxy.host}:${proxy.port}`;
      proxyPassword = proxy.auth_pass_enc
        ? decryptProxyPassword(proxy.auth_pass_enc)
        : String(proxy.password || '');
    }
    const sessionCookie =
      account.tn_session_token_cipher && Buffer.isBuffer(account.tn_session_token_cipher)
        ? decrypt(account.tn_session_token_cipher)
        : account.tn_session_token_cipher
          ? decrypt(Buffer.from(account.tn_session_token_cipher as any))
          : '';
    const sessionId = String(account.tn_session_id || '');

    browser = await puppeteer.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        ...(proxyServer ? [`--proxy-server=${proxyServer}`] : []),
      ],
      timeout: 120000,
    });

    const page = await browser.newPage();
    if (proxy?.username) {
      await page.authenticate({
        username: String(proxy.username),
        password: proxyPassword,
      });
    }

    const automation = new TextNowAutomation(page);
    const sessionOk = sessionCookie
      ? await (automation as any).bootstrapSession(String(sessionCookie), sessionId)
      : false;
    const loginOk = sessionOk ? true : await automation.login(String(account.username || ''), String(account.password || ''));
    const pageTitle = await page.title().catch(() => '');
    const bodyPreview = await page.evaluate(() => String(document.body?.innerText || '').trim().slice(0, 400)).catch(() => '');

    console.log(JSON.stringify({
      accountId: account.id,
      phone: account.phone,
      proxyId: proxy?.id ?? null,
      proxyServer,
      usedSessionBootstrap: Boolean(sessionCookie),
      hasSessionId: Boolean(sessionId),
      sessionOk,
      loginOk,
      finalUrl: page.url(),
      pageTitle,
      bodyPreview,
    }, null, 2));
  } finally {
    if (browser) {
      await browser.close().catch(() => undefined);
    }
    await conn.end();
  }
}

main().catch((error) => {
  console.error(error?.stack || error?.message || error);
  process.exit(1);
});
