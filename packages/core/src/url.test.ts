import { describe, expect, it } from 'vitest';
import { normalizeUrl, siteName } from './url';

describe('normalizeUrl', () => {
  it('ignores scheme, www, case of host, default ports and trailing slash', () => {
    const a = normalizeUrl('https://www.Example.com:443/Path/');
    expect(a).toBe(normalizeUrl('http://example.com/Path'));
    expect(a).toBe('example.com/Path');
  });

  it('keeps path case (paths can be case-sensitive)', () => {
    expect(normalizeUrl('https://example.com/A')).not.toBe(normalizeUrl('https://example.com/a'));
  });

  it('drops tracking parameters and sorts the rest', () => {
    expect(normalizeUrl('https://example.com/p?b=2&utm_source=x&a=1&fbclid=y&gclid=z')).toBe(
      'example.com/p?a=1&b=2',
    );
  });

  it('drops in-page anchors but keeps app routes in the fragment', () => {
    expect(normalizeUrl('https://example.com/doc#section-2')).toBe('example.com/doc');
    expect(normalizeUrl('https://mail.example.com/#inbox/abc123')).toBe(
      'mail.example.com/#inbox/abc123',
    );
    expect(normalizeUrl('https://app.example.com/#!/settings')).toBe('app.example.com/#!/settings');
  });

  it('leaves browser pages and invalid URLs readable', () => {
    expect(normalizeUrl('chrome://newtab/')).toBe('chrome://newtab/');
    expect(normalizeUrl('not a url')).toBe('not a url');
  });
});

describe('siteName', () => {
  it('returns the host without www', () => {
    expect(siteName('https://www.linkedin.com/jobs/view/1')).toBe('linkedin.com');
    expect(siteName('about:blank')).toBe('about:blank');
  });
});
