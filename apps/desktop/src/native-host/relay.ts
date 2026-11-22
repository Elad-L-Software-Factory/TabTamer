/**
 * Native messaging relay. Chrome/Edge start this process when the browser helper connects.
 * It forwards messages between the browser (stdin/stdout, length-prefixed) and the running
 * TabTamer app (private named pipe, newline-delimited JSON).
 *
 * IMPORTANT: stdout is reserved for the browser protocol. Log to stderr only.
 */
import { randomUUID } from 'node:crypto';
import net from 'node:net';
import {
  LineDecoder,
  NativeMessageDecoder,
  PIPE_NAME,
  encodeLine,
  encodeNativeMessage,
  parseAppCommand,
  parseHelperMessage,
  type HelperMessage,
  type RelayEnvelope,
} from '@tabtamer/core';

const RETRY_MS = 2000;
const relayId = randomUUID();
const pipePath = process.env.TABTAMER_PIPE ?? PIPE_NAME;

let socket: net.Socket | null = null;
let connected = false;
// Keep only the latest hello and tabs snapshot while the app is not reachable.
let pendingHello: HelperMessage | null = null;
let pendingTabs: HelperMessage | null = null;

const log = (msg: string) => process.stderr.write(`[tabtamer-relay] ${msg}\n`);

function sendToApp(envelope: RelayEnvelope): boolean {
  if (!socket || !connected) return false;
  socket.write(encodeLine(envelope));
  return true;
}

function connectToApp(): void {
  const s = net.connect(pipePath);
  socket = s;
  const lines = new LineDecoder();
  s.setEncoding('utf8');
  s.on('connect', () => {
    connected = true;
    if (pendingHello) sendToApp({ relayId, message: pendingHello });
    if (pendingTabs) sendToApp({ relayId, message: pendingTabs });
  });
  s.on('data', (text: string) => {
    for (const raw of lines.push(text)) {
      const cmd = parseAppCommand(raw);
      if (cmd) process.stdout.write(encodeNativeMessage(cmd));
    }
  });
  s.on('error', () => {
    /* handled by close */
  });
  s.on('close', () => {
    connected = false;
    socket = null;
    setTimeout(connectToApp, RETRY_MS);
  });
}

const decoder = new NativeMessageDecoder();
process.stdin.on('data', (chunk: Buffer) => {
  for (const raw of decoder.push(new Uint8Array(chunk))) {
    const message = parseHelperMessage(raw);
    if (!message) continue;
    if (message.type === 'hello') pendingHello = message;
    if (message.type === 'tabs') pendingTabs = message;
    sendToApp({ relayId, message });
  }
});

// The browser closes stdin when the helper disconnects: tell the app, then exit.
process.stdin.on('end', () => {
  sendToApp({ relayId, disconnected: true });
  setTimeout(() => process.exit(0), 100);
});

log(`started ${relayId}`);
connectToApp();
