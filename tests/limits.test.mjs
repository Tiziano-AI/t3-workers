import test from 'node:test';
import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import { formatText, main, normalizeConfig, parseToken, readLimits, validateUrl } from '../skills/t3-workers/scripts/t3-limits.mjs';

// Synthetic released-protocol shapes, not captures or proof of live providers.
const TOKEN = 'test-session-secret';
const stamp = '2026-10-18T12:00:00.000Z';
const descriptor = { environmentId: 'environment-one', label: 'Test environment', serverVersion: '0.1.7', orchestrationProtocolVersion: 2 };
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
const config = (serverVersion = descriptor.serverVersion) => ({ environment: { ...descriptor, serverVersion }, providers: [provider()], externalUsage: [{ token: TOKEN }], skills: [{ secret: TOKEN }] });

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
  assert.throws(() => normalizeConfig(drift), { code: 'UNSUPPORTED_PROTOCOL' });
  assert.throws(() => normalizeConfig(config(), { instanceId: 'missing' }), { code: 'INSTANCE_NOT_FOUND' });
});

// Versions are synthetic identity values here: capability is exercised, not inferred from semver.
for (const serverVersion of ['0.1.7', '0.2.0', '99.12.34+build.1', 'nightly-contract-fixture']) test(`protocol-2 snapshot admits ${serverVersion} with the same contract and uses only RPC tickets`, async () => {
  const h = harness({ discovery: { ...descriptor, serverVersion }, getConfig: () => config(serverVersion) });
  const result = await readLimits({ ...h.options, environmentId: descriptor.environmentId });
  assert.equal(result.schemaVersion, 1);
  assert.equal(result.source.serverVersion, serverVersion);
  assert.equal(h.http.length, 2);
  assert.equal(h.http[0].options.headers, undefined);
  assert.equal(h.http[1].options.headers.Authorization, `Bearer ${TOKEN}`);
  assert.equal(h.http[1].options.method, 'POST');
  assert.equal(new URL(h.http[1].url).pathname, '/api/auth/websocket-ticket/rpc');
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

test('unsupported protocol in discovery prevents bearer transmission', async () => {
  for (const orchestrationProtocolVersion of [1, 3, '2', undefined, null]) {
    const discovery = { ...descriptor, orchestrationProtocolVersion };
    const h = harness({ discovery });
    await assert.rejects(readLimits(h.options), error => {
      assert.equal(error.code, 'UNSUPPORTED_PROTOCOL');
      assert.equal(error.details.supportedOrchestrationProtocolVersion, 2);
      assert.equal(error.details.tokenSent, false);
      return true;
    });
    assert.equal(h.http.length, 1);
    assert.equal(h.http[0].options.headers, undefined);
    assert.equal(h.sockets.length, 0);
  }
});

test('malformed discovery identity prevents bearer transmission', async () => {
  for (const discovery of [
    null, [], {},
    ...[undefined, null, '', ' \t\n', 7].flatMap(value => [
      { ...descriptor, environmentId: value }, { ...descriptor, serverVersion: value },
    ]),
  ]) {
    const h = harness({ discovery });
    await assert.rejects(readLimits(h.options), error => error.code === 'INCOMPATIBLE_RESPONSE' && error.details.tokenSent === false);
    assert.equal(h.http.length, 1);
    assert.equal(h.http[0].options.headers, undefined);
    assert.equal(h.sockets.length, 0);
  }
});

test('wrong requested environment prevents bearer transmission', async () => {
  const h = harness();
  await assert.rejects(readLimits({ ...h.options, environmentId: 'another-environment' }), { code: 'ENVIRONMENT_MISMATCH' });
  assert.equal(h.http.length, 1);
  assert.equal(h.http[0].options.headers, undefined);
  assert.equal(h.sockets.length, 0);
});

test('getConfig must agree with pre-auth discovery before refresh', async () => {
  const h = harness({ getConfig: () => ({ ...config(), environment: { ...descriptor, environmentId: 'changed' } }) });
  await assert.rejects(readLimits({ ...h.options, refresh: true }), { code: 'ENVIRONMENT_MISMATCH' });
  assert.deepEqual(h.requests.map(request => request.tag), ['server.getConfig']);
  assert.equal(h.sockets[0].closed, true);
});

test('config version cannot change after discovery, even when both versions use the supported contract', async () => {
  for (const [initial, later] of [['0.1.7', '0.2.0'], ['0.2.0', '0.1.7'], ['nightly-contract-fixture', 'another-contract-fixture']]) {
    const h = harness({ discovery: { ...descriptor, serverVersion: initial }, getConfig: () => config(later) });
    await assert.rejects(readLimits({ ...h.options, refresh: true }), { code: 'ENVIRONMENT_MISMATCH' });
    assert.deepEqual(h.requests.map(r => r.tag), ['server.getConfig']);
    assert.equal(h.sockets[0].closed, true);
  }
});

test('protocol errors distinguish pre-auth rejection from authenticated config without leaking versions', async () => {
  for (const tokenSent of [false, true]) {
    for (const serverVersion of ['0.1.7', `0.1.7-${TOKEN}`, `Bearer ${TOKEN}`, '0.1.7?wsTicket=private-ticket']) {
      for (const json of [false, true]) {
        const bad = { ...descriptor, serverVersion, orchestrationProtocolVersion: 3 };
        const h = harness(tokenSent
          ? { getConfig: () => ({ ...config(), environment: bad }) }
          : { discovery: bad });
        let output = '';
        const sink = { write: value => { output += value; } };
        const code = await main(json ? ['--json'] : [], {
          env: { T3_WORKERS_TOKEN: TOKEN }, stdout: sink, stderr: sink,
          readLimitsImpl: options => readLimits({ ...h.options, ...options }),
        });
        assert.equal(code, 4);
        assert.ok(!output.includes(TOKEN));
        assert.ok(!output.includes('private-ticket'));
        if (json) {
          const error = JSON.parse(output).error;
          assert.equal(error.code, 'UNSUPPORTED_PROTOCOL');
          assert.equal(error.details.tokenSent, tokenSent);
          assert.equal(error.details.observedServerVersion, serverVersion === '0.1.7' ? '0.1.7' : null);
          assert.equal(error.details.observedOrchestrationProtocolVersion, 3);
          assert.equal(error.details.supportedOrchestrationProtocolVersion, 2);
          assert.equal(error.details.qualifiedServerVersions, undefined);
        } else {
          assert.match(output, tokenSent ? /authenticated configuration/ : /no session token was sent/);
        }
        assert.equal(h.http.length, tokenSent ? 2 : 1);
        assert.equal(h.sockets.length, tokenSent ? 1 : 0);
        if (tokenSent) assert.equal(h.sockets[0].closed, true);
      }
    }
  }
});

test('admitted non-semver identity is bound before its version text is redacted for output', async () => {
  const serverVersion = `nightly-${TOKEN}\u001b[2J?wsTicket=private-ticket`;
  const h = harness({ discovery: { ...descriptor, serverVersion }, getConfig: () => config(serverVersion) });
  const result = await readLimits(h.options);
  assert.equal(result.source.serverVersion.startsWith('nightly-[redacted]'), true);
  for (const rendered of [JSON.stringify(result), formatText(result)]) {
    for (const hidden of [TOKEN, 'private-ticket', '\u001b']) assert.ok(!rendered.includes(hidden));
  }
  assert.equal(h.sockets[0].closed, true);
});

test('getConfig independently rejects malformed identity or unsupported protocol before refresh', async () => {
  for (const [environment, code] of [
    [{ ...descriptor, serverVersion: '' }, 'INCOMPATIBLE_RESPONSE'],
    [{ ...descriptor, environmentId: '' }, 'INCOMPATIBLE_RESPONSE'],
    [{ ...descriptor, orchestrationProtocolVersion: 3 }, 'UNSUPPORTED_PROTOCOL'],
  ]) {
    const h = harness({ getConfig: () => ({ ...config(), environment }) });
    await assert.rejects(readLimits({ ...h.options, refresh: true }), error => error.code === code && error.details.tokenSent === true);
    assert.deepEqual(h.requests.map(request => request.tag), ['server.getConfig']);
    assert.equal(h.sockets[0].closed, true);
  }
});

test('malformed consumed quota data fails before refresh', async () => {
  const native = config();
  native.providers[0].usageLimits.windows[0].usedPercent = '12.5';
  const h = harness({ getConfig: () => native });
  await assert.rejects(readLimits({ ...h.options, refresh: true }), { code: 'INCOMPATIBLE_RESPONSE' });
  assert.deepEqual(h.requests.map(request => request.tag), ['server.getConfig']);
  assert.equal(h.sockets[0].closed, true);
});

test('missing RPC-only ticket route never falls back to a broad ticket', async () => {
  const h = harness({ ticketStatus: 404 });
  await assert.rejects(readLimits(h.options), { code: 'HTTP_STATUS' });
  assert.deepEqual(h.http.map(call => new URL(call.url).pathname), [
    '/.well-known/t3/environment', '/api/auth/websocket-ticket/rpc',
  ]);
  assert.equal(h.sockets.length, 0);
  assert.equal(h.requests.length, 0);
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

test('additive native fields do not break the consumed contract or enter the output', async () => {
  const native = config();
  native.newConfigField = { privateValue: TOKEN };
  native.environment.newIdentityField = 'new-environment-value';
  const account = native.providers[0];
  account.newProviderField = { privateValue: TOKEN };
  account.auth.newAuthField = 'new-auth-value';
  account.usageLimits.newLimitsField = 'new-limits-value';
  account.usageLimits.windows[0].newWindowField = 'new-window-value';
  account.usageLimits.resetCredits.newResetField = 'new-reset-value';
  const h = harness({
    discovery: { ...descriptor, newIdentityField: 'new-environment-value' },
    getConfig: () => native,
  });
  const result = await readLimits(h.options);
  assert.equal(result.source.serverVersion, '0.1.7');
  assert.equal(result.accounts.length, 1);
  assert.equal(result.accounts[0].usageLimits.windows[0].remainingPercent, 87.5);
  const rendered = JSON.stringify(result);
  for (const field of ['newConfigField', 'newIdentityField', 'newProviderField', 'newAuthField', 'newLimitsField', 'newWindowField', 'newResetField', TOKEN]) {
    assert.ok(!rendered.includes(field));
  }
  assert.equal(h.sockets[0].closed, true);
});

test('every native window kind and zero boundary keeps its identity, order and absent fields', () => {
  const native = config();
  native.providers[0].usageLimits = {
    checkedAt: stamp,
    windows: [
      { id: 'five_hour', kind: 'session', label: '5 hours', usedPercent: 0, resetsAt: stamp, windowDurationMins: 300 },
      { id: 'seven_day', kind: 'weekly', label: 'Weekly', usedPercent: 33.25, windowDurationMins: 0 },
      { id: 'monthly', kind: 'monthly', label: 'Monthly', usedPercent: 100 },
      { id: 'overage', kind: 'other', label: 'Overage', usedPercent: 12.5 },
    ],
    resetCredits: { availableCount: 0 },
  };
  assert.deepEqual(normalizeConfig(native).accounts[0].usageLimits, {
    checkedAt: stamp,
    windows: [
      { id: 'five_hour', kind: 'session', label: '5 hours', usedPercent: 0, remainingPercent: 100, resetsAt: stamp, windowDurationMins: 300 },
      { id: 'seven_day', kind: 'weekly', label: 'Weekly', usedPercent: 33.25, remainingPercent: 66.75, windowDurationMins: 0 },
      { id: 'monthly', kind: 'monthly', label: 'Monthly', usedPercent: 100, remainingPercent: 0 },
      { id: 'overage', kind: 'other', label: 'Overage', usedPercent: 12.5, remainingPercent: 87.5 },
    ],
    resetCredits: { availableCount: 0 },
  });
});

test('native degraded accounts are data, not a failed read for every other account', () => {
  const degraded = overrides => ({ ...provider(), usageLimits: undefined, ...overrides });
  const native = config();
  native.providers = [
    degraded({ instanceId: 'warning', status: 'warning', auth: { status: 'unknown' } }),
    degraded({ instanceId: 'disabled', status: 'disabled', enabled: false, auth: { status: 'unauthenticated' } }),
    degraded({ instanceId: 'absent', status: 'error', enabled: false, installed: false, version: null, availability: 'unavailable', unavailableReason: 'Not installed', auth: { status: 'unknown' } }),
  ];
  assert.deepEqual(normalizeConfig(native).accounts.map(a => [a.instanceId, a.status, a.auth.status, a.version, a.availability, a.usageLimits]), [
    ['warning', 'warning', 'unknown', '1.0', 'available', null],
    ['disabled', 'disabled', 'unauthenticated', '1.0', 'available', null],
    ['absent', 'error', 'unknown', null, 'unavailable', null],
  ]);
});

test('last-good limits keep their own time and a messageless failure stays visible after refresh', async () => {
  // Keep last-good snapshots, sparse limits and empty failure results distinct.
  const providerTime = '2026-10-18T13:00:00.000Z', readTime = '2026-10-18T14:00:00.000Z';
  const account = (instanceId, usageLimits) => ({ ...provider(), instanceId, checkedAt: providerTime, ...usageLimits });
  const h = harness({ getConfig: () => ({ ...config(), providers: [
    account('last-good'),
    account('sparse', { usageLimits: { checkedAt: providerTime, windows: [{ id: 'session', kind: 'session', label: 'Session', usedPercent: 40 }], unavailable: { reason: 'probeFailed' } } }),
    account('failed', { usageLimits: { checkedAt: providerTime, windows: [], unavailable: { reason: 'probeFailed' } } }),
  ] }) });
  const result = await readLimits({ ...h.options, refresh: true, now: () => new Date(readTime) });
  assert.equal(result.readAt, readTime);
  assert.equal(result.refreshRequested, true);
  const [lastGood, sparse, failed] = result.accounts;
  assert.equal(lastGood.checkedAt, providerTime);
  assert.equal(lastGood.usageLimits.checkedAt, stamp);
  assert.equal(lastGood.usageLimits.windows[0].remainingPercent, 87.5);
  assert.equal(lastGood.usageLimits.unavailable, undefined);
  assert.deepEqual(sparse.usageLimits.unavailable, { reason: 'probeFailed' });
  assert.equal(sparse.usageLimits.windows[0].remainingPercent, 60);
  assert.deepEqual(failed.usageLimits, { checkedAt: providerTime, windows: [], unavailable: { reason: 'probeFailed' } });
  const [, lastGoodText, sparseText, failedText] = formatText(result).split('\n\n');
  assert.ok(lastGoodText.includes(`Provider checked: ${providerTime}; limits checked: ${stamp}`));
  assert.ok(!lastGoodText.includes('probeFailed'));
  assert.ok(sparseText.includes('60% remaining') && sparseText.includes('probeFailed') && !sparseText.includes('Capacity: unknown'));
  assert.ok(failedText.includes('Capacity: unknown') && failedText.includes('probeFailed'));
});

test('refresh reports the post-refresh read, not the first read or the refresh reply', async () => {
  const used = usedPercent => ({ ...config(), providers: [{ ...provider(), usageLimits: { checkedAt: stamp, windows: [{ id: 'session', kind: 'session', label: 'Session', usedPercent }] } }] });
  let reads = 0;
  const h = harness({ reply(socket, request) {
    const value = request.tag === 'server.refreshProviders' ? { providers: used(90).providers } : used(reads++ === 0 ? 10 : 30);
    socket.emit({ _tag: 'Exit', requestId: request.id, exit: { _tag: 'Success', value } });
  } });
  assert.equal((await readLimits({ ...h.options, refresh: true })).accounts[0].usageLimits.windows[0].usedPercent, 30);
});

test('a refresh-phase failure closes the socket and returns no earlier snapshot', async () => {
  const success = (request, value) => ({ _tag: 'Exit', requestId: request.id, exit: { _tag: 'Success', value } });
  const secondRead = value => request => success(request, request.tag === 'server.refreshProviders' ? { providers: [] } : value);
  for (const [code, afterFirstRead, instanceId] of [
    ['REMOTE_FAILURE', request => ({ _tag: 'Exit', requestId: request.id, exit: { _tag: 'Failure', cause: [{ _tag: 'Fail', error: { message: TOKEN } }] } })],
    ['INCOMPATIBLE_RESPONSE', request => success(request, request.tag === 'server.refreshProviders' ? { providers: 'unexpected' } : config())],
    ['UNSUPPORTED_PROTOCOL', secondRead({ ...config(), environment: { ...descriptor, orchestrationProtocolVersion: 3 } })],
    ['ENVIRONMENT_MISMATCH', secondRead(config('0.2.0'))],
    ['INSTANCE_NOT_FOUND', secondRead({ ...config(), providers: [] }), 'codex-one'],
  ]) {
    let reads = 0;
    const h = harness({ reply(socket, request) { socket.emit(reads++ === 0 ? success(request, config()) : afterFirstRead(request)); } });
    await assert.rejects(readLimits({ ...h.options, instanceId, refresh: true }), error => error.code === code && !error.message.includes(TOKEN));
    assert.equal(h.sockets.length, 1);
    assert.equal(h.sockets[0].closed, true);
  }
});

test('provider-controlled text is redacted in both outputs and the native hub link never passes through', () => {
  const native = config(), account = native.providers[0];
  Object.assign(account, { displayName: 'Test\u001b[2J account', message: `Failed for ${TOKEN}`, unavailableReason: 'Bearer other-bearer-value rejected' });
  account.usageLimits.windows[0].label = `Session ${TOKEN}`;
  account.usageLimits.externalUsage = { label: 'private-hub-label', url: 'https://private-hub.example.invalid/' };
  const result = normalizeConfig(native, { token: TOKEN, readAt: stamp });
  for (const rendered of [JSON.stringify(result), formatText(result)]) {
    for (const hidden of [TOKEN, 'other-bearer-value', 'private-hub', 'externalUsage', '\u001b']) assert.ok(!rendered.includes(hidden));
  }
});

test('a malformed ticket response opens no socket', async () => {
  for (const ticket of [null, [], {}, { ticket: '', expiresAt: stamp }, { ticket: 'x' }, { ticket: 'x', expiresAt: 'soon' }]) {
    const h = harness();
    const fetchImpl = async (url, options) => url.endsWith('/.well-known/t3/environment')
      ? h.options.fetchImpl(url, options) : { ok: true, status: 200, json: async () => ticket };
    await assert.rejects(readLimits({ ...h.options, fetchImpl }), { code: 'INCOMPATIBLE_RESPONSE' });
    assert.equal(h.sockets.length, 0);
  }
});

test('a server close before the reply is a closed connection, not a deadline', async () => {
  const h = harness({ reply(socket) { socket.readyState = 3; socket.dispatchEvent(new Event('close')); } });
  await assert.rejects(readLimits(h.options), { code: 'CONNECTION_CLOSED', exitCode: 3 });
  assert.equal(h.requests.length, 1);
});
