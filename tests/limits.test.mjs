import test from 'node:test';
import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import { formatText, main, normalizeConfig, parseToken, readLimits, validateUrl } from '../skills/t3-workers/scripts/t3-limits.mjs';

// Synthetic released-protocol shapes, not captures or proof of live providers.
const TOKEN = 'test-session-secret';
const stamp = '2026-10-18T12:00:00.000Z';
const descriptor = { environmentId: 'environment-one', label: 'Test environment', serverVersion: '0.1.0', orchestrationProtocolVersion: 2 };
const provider = () => ({
  instanceId: 'codex-one', driver: 'codex', displayName: 'Test account', enabled: true, installed: true,
  version: '1.0', status: 'ready', availability: 'available', checkedAt: stamp,
  auth: { status: 'authenticated', type: 'subscription', label: 'Test', email: 'test@example.invalid', workspaceId: 'workspace-one', action: { token: TOKEN }, profileId: 'private-profile' },
  usageLimits: {
    checkedAt: stamp, credentialFingerprint: 'private-fingerprint',
    windows: [{ id: 'session', kind: 'session', label: 'Session', usedPercent: 12.5, resetsAt: stamp, windowDurationMins: 300 },
      { id: 'weekly', kind: 'weekly', label: 'Weekly', usedPercent: 100 }],
    resetCredits: { availableCount: 2, nextExpiresAt: stamp, nextCreditId: 'private-reset-id' },
  },
  models: [{ secret: TOKEN }], runtimePaths: { home: '/private/home' }, config: { token: TOKEN },
});
const config = (serverVersion = '0.1.0') => ({ environment: { ...descriptor, serverVersion }, providers: [provider()], externalUsage: [{ token: TOKEN }], skills: [{ secret: TOKEN }] });

function harness({ getConfig = config, reply, ticketStatus = 200, discovery = descriptor, hang = false, failConnect = false, ticketHang = false } = {}) {
  const http = [], requests = [], sockets = [];
  class Socket extends EventTarget {
    constructor(url) {
      super(); this.url = url; this.readyState = 0; this.closed = false; sockets.push(this);
      queueMicrotask(() => {
        if (failConnect) this.dispatchEvent(new Event('error'));
        else { this.readyState = 1; this.dispatchEvent(new Event('open')); }
      });
    }
    emit(value) { this.dispatchEvent(new MessageEvent('message', { data: typeof value === 'string' ? value : JSON.stringify(value) })); }
    send(raw) {
      const request = JSON.parse(raw); requests.push(request);
      queueMicrotask(() => {
        if (hang) return;
        if (reply) { reply(this, request); return; }
        const value = request.tag === 'server.refreshProviders' ? { providers: [provider()] } : getConfig();
        this.emit({ _tag: 'Exit', requestId: request.id, exit: { _tag: 'Success', value } });
      });
    }
    close() { this.closed = true; this.readyState = 3; this.dispatchEvent(new Event('close')); }
  }
  const fetchImpl = async (url, options) => {
    http.push({ url, options });
    if (url.endsWith('/.well-known/t3/environment')) return { ok: true, json: async () => discovery };
    if (ticketHang) return new Promise(() => {});
    return { ok: ticketStatus === 200, status: ticketStatus, json: async () => ({ ticket: 'test-ticket-not-session-token', expiresAt: stamp }) };
  };
  return { http, requests, sockets, options: { token: TOKEN, fetchImpl, WebSocketImpl: Socket, now: () => new Date(stamp), timeoutMs: 1000 } };
}

test('normalizer retains applicable windows but excludes unrelated configuration and secret identifiers', () => {
  const result = normalizeConfig(config(), { url: 'http://127.0.0.1:3773', token: TOKEN, readAt: stamp });
  assert.equal(result.schemaVersion, 1);
  assert.equal(result.accounts[0].usageLimits.windows[0].remainingPercent, 87.5);
  assert.equal(result.accounts[0].usageLimits.windows[1].remainingPercent, 0);
  assert.deepEqual(result.accounts[0].usageLimits.resetCredits, { availableCount: 2, nextExpiresAt: stamp });
  const text = JSON.stringify(result);
  for (const privateValue of [TOKEN, 'credentialFingerprint', 'nextCreditId', 'externalUsage', 'runtimePaths', 'models', 'skills', 'profileId', 'action']) assert.ok(!text.includes(privateValue));
});

test('unknown, unsupported and last-good limits preserve uncertainty and their own timestamp', () => {
  const native = config();
  native.providers.push({ ...provider(), instanceId: 'unknown', usageLimits: undefined });
  native.providers[0].usageLimits.unavailable = { reason: 'probeFailed', message: `Bearer ${TOKEN} failed` };
  const result = normalizeConfig(native, { token: TOKEN, readAt: '2026-10-19T12:00:00.000Z', refreshRequested: true });
  assert.equal(result.accounts[0].usageLimits.checkedAt, stamp);
  assert.equal(result.accounts[0].usageLimits.windows[0].usedPercent, 12.5);
  assert.equal(result.accounts[0].usageLimits.unavailable.reason, 'probeFailed');
  assert.ok(!JSON.stringify(result).includes(TOKEN));
  assert.equal(result.accounts[1].usageLimits, null);
  assert.match(formatText(result), /Capacity: unknown/);
  native.providers[0].usageLimits = { checkedAt: stamp, windows: [], unavailable: { reason: 'unsupported' } };
  assert.equal(normalizeConfig(native).accounts[0].usageLimits.unavailable.reason, 'unsupported');
});

test('invalid percentages, protocol drift, and missing selected instance are meaningful errors', () => {
  for (const percentage of [-1, 101, '20', null]) {
    const native = config(); native.providers[0].usageLimits.windows[0].usedPercent = percentage;
    assert.throws(() => normalizeConfig(native), { code: 'INCOMPATIBLE_RESPONSE' });
  }
  const drift = config(); drift.environment.orchestrationProtocolVersion = 3;
  assert.throws(() => normalizeConfig(drift), { code: 'UNQUALIFIED_SERVER' });
  assert.throws(() => normalizeConfig(config(), { instanceId: 'missing' }), { code: 'INSTANCE_NOT_FOUND' });
});

for (const serverVersion of ['0.1.0', '0.1.1']) test(`T3 ${serverVersion} snapshot discovers unauthenticated identity before ticket and uses native Effect requests`, async () => {
  const h = harness({ discovery: { ...descriptor, serverVersion }, getConfig: () => config(serverVersion) });
  const result = await readLimits({ ...h.options, environmentId: descriptor.environmentId });
  assert.equal(result.schemaVersion, 1);
  assert.equal(result.source.serverVersion, serverVersion);
  assert.equal(h.http.length, 2);
  assert.equal(h.http[0].options.headers, undefined);
  assert.equal(h.http[1].options.headers.Authorization, `Bearer ${TOKEN}`);
  assert.equal(h.http[1].options.method, 'POST');
  assert.ok(h.http.every(call => call.options.redirect === 'error'));
  assert.deepEqual(h.requests, [{ _tag: 'Request', id: '1', tag: 'server.getConfig', payload: {}, headers: [] }]);
  const wsUrl = new URL(h.sockets[0].url);
  assert.equal(wsUrl.pathname, '/ws');
  assert.equal(wsUrl.searchParams.get('orchestrationProtocol'), '2');
  assert.equal(wsUrl.searchParams.get('wsTicket'), 'test-ticket-not-session-token');
  assert.ok(!wsUrl.href.includes(TOKEN));
  assert.equal(result.refreshRequested, false);
  assert.equal(h.sockets[0].closed, true);
});

test('array frames match request IDs, ignoring events and another request result', async () => {
  const h = harness({ reply(socket, request) {
    socket.emit([{ _tag: 'Pong' }, { _tag: 'Event', event: {} },
      { _tag: 'Exit', requestId: 'different', exit: { _tag: 'Success', value: { secret: TOKEN } } },
      { _tag: 'Exit', requestId: request.id, exit: { _tag: 'Success', value: config() } }]);
  } });
  assert.equal((await readLimits(h.options)).accounts.length, 1);
  assert.equal(h.sockets[0].closed, true);
});

test('refresh is explicit, scoped, awaited, and followed by a snapshot read', async () => {
  const h = harness();
  const result = await readLimits({ ...h.options, instanceId: 'codex-one', refresh: true });
  assert.deepEqual(h.requests.map(r => [r.tag, r.payload]), [
    ['server.getConfig', {}], ['server.refreshProviders', { instanceId: 'codex-one' }], ['server.getConfig', {}],
  ]);
  assert.equal(result.refreshRequested, true);
  assert.equal(result.accounts[0].usageLimits.checkedAt, stamp); // Refresh is not a freshness assertion.
});

test('missing instance is rejected before refresh rather than silently refreshing all', async () => {
  const h = harness();
  await assert.rejects(readLimits({ ...h.options, instanceId: 'missing', refresh: true }), { code: 'INSTANCE_NOT_FOUND' });
  assert.equal(h.requests.length, 1);
  assert.equal(h.sockets[0].closed, true);
});

test('supplied empty instance or environment IDs fail before any network, including refresh', async () => {
  for (const value of ['', ' \t\n', null, false]) {
    for (const [field, code] of [['instanceId', 'INVALID_INSTANCE'], ['environmentId', 'INVALID_ENVIRONMENT_ID']]) {
      const h = harness();
      await assert.rejects(readLimits({ ...h.options, [field]: value, refresh: true }), { code, exitCode: 2 });
      assert.equal(h.http.length, 0);
      assert.equal(h.sockets.length, 0);
    }
  }
});

test('omitting an instance deliberately permits an all-provider refresh', async () => {
  const h = harness();
  await readLimits({ ...h.options, refresh: true });
  assert.deepEqual(h.requests[1], { _tag: 'Request', id: '2', tag: 'server.refreshProviders', payload: {}, headers: [] });
});

test('unqualified or wrong environment descriptor prevents bearer transmission', async () => {
  for (const discovery of [
    ...['0.1.2', '0.2.0', '0.1.1-nightly.1', undefined].map(serverVersion => ({ ...descriptor, serverVersion })),
    ...[1, 3, undefined].map(orchestrationProtocolVersion => ({ ...descriptor, orchestrationProtocolVersion })),
  ]) {
    const h = harness({ discovery });
    await assert.rejects(readLimits(h.options), { code: 'UNQUALIFIED_SERVER' });
    assert.equal(h.http.length, 1);
    assert.equal(h.http[0].options.headers, undefined);
    assert.equal(h.sockets.length, 0);
  }
  const h = harness();
  await assert.rejects(readLimits({ ...h.options, environmentId: 'another-environment' }), { code: 'ENVIRONMENT_MISMATCH' });
  assert.equal(h.http.length, 1);
  assert.equal(h.http[0].options.headers, undefined);
  assert.equal(h.sockets.length, 0);
});

test('getConfig must agree with pre-auth discovery', async () => {
  const h = harness({ getConfig: () => ({ ...config(), environment: { ...descriptor, environmentId: 'changed' } }) });
  await assert.rejects(readLimits(h.options), { code: 'ENVIRONMENT_MISMATCH' });
  assert.equal(h.sockets[0].closed, true);
});

test('getConfig independently rejects unqualified versions or protocols before refresh', async () => {
  for (const environment of [
    { ...descriptor, serverVersion: '0.1.2' },
    { ...descriptor, serverVersion: '0.1.1', orchestrationProtocolVersion: 3 },
  ]) {
    const h = harness({ getConfig: () => ({ ...config(), environment }) });
    await assert.rejects(readLimits({ ...h.options, refresh: true }), { code: 'UNQUALIFIED_SERVER' });
    assert.deepEqual(h.requests.map(request => request.tag), ['server.getConfig']);
    assert.equal(h.sockets[0].closed, true);
  }
});

test('HTTP error does not print response bodies or make a websocket connection', async () => {
  const h = harness({ ticketStatus: 401 });
  await assert.rejects(readLimits(h.options), error => error.code === 'HTTP_STATUS' && /401/.test(error.message) && !error.message.includes(TOKEN));
  assert.equal(h.sockets.length, 0);
});

test('Effect Failure handles Fail, Die and Interrupt without exposing their payload', async () => {
  for (const cause of [{ _tag: 'Fail', error: { message: TOKEN } }, { _tag: 'Die', defect: TOKEN }, { _tag: 'Interrupt', fiberId: 1 }]) {
    const h = harness({ reply(socket, request) { socket.emit({ _tag: 'Exit', requestId: request.id, exit: { _tag: 'Failure', cause: [cause] } }); } });
    await assert.rejects(readLimits(h.options), error => error.code === 'REMOTE_FAILURE' && !error.message.includes(TOKEN));
    assert.equal(h.sockets[0].closed, true);
  }
});

test('protocol errors and malformed frames fail safely and close their socket', async () => {
  for (const frame of [{ _tag: 'Defect', defect: TOKEN }, { _tag: 'ClientProtocolError', message: TOKEN }, 'invalid json']) {
    const h = harness({ reply(socket) { socket.emit(frame); } });
    await assert.rejects(readLimits(h.options), error => ['PROTOCOL_ERROR', 'INCOMPATIBLE_RESPONSE'].includes(error.code) && !error.message.includes(TOKEN));
    assert.equal(h.sockets[0].closed, true);
  }
});

test('deadline closes an active socket without sending interrupt or retry', async () => {
  const h = harness({ hang: true });
  await assert.rejects(readLimits({ ...h.options, timeoutMs: 15 }), { code: 'TIMEOUT' });
  assert.equal(h.sockets[0].closed, true);
  assert.equal(h.requests.length, 1);
});

test('deadline also bounds a hung ticket transport and connection errors close the socket', async () => {
  const hung = harness({ ticketHang: true });
  await assert.rejects(readLimits({ ...hung.options, timeoutMs: 15 }), { code: 'TIMEOUT' });
  assert.equal(hung.sockets.length, 0);
  const failed = harness({ failConnect: true });
  await assert.rejects(readLimits(failed.options), { code: 'TRANSPORT_ERROR' });
  assert.equal(failed.sockets[0].closed, true);
});

test('URL validation excludes insecure remote hosts, credentials and non-origin URLs', () => {
  for (const url of ['http://example.invalid', 'ftp://localhost', 'https://u:p@example.invalid', 'https://example.invalid/?token=x', 'https://example.invalid/#x', 'https://example.invalid/path']) {
    assert.throws(() => validateUrl(url), { code: 'INVALID_URL' });
  }
  for (const url of ['http://localhost:3773', 'http://127.0.0.1:3773', 'http://[::1]:3773', 'https://example.invalid']) assert.equal(validateUrl(url), url);
  assert.equal(parseToken(` {"token":"${TOKEN}","session":{"id":"safe"}} `), TOKEN);
  for (const input of [' ', '{"session":{"token":"x"}}', 'Bearer x', 'x\nx']) assert.throws(() => parseToken(input), { code: 'INVALID_TOKEN' });
});

function output() { return { text: '', write(value) { this.text += value; } }; }

test('CLI rejects ambiguous auth and token arguments without echoing secrets', async () => {
  for (const args of [['--token-file', '/secret/path', '--json'], ['--token', TOKEN, '--json']]) {
    const stdout = output(), stderr = output();
    const exit = await main(args, { env: { T3_WORKERS_TOKEN: TOKEN }, stdout, stderr });
    assert.equal(exit, 2);
    assert.ok(JSON.parse(stdout.text).error.code);
    assert.ok(!(stdout.text + stderr.text).includes(TOKEN));
    assert.ok(!(stdout.text + stderr.text).includes('/secret/path'));
  }
});

test('CLI rejects empty selection and environment pins before invoking even an injected reader', async () => {
  for (const value of ['', ' \t']) {
    for (const [args, extraEnv, code] of [
      [['--instance', value], {}, 'INVALID_INSTANCE'],
      [['--environment-id', value], {}, 'INVALID_ENVIRONMENT_ID'],
      [[], { T3_WORKERS_ENVIRONMENT_ID: value }, 'INVALID_ENVIRONMENT_ID'],
    ]) {
      const stdout = output(), stderr = output();
      let called = false;
      const exit = await main([...args, '--refresh', '--json'], {
        env: { T3_WORKERS_TOKEN: TOKEN, ...extraEnv }, stdout, stderr,
        readLimitsImpl: async () => { called = true; throw new Error('Reader must not run'); },
      });
      assert.equal(exit, 2);
      assert.equal(JSON.parse(stdout.text).error.code, code);
      assert.equal(called, false);
      assert.equal(stderr.text, '');
    }
  }
});

test('CLI reads explicit stdin or native issue file, applies environment settings, and never refreshes implicitly', async () => {
  for (const input of ['stdin', 'file', 'env']) {
    const stdout = output(), stderr = output();
    let received;
    const args = input === 'stdin' ? ['--token-stdin'] : input === 'file' ? ['--token-file', 'user-selected-token.json'] : [];
    const exit = await main([...args, '--json'], {
      env: { T3_WORKERS_URL: 'https://example.invalid', T3_WORKERS_ENVIRONMENT_ID: descriptor.environmentId, ...(input === 'env' ? { T3_WORKERS_TOKEN: TOKEN } : {}) },
      stdin: Readable.from([TOKEN]), stdout, stderr, readFileImpl: async () => JSON.stringify({ token: TOKEN }),
      readLimitsImpl: async options => { received = options; return { schemaVersion: 1, accounts: [] }; },
    });
    assert.equal(exit, 0);
    assert.equal(received.token, TOKEN);
    assert.equal(received.url, 'https://example.invalid');
    assert.equal(received.environmentId, descriptor.environmentId);
    assert.equal(received.refresh, false);
    assert.equal(stderr.text, '');
    assert.ok(!stdout.text.includes(TOKEN));
  }
});
