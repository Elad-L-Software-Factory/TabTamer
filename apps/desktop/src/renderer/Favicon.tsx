import { useState } from 'react';

/** Site icon, or a grey square if there is none or it fails to load. */
export function Favicon({ url }: { url?: string | undefined }) {
  const [failed, setFailed] = useState(false);
  const usable = url && !failed && (url.startsWith('https:') || url.startsWith('data:image/'));
  return usable ? (
    <img src={url} alt="" className="h-4 w-4 shrink-0" onError={() => setFailed(true)} />
  ) : (
    <span className="h-4 w-4 shrink-0 rounded bg-gray-200" />
  );
}
