import { describe, expect, it } from 'vitest';
import { PROTOCOL_VERSION, parseAppCommand, parseHelperMessage } from './protocol';

describe('parseAppCommand', () => {
  it('accepts listTabs and closeTabs', () => {
    expect(parseAppCommand({ type: 'listTabs', v: PROTOCOL_VERSION, requestId: 'a' })?.type).toBe(
      'listTabs',
    );
    expect(
      parseAppCommand({ type: 'closeTabs', v: PROTOCOL_VERSION, requestId: 'b', tabIds: [1, 2] }),
    ).toMatchObject({ tabIds: [1, 2] });
  });

  it('accepts focusTab and openTabs, and rejects unsafe URLs to open', () => {
    expect(
      parseAppCommand({ type: 'focusTab', v: PROTOCOL_VERSION, requestId: 'f', tabId: 3 }),
    ).toMatchObject({ tabId: 3 });
    expect(
      parseAppCommand({
        type: 'openTabs',
        v: PROTOCOL_VERSION,
        requestId: 'o',
        tabs: [{ url: 'https://example.com', windowId: 1, index: 2 }, { url: 'about:blank' }],
      }),
    ).not.toBeNull();
    expect(
      parseAppCommand({
        type: 'openTabs',
        v: PROTOCOL_VERSION,
        requestId: 'o',
        tabs: [{ url: 'javascript:alert(1)' }],
      }),
    ).toBeNull();
    expect(
      parseAppCommand({ type: 'focusTab', v: PROTOCOL_VERSION, requestId: 'f', tabId: 'x' }),
    ).toBeNull();
  });

  it('rejects bad tab ids, missing request ids and unknown commands', () => {
    expect(
      parseAppCommand({ type: 'closeTabs', v: PROTOCOL_VERSION, requestId: 'b', tabIds: ['1'] }),
    ).toBeNull();
    expect(parseAppCommand({ type: 'listTabs', v: PROTOCOL_VERSION })).toBeNull();
    expect(
      parseAppCommand({ type: 'deleteEverything', v: PROTOCOL_VERSION, requestId: 'c' }),
    ).toBeNull();
  });
});

const tab = {
  id: 1,
  windowId: 10,
  url: 'https://example.com/',
  title: 'Example',
  pinned: false,
  audible: false,
  active: true,
};

describe('parseHelperMessage', () => {
  it('accepts a valid hello', () => {
    const m = parseHelperMessage({
      type: 'hello',
      v: PROTOCOL_VERSION,
      browser: 'edge',
      extensionVersion: '0.1.0',
    });
    expect(m?.type).toBe('hello');
  });

  it('accepts a valid tabs snapshot', () => {
    const m = parseHelperMessage({
      type: 'tabs',
      v: PROTOCOL_VERSION,
      browser: 'chrome',
      tabs: [tab],
    });
    expect(m).toMatchObject({ type: 'tabs', browser: 'chrome' });
  });

  it('rejects unknown types, wrong versions, bad browsers and malformed tabs', () => {
    expect(parseHelperMessage({ type: 'nope', v: PROTOCOL_VERSION })).toBeNull();
    expect(parseHelperMessage({ type: 'tabs', v: 999, browser: 'chrome', tabs: [] })).toBeNull();
    expect(
      parseHelperMessage({ type: 'tabs', v: PROTOCOL_VERSION, browser: 'safari', tabs: [] }),
    ).toBeNull();
    expect(
      parseHelperMessage({
        type: 'tabs',
        v: PROTOCOL_VERSION,
        browser: 'chrome',
        tabs: [{ id: 'x' }],
      }),
    ).toBeNull();
    expect(parseHelperMessage(null)).toBeNull();
    expect(parseHelperMessage('hello')).toBeNull();
  });

  it('accepts a result message', () => {
    const m = parseHelperMessage({
      type: 'result',
      v: PROTOCOL_VERSION,
      requestId: 'r1',
      ok: true,
    });
    expect(m).toMatchObject({ type: 'result', requestId: 'r1', ok: true });
  });
});
