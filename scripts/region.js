/* eslint-env browser */

// Utility: read/write preferred locale
function getPreferredLocale() {
  try {
    const overrideRaw = sessionStorage.getItem('preferred-locale-override');
    if (overrideRaw) {
      const override = JSON.parse(overrideRaw);
      if (override && override.language) return override;
    }
  } catch (e) {
    // ignore
  }
  try {
    const raw = localStorage.getItem('preferred-locale');
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && parsed.language) return parsed;
    }
  } catch (e) {
    // ignore
  }
  // derive from path as fallback
  const pathParts = window.location.pathname.split('/').filter((p) => p);
  const language = pathParts[0] && pathParts[0].length === 2 ? pathParts[0] : 'en';
  return { language, region: '' };
}

function setPreferredLocale(locale) {
  try {
    localStorage.setItem('preferred-locale', JSON.stringify(locale));
  } catch (e) {
    // ignore
  }
}

// Normalize navigator language into { language: 'en', region: 'gb' }
function normalizeNavigatorLanguage(lang) {
  if (!lang || typeof lang !== 'string') return null;
  const parts = lang.replace('_', '-').split('-');
  const language = (parts[0] || '').toLowerCase();
  const region = (parts[1] || '').toLowerCase();
  if (!language) return null;
  return { language, region };
}

export function detectAndStorePreferredLocale() {
  const params = new URLSearchParams(window.location.search);
  const paramLocale = params.get('locale') || params.get('hlx-locale');
  const paramRegion = params.get('region') || params.get('hlx-region');
  if (paramLocale && paramLocale.toLowerCase() === 'reset') {
    try { sessionStorage.removeItem('preferred-locale-override'); } catch (e) { /* ignore */ }
    try { localStorage.removeItem('preferred-locale'); } catch (e) { /* ignore */ }
    return;
  }

  const existing = getPreferredLocale();
  const pathLang = window.location.pathname.split('/').filter((p) => p)[0];

  // Temporary spoof via URL param (session-only)
  if (paramLocale || paramRegion) {
    let language = (pathLang && pathLang.length === 2) ? pathLang : (existing.language || 'en');
    let region = existing.region || '';
    if (paramLocale) {
      const norm = normalizeNavigatorLanguage(paramLocale);
      if (norm) {
        language = (pathLang && pathLang.length === 2) ? pathLang : (norm.language || language);
        region = norm.region || region;
      }
    }
    if (paramRegion) {
      region = paramRegion.toLowerCase();
    }
    try { sessionStorage.setItem('preferred-locale-override', JSON.stringify({ language, region })); } catch (e) { /* ignore */ }
    return;
  }
  // If we already have a region, keep it; otherwise try to detect
  if (!existing.region) {
    const detected = normalizeNavigatorLanguage(navigator.language || navigator.userLanguage);
    if (detected) {
      // keep path language if present to avoid cross-language redirects
      const hasPathLang = (pathLang && pathLang.length === 2);
      const language = hasPathLang ? pathLang : (detected.language || existing.language);
      const region = detected.region || '';
      setPreferredLocale({ language, region });
      return;
    }
  }
  // Ensure language matches current path if possible
  if (pathLang && pathLang.length === 2 && pathLang !== existing.language) {
    setPreferredLocale({ language: pathLang, region: existing.region || '' });
  }
}

// Sitemap index cache (in-memory + sessionStorage)
let sitemapIndexPromise;

function buildIndex(json) {
  const paths = new Set();
  const regionsByLang = new Map();
  if (json && Array.isArray(json.data)) {
    json.data.forEach((row) => {
      const p = row.path || row.Path || '';
      if (!p) return;
      paths.add(p);
      const parts = p.split('/').filter((s) => s);
      if (parts.length >= 2) {
        const lang = parts[0];
        const region = parts[1].length === 2 ? parts[1] : '';
        if (region) {
          if (!regionsByLang.has(lang)) regionsByLang.set(lang, new Set());
          regionsByLang.get(lang).add(region);
        }
      }
    });
  }
  return { paths, regionsByLang };
}

export async function getSitemapIndex() {
  if (sitemapIndexPromise) return sitemapIndexPromise;

  // try sessionStorage cache
  try {
    const cached = sessionStorage.getItem('sitemap-index-cache');
    if (cached) {
      const { ts, json } = JSON.parse(cached);
      if (ts && (Date.now() - ts) < 10 * 60 * 1000) { // 10 minutes
        const idx = buildIndex(json);
        sitemapIndexPromise = Promise.resolve(idx);
        return sitemapIndexPromise;
      }
    }
  } catch (e) {
    // ignore
  }

  sitemapIndexPromise = fetch('/sitemap.json')
    .then((r) => (r.ok ? r.json() : { data: [] }))
    .then((json) => {
      try { sessionStorage.setItem('sitemap-index-cache', JSON.stringify({ ts: Date.now(), json })); } catch (e) { /* ignore */ }
      return buildIndex(json);
    })
    .catch(() => ({ paths: new Set(), regionsByLang: new Map() }));

  return sitemapIndexPromise;
}

function isInternalUrl(url) {
  try {
    const u = new URL(url, window.location.origin);
    return u.origin === window.location.origin;
  } catch (e) {
    return false;
  }
}

export function computeRegionalizedHref(href, preferred, index) {
  if (!href || !isInternalUrl(href)) return href;
  if (href.startsWith('#') || href.startsWith('mailto:') || href.startsWith('tel:')) return href;

  const u = new URL(href, window.location.origin);
  // do not touch modal links
  if (u.pathname.includes('/modals/')) return href;

  const pathParts = u.pathname.split('/');
  // keep leading and trailing empty elements due to leading '/'
  const parts = pathParts.filter((p, i) => !(i === 0 && p === ''));
  if (parts.length === 0) {
    // root '/'
    const lang = preferred.language || 'en';
    const region = preferred.region || '';
    if (region) {
      const candidate = `/${lang}/${region}/`;
      if (index.paths.has(candidate)) {
        u.pathname = candidate;
        return u.href;
      }
    }
    const fallback = `/${lang}/`;
    if (index.paths.has(fallback)) {
      u.pathname = fallback;
      return u.href;
    }
    return href;
  }

  const lang = parts[0] && parts[0].length === 2 ? parts[0] : preferred.language || 'en';
  let regionInPath = '';
  const [first, second] = parts;
  if (first && first.length === 2 && second && second.length === 2) {
    regionInPath = second;
  }

  if (regionInPath) {
    // already regionalized, keep as-is
    return href;
  }

  const rest = parts.slice(parts[0] && parts[0].length === 2 ? 1 : 0).join('/');
  const region = preferred.region || '';
  if (region) {
    const candidate = `/${lang}/${region}/${rest}`.replace(/\/\/+/, '/');
    if (index.paths.has(candidate)) {
      u.pathname = candidate;
      return u.href;
    }
  }

  // language-level fallback
  const withLang = parts[0] && parts[0].length === 2 ? `/${parts.join('/')}` : `/${lang}/${rest}`;
  if (index.paths.has(withLang)) {
    u.pathname = withLang;
    return u.href;
  }

  return href;
}

export async function localizeLinks(root = document) {
  const preferred = getPreferredLocale();
  const index = await getSitemapIndex();
  const anchors = (root instanceof Element ? root : document).querySelectorAll('a[href]');
  anchors.forEach((a) => {
    const newHref = computeRegionalizedHref(a.getAttribute('href'), preferred, index);
    if (newHref && newHref !== a.href) a.setAttribute('href', newHref);
  });
}

export function initLinkLocalizationObservers() {
  const targetNodes = [document.querySelector('main'), document.querySelector('header'), document.querySelector('footer')].filter(Boolean);
  const observer = new MutationObserver((mutations) => {
    let needsRun = false;
    mutations.forEach((m) => {
      if (m.type === 'childList' && (m.addedNodes && m.addedNodes.length)) needsRun = true;
    });
    if (needsRun) localizeLinks(document);
  });
  targetNodes.forEach((node) => observer.observe(node, { childList: true, subtree: true }));
  // expose for blocks to call explicitly
  window.localizeLinks = localizeLinks;
}

export { getPreferredLocale };
