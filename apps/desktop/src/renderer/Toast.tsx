export interface ToastData {
  message: string;
  action?: { label: string; run: () => void | Promise<void> };
}

export function Toast({ data, onClose }: { data: ToastData; onClose: () => void }) {
  return (
    <div
      role="status"
      className="fixed inset-x-4 bottom-4 flex items-center gap-3 rounded-xl bg-gray-900 px-4 py-3 text-white shadow-lg"
    >
      <span className="flex-1">{data.message}</span>
      {data.action && (
        <button
          type="button"
          className="rounded-lg px-3 py-1 font-semibold text-blue-300 hover:bg-white/10"
          onClick={() => void data.action!.run()}
        >
          {data.action.label}
        </button>
      )}
      <button
        type="button"
        aria-label="Dismiss"
        className="rounded px-1 text-gray-400 hover:text-white"
        onClick={onClose}
      >
        ✕
      </button>
    </div>
  );
}
