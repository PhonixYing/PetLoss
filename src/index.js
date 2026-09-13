// PetLoss Worker
//
// 1) 兼容旧链接：/PetLoss 或 /PetLoss/xxx → / 或 /xxx（base 为 / 之前的历史产物）
// 2) 官网联系表单：POST /api/contact → 通过 Resend API 发送到 friends@petloss.app

const PREFIX = '/PetLoss';
const RESEND_API = 'https://api.resend.com/emails';
const TO_EMAIL = 'friends@petloss.app';
const FROM_EMAIL = 'PetLoss 官網 <support@petloss.app>';
const MAX_MESSAGE = 4000;

// ── 首頁語言自動跳轉 ──────────────────────────────
const LOCALE_PREFIXES = ['/', '/zh/', '/en/', '/pt/', '/ru/', '/es/', '/ko/', '/fa/', '/ja/'];
const FALLBACK_PREFIX = '/en/';
const LANG_TO_PREFIX = {
  en: '/en/',
  pt: '/pt/',
  ru: '/ru/',
  es: '/es/',
  ko: '/ko/',
  fa: '/fa/',
  ja: '/ja/',
};

function getCookie(header, name) {
  if (!header) return null;
  for (const part of header.split(';')) {
    const index = part.indexOf('=');
    if (index === -1) continue;
    if (part.slice(0, index).trim() === name) {
      return decodeURIComponent(part.slice(index + 1).trim());
    }
  }
  return null;
}

function pickLocalePrefix(acceptLanguage) {
  const ranked = acceptLanguage
    .split(',')
    .map((part) => {
      const [tag, ...params] = part.trim().split(';');
      let q = 1;
      for (const param of params) {
        const match = param.trim().match(/^q=([0-9.]+)$/);
        if (match) q = Number.parseFloat(match[1]);
      }
      return { tag: tag.trim().toLowerCase(), q };
    })
    .filter(({ tag }) => tag && tag !== '*')
    .sort((a, b) => b.q - a.q);

  for (const { tag } of ranked) {
    if (tag.startsWith('zh')) {
      // 繁體中文（root） / 简体中文（/zh/）
      return /hant|tw|hk|mo/.test(tag) ? '/' : '/zh/';
    }
    const base = tag.split('-')[0];
    if (LANG_TO_PREFIX[base]) return LANG_TO_PREFIX[base];
  }
  return FALLBACK_PREFIX;
}

function localeRedirect(url, prefix) {
  const target = new URL(url.toString());
  target.pathname = prefix;
  return new Response(null, {
    status: 302,
    headers: {
      location: target.toString(),
      vary: 'Accept-Language',
      'cache-control': 'no-store',
    },
  });
}

function serveAssets(request, env, url) {
  const isHome = url.pathname === '/' || url.pathname === '/index.html';
  if (isHome && (request.method === 'GET' || request.method === 'HEAD')) {
    const saved = getCookie(request.headers.get('cookie'), 'pl_lang');
    if (saved && LOCALE_PREFIXES.includes(saved)) {
      // 使用者手動選過語言，尊重其選擇
      if (saved !== '/') return localeRedirect(url, saved);
    } else {
      const acceptLanguage = request.headers.get('accept-language');
      // 沒有 Accept-Language（多數爬蟲）時不跳轉，確保 / 可被抓取
      if (acceptLanguage) {
        const prefix = pickLocalePrefix(acceptLanguage);
        if (prefix !== '/') return localeRedirect(url, prefix);
      }
    }
  }
  return env.ASSETS.fetch(new Request(url, request));
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });
}

function escapeHtml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

async function handleContact(request, env) {
  if (request.method === 'OPTIONS') {
    return new Response(null, {
      headers: {
        'access-control-allow-origin': '*',
        'access-control-allow-methods': 'POST, OPTIONS',
        'access-control-allow-headers': 'Content-Type',
      },
    });
  }
  if (request.method !== 'POST') {
    return json({ ok: false, error: 'Method not allowed' }, 405);
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ ok: false, error: 'Invalid request' }, 400);
  }

  // 蜜罐欄位：機器人填了就假裝成功，不發送
  if (body._gotcha) {
    return json({ ok: true });
  }

  const name = String(body.name || '').trim().slice(0, 80);
  const email = String(body.email || '').trim().slice(0, 120);
  const message = String(body.message || '').trim().slice(0, MAX_MESSAGE);

  if (message.length < 2) {
    return json({ ok: false, error: '留言內容太短了' }, 400);
  }
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return json({ ok: false, error: '信箱格式不正確' }, 400);
  }
  if (!env.RESEND_API_KEY) {
    return json({ ok: false, error: 'Server not configured' }, 500);
  }

  const subject = `[PetLoss 官網] ${name ? `來自 ${name} 的留言` : '訪客留言'}`;
  const text =
    `姓名/Name: ${name || '(未填寫)'}\n` +
    `信箱/Email: ${email || '(未填寫)'}\n\n` +
    `留言/Message:\n${message}\n`;

  const html =
    `<div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;max-width:560px;margin:0 auto;">` +
    `<h2 style="color:#6b5dc7;">💌 PetLoss 官網新留言</h2>` +
    `<table style="border-collapse:collapse;width:100%;">` +
    `<tr><td style="padding:6px 0;color:#666;width:120px;">姓名</td><td style="padding:6px 0;">${escapeHtml(name) || '（未填寫）'}</td></tr>` +
    `<tr><td style="padding:6px 0;color:#666;">信箱</td><td style="padding:6px 0;">${escapeHtml(email) || '（未填寫）'}</td></tr>` +
    `</table>` +
    `<p style="color:#666;margin:16px 0 6px;">留言：</p>` +
    `<div style="background:#f7f5f2;border-radius:12px;padding:16px;white-space:pre-wrap;line-height:1.7;">${escapeHtml(message)}</div>` +
    `</div>`;

  const payload = {
    from: FROM_EMAIL,
    to: [TO_EMAIL],
    subject,
    text,
    html,
  };
  if (email) payload.reply_to = email;

  let resp;
  try {
    resp = await fetch(RESEND_API, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });
  } catch {
    return json({ ok: false, error: 'Send failed' }, 502);
  }

  if (!resp.ok) {
    const errText = await resp.text();
    console.error('Resend error', resp.status, errText);
    return json({ ok: false, error: 'Send failed' }, 502);
  }
  return json({ ok: true });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;

    // 联系表单 API
    if (path === '/api/contact') {
      return handleContact(request, env);
    }

    // /PetLoss 或 /PetLoss/xxx → / 或 /xxx（历史产物兼容）
    if (path === PREFIX || path.startsWith(`${PREFIX}/`)) {
      url.pathname = path.slice(PREFIX.length) || '/';
      return serveAssets(request, env, url);
    }

    // 其余请求交给静态资源服务（首页会依系统语言自动跳转）
    return serveAssets(request, env, url);
  },
};
