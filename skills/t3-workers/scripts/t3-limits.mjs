#!/usr/bin/env node
// A read-only client for the qualified T3 0.1.0 native client protocol.
import { readFile } from 'node:fs/promises';
import { parseArgs } from 'node:util';
import { pathToFileURL } from 'node:url';

export class LimitsError extends Error {
  constructor(code, message, exitCode = 4) {
    super(message);
    this.code = code;
    this.exitCode = exitCode;
  }
}

const incompatible = () => new LimitsError('INCOMPATIBLE_RESPONSE', 'The server response does not match the qualified T3 0.1.0 client protocol.');
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const string = value => typeof value === 'string' && value.length > 0;
const iso = value => string(value) && /^\d{4}-\d\d-\d\dT/.test(value) && Number.isFinite(Date.parse(value));
const optional = (target, key, value, valid = string) => {
  if (value !== undefined && value !== null) {
    if (!valid(value)) throw incompatible();
    target[key] = value;
  }
};

function validateSelections(instanceId, environmentId) {
  if (instanceId !== undefined && (typeof instanceId !== 'string' || !instanceId.trim())) {
    throw new LimitsError('INVALID_INSTANCE', 'A supplied instance ID must not be empty or whitespace.', 2);
  }
  if (environmentId !== undefined && (typeof environmentId !== 'string' || !environmentId.trim())) {
    throw new LimitsError('INVALID_ENVIRONMENT_ID', 'A supplied environment ID must not be empty or whitespace.', 2);
  }
}

export function validateUrl(input) {
  let url;
  try { url = new URL(input); } catch { throw new LimitsError('INVALID_URL', 'Use an HTTPS environment URL or a loopback HTTP URL.', 2); }
  const host = url.hostname.toLowerCase();
  const loopback = host === 'localhost' || host === '[::1]' || /^127(?:\.\d{1,3}){3}$/.test(host);
  if (url.username || url.password || url.search || url.hash || url.pathname !== '/' ||
      (url.protocol !== 'https:' && !(url.protocol === 'http:' && loopback))) {
    throw new LimitsError('INVALID_URL', 'Use an HTTPS environment origin or loopback HTTP origin, without credentials, path, query or fragment.', 2);
  }
  return url.origin;
}

export function parseToken(input) {
  let token = input.trim();
  if (token.startsWith('{')) {
    try { token = JSON.parse(token).token; } catch { token = undefined; }
  }
  if (!string(token) || /\s/.test(token) || token.length > 16384) {
    throw new LimitsError('INVALID_TOKEN', 'Supply a raw T3 session token or native issue JSON containing a token field.', 2);
  }
  return token;
}

function cleanText(value, token) {
  if (typeof value !== 'string') throw incompatible();
  let text = token ? value.split(token).join('[redacted]') : value;
  text = text.replace(/Bearer\s+[^\s,;]+/gi, 'Bearer [redacted]')
    .replace(/([?&](?:wsTicket|token)=)[^\s&#]+/gi, '$1[redacted]')
    .replace(/[\u0000-\u001f\u007f]/g, ' ');
  return text.slice(0, 2000);
}

function normalizeProvider(provider, token) {
  if (!object(provider) || !string(provider.instanceId) || !string(provider.driver) ||
      typeof provider.enabled !== 'boolean' || typeof provider.installed !== 'boolean' ||
      !['ready', 'warning', 'error', 'disabled'].includes(provider.status) || !iso(provider.checkedAt) ||
      !object(provider.auth) || !['authenticated', 'unauthenticated', 'unknown'].includes(provider.auth.status)) throw incompatible();
  const account = {
    instanceId: cleanText(provider.instanceId, token), driver: cleanText(provider.driver, token),
    enabled: provider.enabled, installed: provider.installed,
    version: provider.version == null ? null : cleanText(provider.version, token), status: provider.status,
    auth: { status: provider.auth.status }, checkedAt: provider.checkedAt,
    usageLimits: null,
  };
  if (account.version !== null && !string(account.version)) throw incompatible();
  for (const key of ['displayName', 'availability', 'unavailableReason', 'message']) {
    if (provider[key] !== undefined && provider[key] !== null) account[key] = cleanText(provider[key], token);
  }
  if (account.availability !== undefined && !['available', 'unavailable'].includes(account.availability)) throw incompatible();
  for (const key of ['type', 'label', 'email', 'workspaceId']) {
    if (provider.auth[key] !== undefined && provider.auth[key] !== null) account.auth[key] = cleanText(provider.auth[key], token);
  }
  if (provider.usageLimits === undefined || provider.usageLimits === null) return account;
  const native = provider.usageLimits;
  if (!object(native) || !iso(native.checkedAt) || !Array.isArray(native.windows)) throw incompatible();
  const limits = { checkedAt: native.checkedAt, windows: native.windows.map(window => {
    if (!object(window) || !string(window.id) || !['session', 'weekly', 'monthly', 'other'].includes(window.kind) ||
        !string(window.label) || !Number.isFinite(window.usedPercent) || window.usedPercent < 0 || window.usedPercent > 100) throw incompatible();
    const result = {
      id: cleanText(window.id, token), kind: window.kind, label: cleanText(window.label, token),
      usedPercent: window.usedPercent, remainingPercent: 100 - window.usedPercent,
    };
    optional(result, 'resetsAt', window.resetsAt, iso);
    optional(result, 'windowDurationMins', window.windowDurationMins, v => Number.isInteger(v) && v >= 0);
    return result;
  }) };
  if (native.resetCredits !== undefined && native.resetCredits !== null) {
    const credits = native.resetCredits;
    if (!object(credits) || !Number.isInteger(credits.availableCount) || credits.availableCount < 0) throw incompatible();
    limits.resetCredits = { availableCount: credits.availableCount };
    optional(limits.resetCredits, 'nextExpiresAt', credits.nextExpiresAt, iso);
  }
  if (native.unavailable !== undefined && native.unavailable !== null) {
    if (!object(native.unavailable) || !['unsupported', 'probeFailed'].includes(native.unavailable.reason)) throw incompatible();
    limits.unavailable = { reason: native.unavailable.reason };
    if (native.unavailable.message !== undefined) limits.unavailable.message = cleanText(native.unavailable.message, token);
  }
  account.usageLimits = limits;
  return account;
}

function environmentIdentity(value) {
  if (!object(value) || !string(value.environmentId) || value.serverVersion !== '0.1.0' || value.orchestrationProtocolVersion !== 2) {
    throw new LimitsError('UNQUALIFIED_SERVER', 'This reader is qualified only for T3 0.1.0, orchestration protocol 2.');
  }
  const identity = { environmentId: value.environmentId, serverVersion: value.serverVersion, orchestrationProtocolVersion: 2 };
  optional(identity, 'label', value.label);
  return identity;
}

export function normalizeConfig(config, { url, token, instanceId, refreshRequested = false, readAt = new Date().toISOString(), expectedEnvironmentId } = {}) {
  validateSelections(instanceId, expectedEnvironmentId);
  if (!object(config) || !Array.isArray(config.providers)) throw incompatible();
  const environment = environmentIdentity(config.environment);
  if (expectedEnvironmentId && environment.environmentId !== expectedEnvironmentId) {
    throw new LimitsError('ENVIRONMENT_MISMATCH', 'The server identity changed or does not match the requested environment.');
  }
  environment.environmentId = cleanText(environment.environmentId, token);
  if (environment.label !== undefined) environment.label = cleanText(environment.label, token);
  const providers = instanceId !== undefined ? config.providers.filter(p => p?.instanceId === instanceId) : config.providers;
  if (instanceId !== undefined && providers.length === 0) throw new LimitsError('INSTANCE_NOT_FOUND', 'The requested provider instance is not in this environment.', 2);
  if (instanceId !== undefined && providers.length !== 1) throw incompatible();
  return {
    schemaVersion: 1, source: { url, ...environment }, readAt, refreshRequested,
    accounts: providers.map(provider => normalizeProvider(provider, token)),
  };
}

function checkAborted(signal) { if (signal.aborted) throw signal.reason; }

function connectRpc(url, WebSocketImpl, signal) {
  checkAborted(signal);
  let socket;
  try { socket = new WebSocketImpl(url); }
  catch { throw new LimitsError('TRANSPORT_ERROR', 'The T3 native WebSocket connection could not be opened.', 3); }
  const pending = new Map();
  let sequence = 0, finished = false;
  let resolveOpen, rejectOpen;
  const opened = new Promise((resolve, reject) => { resolveOpen = resolve; rejectOpen = reject; });
  const fail = error => {
    rejectOpen(error);
    for (const entry of pending.values()) entry.reject(error);
    pending.clear();
  };
  const onOpen = () => resolveOpen();
  const onError = () => fail(new LimitsError('TRANSPORT_ERROR', 'The T3 native WebSocket connection failed.', 3));
  const onClose = () => { if (!finished) fail(new LimitsError('CONNECTION_CLOSED', 'T3 closed the connection before the read completed.', 3)); };
  const onAbort = () => fail(signal.reason);
  const onMessage = async event => {
    try {
      const data = typeof event.data === 'string' ? event.data : await event.data.text();
      const decoded = JSON.parse(data);
      for (const frame of Array.isArray(decoded) ? decoded : [decoded]) {
        if (!object(frame) || !string(frame._tag)) throw incompatible();
        if (['Defect', 'ClientProtocolError'].includes(frame._tag)) {
          fail(new LimitsError('PROTOCOL_ERROR', 'T3 reported a native client protocol error.'));
          continue;
        }
        if (frame._tag !== 'Exit') continue; // Events and unrelated responses are not results.
        const request = pending.get(String(frame.requestId));
        if (!request) continue;
        pending.delete(String(frame.requestId));
        if (!object(frame.exit)) { request.reject(incompatible()); continue; }
        if (frame.exit._tag === 'Success') request.resolve(frame.exit.value);
        else if (frame.exit._tag === 'Failure') request.reject(new LimitsError('REMOTE_FAILURE', 'T3 rejected the native read request.', 5));
        else request.reject(incompatible());
      }
    } catch { fail(incompatible()); }
  };
  socket.addEventListener('open', onOpen);
  socket.addEventListener('error', onError);
  socket.addEventListener('close', onClose);
  socket.addEventListener('message', onMessage);
  signal.addEventListener('abort', onAbort, { once: true });
  return {
    async request(tag, payload = {}) {
      await opened;
      checkAborted(signal);
      const id = String(++sequence);
      return new Promise((resolve, reject) => {
        pending.set(id, { resolve, reject });
        try { socket.send(JSON.stringify({ _tag: 'Request', id, tag, payload, headers: [] })); }
        catch { pending.delete(id); reject(new LimitsError('TRANSPORT_ERROR', 'The T3 request could not be sent.', 3)); }
      });
    },
    close() {
      finished = true;
      signal.removeEventListener('abort', onAbort);
      socket.removeEventListener('open', onOpen);
      socket.removeEventListener('error', onError);
      socket.removeEventListener('close', onClose);
      socket.removeEventListener('message', onMessage);
      if (socket.readyState < 2) {
        // A connecting socket may report an error while closing; do not expose it.
        socket.addEventListener('error', () => {}, { once: true });
        socket.close();
      }
    },
  };
}

export async function readLimits({ url = 'http://127.0.0.1:3773', token, instanceId, environmentId, refresh = false, timeoutMs = 15000, fetchImpl = globalThis.fetch, WebSocketImpl = globalThis.WebSocket, now = () => new Date() } = {}) {
  validateSelections(instanceId, environmentId);
  url = validateUrl(url);
  token = parseToken(token ?? '');
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 300000) throw new LimitsError('INVALID_TIMEOUT', 'timeout-ms must be an integer from 1 to 300000.', 2);
  if (typeof WebSocketImpl !== 'function') throw new LimitsError('UNSUPPORTED_NODE', 'Use Node.js 22.15 or newer with native WebSocket support.', 2);
  const controller = new AbortController();
  const timeout = new LimitsError('TIMEOUT', 'The quota read timed out. A requested native refresh may still finish; no retry or cancellation was sent.', 6);
  let rpc;
  const timer = setTimeout(() => controller.abort(timeout), timeoutMs);
  const deadline = new Promise((_, reject) => controller.signal.addEventListener('abort', () => reject(controller.signal.reason), { once: true }));
  const operation = async () => {
    const requestJson = async (path, options = {}) => {
      let response;
      try { response = await fetchImpl(`${url}${path}`, { ...options, redirect: 'error', signal: controller.signal }); }
      catch { checkAborted(controller.signal); throw new LimitsError('HTTP_ERROR', 'The T3 environment could not be reached.', 3); }
      checkAborted(controller.signal);
      if (!response.ok) throw new LimitsError('HTTP_STATUS', `T3 returned HTTP ${response.status}. Check the environment URL and session authorization.`, 3);
      try { return await response.json(); } catch { throw incompatible(); }
    };
    const descriptor = environmentIdentity(await requestJson('/.well-known/t3/environment'));
    checkAborted(controller.signal);
    if (environmentId && descriptor.environmentId !== environmentId) throw new LimitsError('ENVIRONMENT_MISMATCH', 'The discovered environment does not match the requested environment. No session token was sent.');
    const ticket = await requestJson('/api/auth/websocket-ticket', { method: 'POST', headers: { Authorization: `Bearer ${token}` } });
    checkAborted(controller.signal);
    if (!object(ticket) || !string(ticket.ticket) || !iso(ticket.expiresAt)) throw incompatible();
    const wsUrl = new URL('/ws', url);
    wsUrl.protocol = wsUrl.protocol === 'https:' ? 'wss:' : 'ws:';
    wsUrl.searchParams.set('orchestrationProtocol', '2');
    wsUrl.searchParams.set('wsTicket', ticket.ticket);
    rpc = connectRpc(wsUrl.href, WebSocketImpl, controller.signal);
    let config = await rpc.request('server.getConfig');
    // Validate the binding before refresh: an unknown instance otherwise refreshes silently.
    normalizeConfig(config, { url, token, instanceId, expectedEnvironmentId: descriptor.environmentId });
    if (refresh) {
      const refreshed = await rpc.request('server.refreshProviders', instanceId !== undefined ? { instanceId } : {});
      if (!object(refreshed) || !Array.isArray(refreshed.providers)) throw incompatible();
      config = await rpc.request('server.getConfig');
    }
    return normalizeConfig(config, { url, token, instanceId, expectedEnvironmentId: descriptor.environmentId, refreshRequested: refresh, readAt: now().toISOString() });
  };
  try { return await Promise.race([operation(), deadline]); }
  finally { clearTimeout(timer); controller.abort(timeout); rpc?.close(); }
}

export function formatText(result) {
  const lines = [`T3 ${result.source.serverVersion} · ${result.source.label ?? result.source.environmentId}`, `Read: ${result.readAt}; refresh requested: ${result.refreshRequested ? 'yes' : 'no'}. Latest upstream probe outcome is not established by this read.`];
  for (const account of result.accounts) {
    lines.push(`\n${account.displayName ?? account.instanceId} [${account.instanceId}] · ${account.driver} · ${account.status} · auth ${account.auth.status}`);
    const limits = account.usageLimits;
    lines.push(`  Provider checked: ${account.checkedAt}; limits checked: ${limits?.checkedAt ?? 'unknown'}`);
    if (!limits || limits.windows.length === 0) lines.push('  Capacity: unknown');
    for (const window of limits?.windows ?? []) lines.push(`  ${window.label}: ${window.remainingPercent}% remaining (${window.usedPercent}% used)${window.resetsAt ? `; resets ${window.resetsAt}` : ''}`);
    if (limits?.unavailable) lines.push(`  ${limits.unavailable.reason}${limits.unavailable.message ? `: ${limits.unavailable.message}` : ''}`);
    if (limits?.resetCredits) lines.push(`  Reset credits: ${limits.resetCredits.availableCount} (not consumed)`);
  }
  if (result.accounts.length === 0) lines.push('No native provider instances were returned.');
  return lines.join('\n');
}

const HELP = `Usage: node t3-limits.mjs [--url ORIGIN] [--environment-id ID] [--instance ID] [--refresh] [--json]
                          [--token-stdin | --token-file PATH] [--timeout-ms N]

Read the native provider-limit snapshot from T3 0.1.0/protocol 2. Requires Node >=22.15.
Auth: exactly one of T3_WORKERS_TOKEN, --token-stdin, or --token-file (raw token/native issue JSON).
URL: --url, then T3_WORKERS_URL, then http://127.0.0.1:3773.
Environment pin: --environment-id or T3_WORKERS_ENVIRONMENT_ID. No token is sent before discovery.
--refresh explicitly requests native non-inference probes; it does not prove cache-busting or fresh quota.
No login, token issuance, credential storage, reset consumption or automatic retry is performed.`;

export async function main(args = process.argv.slice(2), { env = process.env, stdin = process.stdin, stdout = process.stdout, stderr = process.stderr, readFileImpl = readFile, readLimitsImpl = readLimits } = {}) {
  let json = args.includes('--json');
  try {
    const { values } = parseArgs({ args, options: {
      url: { type: 'string' }, 'environment-id': { type: 'string' }, instance: { type: 'string' }, refresh: { type: 'boolean' }, json: { type: 'boolean' },
      'token-stdin': { type: 'boolean' }, 'token-file': { type: 'string' }, 'timeout-ms': { type: 'string' }, help: { type: 'boolean', short: 'h' },
    } });
    json = values.json ?? false;
    if (values.help) { stdout.write(`${HELP}\n`); return 0; }
    const environmentId = values['environment-id'] ?? env.T3_WORKERS_ENVIRONMENT_ID;
    validateSelections(values.instance, environmentId);
    const sources = [Boolean(env.T3_WORKERS_TOKEN), Boolean(values['token-stdin']), values['token-file'] !== undefined].filter(Boolean).length;
    if (sources !== 1) throw new LimitsError('AUTH_SOURCE', 'Supply exactly one auth source: T3_WORKERS_TOKEN, --token-stdin, or --token-file.', 2);
    let input = env.T3_WORKERS_TOKEN;
    if (values['token-file'] !== undefined) {
      try { input = await readFileImpl(values['token-file'], 'utf8'); }
      catch { throw new LimitsError('TOKEN_FILE', 'The specified token file could not be read.', 2); }
    }
    if (values['token-stdin']) {
      input = '';
      for await (const chunk of stdin) {
        input += chunk;
        if (input.length > 32768) throw new LimitsError('INVALID_TOKEN', 'The token input is too large.', 2);
      }
    }
    const result = await readLimitsImpl({
      url: values.url ?? env.T3_WORKERS_URL ?? 'http://127.0.0.1:3773', token: parseToken(input),
      environmentId,
      instanceId: values.instance, refresh: values.refresh ?? false,
      timeoutMs: values['timeout-ms'] === undefined ? 15000 : Number(values['timeout-ms']),
    });
    stdout.write(`${json ? JSON.stringify(result) : formatText(result)}\n`);
    return 0;
  } catch (error) {
    const known = error instanceof LimitsError ? error : new LimitsError('INVALID_ARGUMENTS', 'Check the command options with --help.', 2);
    const output = json ? JSON.stringify({ schemaVersion: 1, error: { code: known.code, message: known.message } }) : `${known.code}: ${known.message}`;
    (json ? stdout : stderr).write(`${output}\n`);
    return known.exitCode;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = await main();
}
