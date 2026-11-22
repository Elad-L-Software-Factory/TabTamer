/** Query parameters that only track clicks and never change the page. */
const TRACKING_PARAMS = new Set([
  'fbclid',
  'gclid',
  'gclsrc',
  'dclid',
  'msclkid',
  'mc_cid',
  'mc_eid',
  'igshid',
  'yclid',
  'twclid',
  'ref',
  'ref_src',
  'ref_url',
  '_hsenc',
  '_hsmi',
  'spm',
]);

const isTracking = (key: string) =>
  key.startsWith('utm_') || TRACKING_PARAMS.has(key.toLowerCase());

/**
 * A comparison key for "is this the same page?".
 * Ignores scheme, www, host case, default ports, trailing slash, tracking parameters,
 * parameter order and in-page anchors. Keeps fragments that look like app routes
 * (e.g. "#inbox/abc" or "#!/settings"), because single-page apps use them as real addresses.
 */
export function normalizeUrl(raw: string): string {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return raw;
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return raw;

  const host = u.hostname.toLowerCase().replace(/^www\./, '');
  const port = u.port ? `:${u.port}` : '';
  let path = u.pathname;
  if (path.length > 1 && path.endsWith('/')) path = path.slice(0, -1);
  if (path === '/') path = '';

  const params = [...u.searchParams.entries()]
    .filter(([k]) => !isTracking(k))
    .sort(([a, av], [b, bv]) => (a === b ? av.localeCompare(bv) : a.localeCompare(b)));
  const query = params.length ? '?' + new URLSearchParams(params).toString() : '';

  const isRoute = u.hash.startsWith('#!') || u.hash.slice(1).includes('/');
  const fragment = isRoute ? u.hash : '';

  return `${host}${port}${path || (fragment ? '/' : '')}${query}${fragment}`;
}

/** Short, human site name: "linkedin.com". */
export function siteName(raw: string): string {
  try {
    const u = new URL(raw);
    if (u.protocol === 'http:' || u.protocol === 'https:') {
      return u.hostname.toLowerCase().replace(/^www\./, '');
    }
  } catch {
    /* fall through */
  }
  return raw;
}
