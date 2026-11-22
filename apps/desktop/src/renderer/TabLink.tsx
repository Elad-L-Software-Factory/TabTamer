import type { BrowserKind } from '@tabtamer/core';

/** Title + site line. Clicking anywhere on it takes you to that tab in the browser. */
export function TabLink({
  browser,
  tabId,
  title,
  sub,
  subTitle,
  bold,
}: {
  browser: BrowserKind;
  tabId: number;
  title: string;
  sub?: string;
  subTitle?: string | undefined;
  bold?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        void window.tabtamer.focusTab(browser, tabId);
      }}
      title="Go to this tab"
      className="group/link block w-full min-w-0 cursor-pointer text-left"
    >
      <span
        className={`block truncate text-sm group-hover/link:text-brand-dark group-hover/link:underline ${
          bold ? 'font-semibold' : ''
        }`}
      >
        {title}
      </span>
      {sub && (
        <span
          className="block truncate text-xs text-gray-400 group-hover/link:text-brand"
          title={subTitle}
        >
          {sub}
        </span>
      )}
    </button>
  );
}
