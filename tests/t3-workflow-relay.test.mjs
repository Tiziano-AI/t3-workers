import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// Runs the relay helper exactly as the skill prints it, with a stubbed agent().
// No relay or T3 worker starts, so this says nothing about how T3 behaves live.
const skill = readFileSync(new URL('../skills/t3-workflow-relay/SKILL.md', import.meta.url), 'utf8');
const blocks = [...skill.matchAll(/```js\n([\s\S]*?)```/g)].map((match) => match[1]);
const helper = blocks.find((block) => block.includes('function t3Agent'));
const usage = blocks.find((block) => block.includes("phase('Build')"));

const done = { already_present: false, dispatched: true, completed: true, task_id: 't', child_thread_id: 'c', call_status: 'completed/result_available', next_hint: '', head2: 'STATUS: done\nok', error: '' };
const target = (name = 'provider-one') => ({ providerInstanceId: name, model: 'model-one', options: { effort: 'high' } });
const job = (extra = {}) => ({ key: 'a', title: 'Title', target: target(), out: '/work/out/a.md', task: 'Do it', ...extra });

function load(reply = () => done) {
  const calls = [];
  const agent = async (prompt, options) => { calls.push({ prompt, options }); return reply(prompt, options); };
  const t3Agent = new Function('agent', `${helper}\nreturn t3Agent;`)(agent);
  return { calls, t3Agent };
}

const callOf = (prompt) => JSON.parse(prompt.match(/change, drop or add nothing\):\n\n(\{[\s\S]*?\n\})\n\n/)[1]);

test('the helper is plain script text the workflow runtime accepts', () => {
  assert.ok(helper);
  assert.doesNotMatch(helper, /\bimport\b|\brequire\(|Date\.now|Math\.random|new Date\(\)|: string|interface /);
});

test('the relay runs cheaply and carries caller options', async () => {
  const { calls, t3Agent } = load();
  await t3Agent(job(), { phase: 'Build' });
  assert.equal(calls[0].options.model, 'haiku');
  assert.equal(calls[0].options.effort, 'low');
  assert.equal(calls[0].options.label, 't3:a');
  assert.equal(calls[0].options.phase, 'Build');
  assert.deepEqual(calls[0].options.schema.required.sort(), Object.keys(calls[0].options.schema.properties).sort());
  const other = load();
  await other.t3Agent(job(), { model: 'sonnet', effort: 'medium' });
  assert.equal(other.calls[0].options.model, 'sonnet');
  assert.equal(other.calls[0].options.effort, 'medium');
});

test('each agent passes its own whole target unchanged', async () => {
  const { calls, t3Agent } = load();
  await t3Agent(job({ key: 'a', target: target('provider-one') }));
  await t3Agent(job({ key: 'b', target: target('provider-two'), out: '/work/out/b.md' }));
  assert.deepEqual(callOf(calls[0].prompt).target, target('provider-one'));
  assert.deepEqual(callOf(calls[1].prompt).target, target('provider-two'));
});

test('the call waits within the longest wait T3 honors and has a stable request id', async () => {
  const { calls, t3Agent } = load();
  await t3Agent(job());
  await t3Agent(job({ attempt: 2 }));
  const first = callOf(calls[0].prompt);
  assert.equal(first.mode, 'wait');
  assert.equal(first.timeoutMs, 3600000);
  assert.equal(first.role, 'general');
  assert.equal(first.clientRequestId, 'replace-with-a-unique-name:a:1');
  assert.equal(callOf(calls[1].prompt).clientRequestId, 'replace-with-a-unique-name:a:2');
});

test('the worker is told the output file contract', async () => {
  const { calls, t3Agent } = load();
  await t3Agent(job());
  const { task } = callOf(calls[0].prompt);
  assert.match(task, /^Do it\n\n/);
  assert.match(task, /\/work\/out\/a\.md through a temporary name/);
  assert.match(task, /STATUS: done or STATUS: blocked on line 1 and a one-line summary on line 2/);
});

test('isolation and runtime mode appear only when chosen', async () => {
  const { calls, t3Agent } = load();
  await t3Agent(job());
  await t3Agent(job({ isolation: 'worktree', runtimeMode: 'auto' }));
  assert.equal('isolation' in callOf(calls[0].prompt), false);
  assert.equal('runtimeMode' in callOf(calls[0].prompt), false);
  assert.equal(callOf(calls[1].prompt).isolation, 'worktree');
  assert.equal(callOf(calls[1].prompt).runtimeMode, 'auto');
});

test('the output guard quotes the path and the relay stays one call', async () => {
  const { calls, t3Agent } = load();
  await t3Agent(job({ out: "/work/it's/a.md" }));
  assert.ok(calls[0].prompt.includes(`if test -e '/work/it'\\''s/a.md'; then echo PRESENT; head -n 2 '/work/it'\\''s/a.md'; else echo ABSENT; fi`));
  assert.match(calls[0].prompt, /select:mcp__t3-code__delegate_task/);
  assert.match(calls[0].prompt, /Never retry, never call delegate_task a second time/);
});

test('ok means finished with STATUS: done', async () => {
  const row = async (reply) => load(() => reply).t3Agent(job());
  assert.equal((await row(done)).ok, true);
  assert.equal((await row({ ...done, head2: 'STATUS: blocked\nno input' })).ok, false);
  assert.equal((await row({ ...done, completed: false, head2: '' })).ok, false);
  assert.equal((await row({ ...done, dispatched: false, completed: true, already_present: true })).ok, true);
  const shaped = await row(done);
  assert.equal(shaped.key, 'a');
  assert.equal(shaped.out, '/work/out/a.md');
});

test('a relay that returns nothing is a row that may have started a worker', async () => {
  const row = await load(() => null).t3Agent(job());
  assert.equal(row.ok, false);
  assert.equal(row.maybe_started, true);
  assert.equal(row.error, 'relay returned nothing');
});

test('only a refusal proves that nothing started', async () => {
  const notStarted = { ...done, dispatched: false, completed: false, head2: '' };
  const row = async (reply) => (await load(() => reply).t3Agent(job())).maybe_started;
  assert.equal(await row({ ...notStarted, error: 'parent_not_active: no active run' }), false);
  assert.equal(await row({ ...notStarted, error: 'mcp__t3-code__delegate_task is not available in this session' }), false);
  assert.equal(await row({ ...notStarted, error: 'orchestration_error: Unable to watch delegated task' }), true);
  assert.equal(await row(done), false);
  assert.equal(await row({ ...notStarted, already_present: true, completed: true }), false);
});

test('a call without a whole target or a usable output path fails at once', () => {
  const { calls, t3Agent } = load();
  assert.throws(() => t3Agent(job({ target: undefined })), /target needs/);
  assert.throws(() => t3Agent(job({ target: { providerInstanceId: 'p', model: 'm' } })), /target needs/);
  assert.throws(() => t3Agent(job({ out: 'relative/a.md' })), /absolute out/);
  assert.throws(() => t3Agent(job({ task: '' })), /absolute out/);
  assert.equal(calls.length, 0);
});

test('the relay reports why a wait ended', async () => {
  const { calls, t3Agent } = load();
  await t3Agent(job());
  assert.match(calls[0].prompt, /\/timeout if waitTimedOut is true, \/question if hasPendingQuestion is true and \/approval if pendingApproval is not null/);
});

test('the printed usage example runs against the helper', async () => {
  const seen = { agent: 0, relay: 0 };
  const agent = async (prompt) => {
    if (prompt.startsWith('You are a relay.')) { seen.relay += 1; return done; }
    seen.agent += 1;
    return { refuted: false };
  };
  const parallel = (thunks) => Promise.all(thunks.map((thunk) => thunk()));
  const AsyncFunction = (async () => {}).constructor;
  const script = new AsyncFunction('agent', 'parallel', 'phase', 'VERDICT', `${helper}\n${usage}\nreturn verdicts;`);
  const verdicts = await script(agent, parallel, () => {}, {});
  assert.equal(verdicts.length, 2);
  assert.deepEqual(seen, { agent: 1, relay: 2 });
});
