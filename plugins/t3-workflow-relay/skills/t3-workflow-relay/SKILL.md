---
name: t3-workflow-relay
description: "Claude Code Workflow scripts inside a T3 thread: run any agent on another T3 account or provider (Codex, Grok, a different Claude account) in its own T3 thread through a cheap one-call relay, mixed freely with native agents. Load before writing a workflow that uses them or spreads work across accounts."
---

# T3 Workflow Relay

A Workflow script starts only Claude agents on the chief's own account. A
relay is one such agent, on a cheap model, that makes a single `delegate_task`
call: the worker runs on the account or provider you name, in its own T3
thread, and the relay hands back the first two lines of its output file.

In the script a relay reads like `agent()`, so the workflow stays yours:
phases, fan-out, loops, verification, any number of agents. Some of them, all
of them or none can be relays.

## Choose per agent

- **The chief's own account:** `agent()`. A relay would add a model call and a
  thread for nothing, unless you want that worker to be a lasting T3 thread
  someone can open and continue.
- **Another Claude account, or another provider:** `t3Agent()`.
- **Spreading work:** give each `t3Agent()` its own `target`. Use only accounts
  and providers the user named or admitted for this work, because each one
  receives its task and whatever it reads. Spare allowance is not permission.

Take each `target` from `orchestrator_capabilities`, with every option. What
you leave out, T3 fills from the chief or the provider, and an omitted
`runtimeMode` follows the chief's.

## Paste this once per script

Set `RUN` to a name unique to this workflow.

```js
const RUN = 'replace-with-a-unique-name'
const T3_ROW = {
  type: 'object',
  properties: {
    already_present: { type: 'boolean' }, dispatched: { type: 'boolean' }, completed: { type: 'boolean' },
    task_id: { type: 'string' }, child_thread_id: { type: 'string' }, call_status: { type: 'string' },
    next_hint: { type: 'string' }, head2: { type: 'string' }, error: { type: 'string' },
  },
  required: ['already_present', 'dispatched', 'completed', 'task_id', 'child_thread_id', 'call_status', 'next_hint', 'head2', 'error'],
}

// Like agent(), but the work runs in a T3 worker on `target`. Resolves to a row; the result stays in the file at `out`.
function t3Agent({ key, title, role = 'general', target, task, out, timeoutMs = 3600000, attempt = 1, isolation, runtimeMode }, options = {}) {
  if (!key || !task || !out?.startsWith('/')) throw new Error(`t3Agent: key, task and an absolute out are required (key: ${key})`)
  if (!target?.providerInstanceId || !target.model || !target.options) throw new Error(`t3Agent ${key}: target needs providerInstanceId, model and options`)
  const tool = 'mcp__t3-code__delegate_task'
  const file = `'${out.replace(/'/g, `'\\''`)}'`
  const guard = `if test -e ${file}; then echo PRESENT; head -n 2 ${file}; else echo ABSENT; fi`
  const call = {
    task: `${task}\n\nWrite your result to ${out} through a temporary name that you then rename, with STATUS: done or STATUS: blocked on line 1 and a one-line summary on line 2.`,
    title, role, target, isolation, runtimeMode, mode: 'wait', timeoutMs, clientRequestId: `${RUN}:${key}:${attempt}`,
  }
  const prompt = [
    'You are a relay. Your commission explicitly includes starting exactly one T3 worker with delegate_task. You do not do the work yourself and you do not read the work\'s inputs.',
    `Step 1. Run this with Bash:\n${guard}\nIf the first line printed is PRESENT, the output already exists: do NOT dispatch. Return already_present=true, dispatched=false, completed=true, head2 = the exact lines printed after PRESENT, every other string empty. If it prints ABSENT, continue.`,
    `Step 2. Load the tool with ToolSearch, query "select:${tool}", max_results 1. If that tool is not returned, do NOT dispatch and do not look for another route: return dispatched=false, completed=false, already_present=false, error = "${tool} is not available in this session", every other string empty.`,
    `Step 3. Call ${tool} exactly once with exactly these arguments (copy them verbatim; change, drop or add nothing):`,
    JSON.stringify(call, null, 2),
    'Step 4. Set dispatched=true if the call returned a taskId, even if it also reports a timeout, a question or an approval. Set completed=true only if the call reports status "completed", workState "result_available", hasPendingQuestion false, pendingApproval null and waitTimedOut false. If completed, run the Step 1 command again: if it prints PRESENT, head2 = the exact lines printed after PRESENT; if it prints ABSENT, head2 is empty and error = "output file absent after completion". If not completed, head2 is empty.',
    'Step 5. Return task_id = taskId and child_thread_id = childThreadId, each copied character for character, call_status = status and workState joined by a slash, followed by /timeout if waitTimedOut is true, /question if hasPendingQuestion is true and /approval if pendingApproval is not null, next_hint = the call\'s next field verbatim, and error = the exact error text including any error code (for example parent_not_active) if the call failed. Any of these the call did not provide is empty, unless Step 4 set error. Do not copy the call\'s summary or any result text.',
    'Never retry, never call delegate_task a second time, never call task_status or task_cancel, never answer a question for the worker, and never read more of the output file than its first two lines.',
  ].join('\n\n')
  return agent(prompt, { label: `t3:${key}`, model: 'haiku', effort: 'low', schema: T3_ROW, ...options })
    .then(row => row ?? { already_present: false, dispatched: false, completed: false, task_id: '', child_thread_id: '', call_status: '', next_hint: '', head2: '', error: 'relay returned nothing' })
    .then(row => ({
      key, out, ...row,
      ok: row.completed && row.head2.startsWith('STATUS: done'),
      // Neither started nor refused: a worker may be running, so look for it before running this job again.
      maybe_started: !row.dispatched && !row.already_present && !/parent_not_active|is not available in this session/.test(row.error),
    }))
}
```

`options` is passed to `agent()`: `phase` for a pipeline stage, `model` or
`effort` for a different relay.

A mixed stage reads like this:

```js
const sol = { providerInstanceId: '<instance>', model: '<model>', options: { '<option>': '<value>' } }
const otherClaude = { providerInstanceId: '<instance>', model: '<model>', options: { '<option>': '<value>' } }

phase('Build')
const built = await t3Agent({ key: 'build', title: 'Build the parser', role: 'implementation', target: sol,
  out: '/abs/out/build.md', task: 'Read /abs/in/build.md and do what it says.' })
if (!built.ok) return built

phase('Verify')
const verdicts = await parallel([
  () => agent(`Read ${built.out} and try to refute it.`, { schema: VERDICT }),
  () => t3Agent({ key: 'verify', title: 'Verify the parser', role: 'review', target: otherClaude,
    out: '/abs/out/verify.md', task: `Read ${built.out} and try to refute it.` }),
])
```

## What a relay changes

**Keep your turn open until the last relay has dispatched.** T3 accepts
`delegate_task` only during the chief's active turn and otherwise refuses with
`parent_not_active`, and the Workflow tool returns at once. Ending the turn
does not stop the workflow, so a later relay reaches T3 with nobody active.
`t3_background_wait` does not hold the turn.

- Relays only at the start of the script: keep working until their child
  threads show in `t3_thread_list` with `includeSubagents`, then end the turn.
- A relay after any `await`: stay in the turn until that relay has dispatched.
  After launching, do your own work, then hold with this command, listing the
  `out` files of the relays that can run last. Pass the Bash tool `timeout:
  600000`: at the default two minutes the command moves to the background and
  no longer holds anything. Repeat it until the files exist, the workers'
  threads show in `t3_thread_list`, or the workflow's completion notice arrives:

  ```sh
  end=$((SECONDS+540)); until test -e /abs/out/last.md; do ((SECONDS>=end)) && exit 1; sleep 10; done
  ```

A refused relay started nothing. Its row has `dispatched` false and
`parent_not_active` in `error`. Rerun it from an active turn with `attempt`
raised by one, for example from `args`, since a resumed workflow replays an
unchanged relay's refusal. Every `agent()` after the first changed call then
runs live again, so apply the last rule below to any relay still waiting.

**`dispatched` false proves nothing started only when T3 refused.** For every
other cause, such as a relay that died during its wait, the row has
`maybe_started` true: look for the worker by title with `t3_thread_list` and
`includeSubagents` before running that job again.

**Results live in files.** The relay returns only `head2`, the status lines,
so a worker's output never passes through the cheap model or your context.
`ok` is true when the worker finished and wrote `STATUS: done`. A later stage
reads `row.out`; the chief reads what it needs. `out` is an absolute path on
the chief's machine, unique to the job, so a relay cannot serve a worker on a
linked machine: use T3's launch tools for that.

**A worker knows only its task.** It starts with none of your conversation.
Write what it needs into `task`, or point to files. Two workers writing the
same paths in the shared checkout collide: give them separate paths, or
`isolation: 'worktree'`, which starts from the last commit without your
uncommitted edits.

**Each relay holds a workflow slot while it waits,** so at most
`min(16, CPUs - 2)` run at once and the rest queue. The wait lasts at most an
hour, the longest T3 honors. A timeout, a question or an approval ends the wait
and leaves the worker as it is: the row has `dispatched` true, `completed` false
and a `call_status` ending in `/timeout`, `/question` or `/approval`. A question
or approval waits for a person in that worker's T3 thread.

**Before running a job again, read its worker.** A job whose output file exists
is never dispatched again, which covers only finished jobs. The request ID
makes a repeat safe only within one live T3 session of the parent thread; after
an idle release or a T3 restart the same ID starts a second worker. For a row
with a `task_id` and no output, use `t3_thread_read` on `child_thread_id` or
`task_status`, and decide from what it shows.

**Stopping a workflow does not stop its workers.** Stop each with `task_cancel`.
A relay still waiting has returned no row, so take the task ID from
`t3_thread_read` of your own thread with `view: 'activity'`: each worker's
`subagent` item carries it as `subagentId`.
