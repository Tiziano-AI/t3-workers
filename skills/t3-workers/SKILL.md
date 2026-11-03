---
name: t3-workers
description: "Operate a T3 Code worker fleet from an external Codex or Claude Code chief: connect native MCP, read account capacity, dispatch bounded work, retrieve results, and recover threads. Not general T3 runtime/provider repair or service administration."
---

# T3 Workers

The **chief** is the Codex or Claude Code agent coordinating this assignment.
Keep the user's conversation and judgment here. Use T3's supported MCP tools
directly to execute bounded commissions in persistent, visible workers. T3
owns worker execution and conversations; this package supplies the operating
method, not another gateway, scheduler, memory store, or coordinator.

## Choose the right route

Use T3 when the task benefits from its provider/account choice, persistent
threads, or user-visible execution. Native same-account subagents may be
simpler for an independent contribution that needs none of those properties.
Do not create a permanent T3 coordinator or one endless thread per provider.

For an existing worker, recover its identity and state before launching
anything. For a new commission, follow the idle-first sequence below. Before
retrying a lost response, changing an active assignment, changing how a worker
reaches required sources, or handing work back unfinished, read
[Recovery and continuity](references/recovery.md).

If tools are missing, a sign-in or link nears its 30-day expiry, or the user
requests connection/setup, read [Connect the chief](references/setup.md). For
capability, quota, memory, or transport questions, read
[Capability boundaries](references/capabilities.md).
These references travel with the skill; they are not separate integrations.

## Establish the callable connection and selection

1. Discover the actual T3 tools exposed in this host. Names below are **tool
   base names**, not a fixed MCP namespace: a user-managed connection and a
   plugin-managed connection can have different prefixes. If several T3
   connections exist, resolve the intended environment before an effect;
   distinguish their configured endpoints and relevant project inventories.
   This method requires T3 **0.1.4 or later** and is checked at **v0.1.6**;
   `t3_environment_read` reports the connected server's version.
2. Call `orchestrator_capabilities`. Inspect provider instances, the model
   shortlist, supported options, constraints, and permission ceiling. If the
   intended model is absent, use `search` before declaring it unavailable.
   Check `omittedModels` rather than treating the shortlist as a complete
   catalog. Catalog presence establishes selection eligibility, not working
   authentication, successful inference, or available quota. A missing host tool
   is not proof that the server lacks that operation. Do not repair configuration, log in, or grant
   access as an unrequested preflight.
3. Act as an **outside chief**, not an internal T3 parent. `delegate_task`,
   `task_status`, `task_cancel` and `t3_environment_link` act as or answer in
   the calling T3 thread, so a chief signed in from outside T3 gets
   `thread_credential_required`. Launch ordinary top-level
   workers with `t3_thread_launch` and follow them by thread ID. Supply target
   IDs explicitly instead of relying on calling-thread inheritance.
4. Resolve the target **environment**. One chief connection reaches the
   user's other machines through T3's linked environments. `t3_environment_links`
   lists them with status, access and `expiresAt`; pass the chosen
   `environmentId` to each tool that should act there, and omit it to act on
   the connected environment. Do not register a second connection per machine
   or substitute another route to that machine. A link that is expired, or a
   call refused because it expired, needs the user to link that machine again
   with a new pairing code from it: it is not a reason to fall back to another
   machine, account or route. While linked environments are off, T3 hides its
   link tools and refuses a call naming another machine with
   `capability_denied`; only the user can turn them on (Settings → Labs).
5. Resolve the intended provider **instance/account**, model, and requested
   effort or service tier from current discovery. Distinguish the provider
   driver from a configured account instance. A display name is a configured
   label, not independently verified account identity; when that distinction
   matters, use a supported identity read or confirm the mapping with the user.
   Use stable IDs, not optional display labels. Read each option's advertised
   `values` and optional default, then pass selected options as `{id, value}`;
   do not copy the descriptive schema or knobs between providers. Preserve
   explicit user selections. A missing model, exhausted account, or unsupported
   option is a declared gap, not permission to switch silently or change global
   defaults. **Always pass `modelSelection` on launch.** A launch without it
   takes the project default, and since T3 0.1.4, when that account's usage
   window is exhausted and a fallback selection is configured for the project
   or environment, T3 starts the worker on that fallback account without an
   error. When the commission
   leaves the model open, choose it from the project's defaults and current
   discovery, then pass that choice.

### Capacity before dispatch

Consider applicable account, session, weekly, and model-specific allowance
windows together with authentication/health and work already in progress.
An exhausted applicable window can block an otherwise full window. Percentages
across providers are not equivalent token budgets, and another thread does not
create more account capacity.

Use a suitable native structured capacity tool if the connected release
exposes one. Released T3 **v0.1.6**, like the earlier qualified releases,
has no outside-agent MCP quota tool. This package's optional reader uses native client RPC instead:

```sh
node "/absolute/path/to/installed/skills/t3-workers/scripts/t3-limits.mjs" --json
```

Replace the example path with this installed skill's directory. Read
[Quota reader](references/limits.md) before first use: it requires Node.js
22.15+ and an explicitly supplied normal T3 read-only session, **not** the MCP
OAuth credential. Do not issue a session as an unrequested preflight. Default
to published snapshots; `--refresh` explicitly requests native status probes.
The reader accepts exactly 0.1.0, 0.1.1, 0.1.2, 0.1.5 and 0.1.6/protocol 2 and covers native
provider instances, not pooled external usage sources. Use the authenticated
**Usage → Limits** UI when the reader is unavailable. Keep unknown capacity
unknown; do not treat it as zero or unlimited, or block an authorized bounded
task solely because quota is unavailable. Explain consequential uncertainty
before a capacity-sensitive assignment.

Check freshness and failure information, not just bars. Native snapshots can
retain last-good limits after a probe failure **without publishing that latest
failure**; opening Limits can trigger native status probes, and refresh can
still use cached data. Do not repeatedly poll to manufacture certainty.
Capacity checks authorize neither resets nor account
switching. Do not build a separate quota mirror or scrape private runtime data.

## Define the commission and workspace

Give a worker an outcome and return condition, necessary sources/context,
owned files or responsibility, exclusions, permitted effects, and what counts
as an adequate check. Tell concurrent writers they are not alone and must not
revert others' work. Split independent contributions only when each can change
the result; retain integration and consequential choices in this chief.

Resolve a registered project with `t3_project_list`/`t3_project_read`, including
pagination when needed. A project's saved defaults can inform settings the
commission leaves open: pass the resulting `modelSelection` and `runtimeMode`
explicitly, and let the interaction mode inherit only deliberately, within the
caller's ceiling. Null inherited
settings on an outside chief are not those defaults, and `t3_project_read`
shows saved defaults, not the launch's effective configuration. Preserve any
explicit account, model, option, or mode selection and verify the prepared
worker either way. For projectless analysis use native `scratch: true`,
which creates a fresh folder outside any repository. For code changes choose
the exact project and checkout/worktree deliberately. Omitted
`workspaceStrategy` means the **project root**, not this chief's checkout.
Use T3's workspace binding instead of asking the worker to create a worktree
through shell. A worktree separates tracked writes, not credentials, services,
account storage, or access to other checkouts.

Give a reviewer its own workspace. Never bind a reviewer to an implementer's
worktree as a second, independent top-level thread (`existing_worktree`): both
then write in one checkout, and T3's cleanup keeps a worktree shared by several
top-level threads indefinitely. Have the implementer commit, then launch the
reviewer on a new worktree from that branch (`workspaceStrategy: {type:
"worktree", baseRef: <branch>, startFromOrigin: false}`); uncommitted edits
are not copied.

Worktrees retire. When the environment's storage cleanup is set to remove
inactive worktrees, T3 removes one once its threads have had no message or run
for the configured age, whether or not they were settled; uncommitted changes,
an open terminal, a running thread or several top-level threads keep it.
Ignored files keep it only under the "any local files" rule. The branch, its
commits and the conversation survive, and the next message recreates the
worktree from the branch **without its ignored files**. Brief each worker to
put unique ignored outputs (session-continuity records, renders, generated
local configuration) at their owner, committed or copied to the deliverable's
real location, before its thread goes quiet.

Workers may run on a different host or lack the chief's integrations and
files. Verify access to necessary sources. Give each worker the context its
work needs; a worker on another host or account receives only what that
account is admitted for. T3 MCP is not a generic filesystem/file
transfer surface: a call forwarded to a linked environment cannot carry
attachments (checked at v0.1.6), so put needed material where that machine can
read it and name the location in the brief. A worker started over a link
cannot use links itself; do not brief it to reach a third machine.

**Choose `runtimeMode` for each launch and pass it.** The values are
`approval-required`, `auto-accept-edits`, `auto` and `full-access` (checked at
v0.1.6). `orchestrator_capabilities` reports this connection's ceiling as
`runtimeMode` and, for a provider that offers only some modes, its
`runtimeModes`. Omitted on an outside launch, the mode is the project's
default clamped to the ceiling, and it steps down silently to a narrower mode
the provider offers when the provider lacks it; an explicit mode the provider lacks is refused, and one above the
ceiling fails with `runtime_mode_escalation_denied`. Derive the mode from the
commission's permitted effects and the selected provider's behavior, described
in [Capability boundaries](references/capabilities.md#runtime-modes-and-approvals);
neither Full access nor an always-ask mode is the default. Full access is an
execution ceiling, not authority to spend, publish, share private data, or make
unrelated changes. A mode that asks holds the worker until a person answers in
T3, so tell the user when a worker runs in a mode that may ask them.

## Launch idle, verify, then send

1. Create a uniquely titled worker with `t3_thread_launch`, **omitting the
   initial message and attachments**. Pass `environmentId` for a linked
   machine, the explicit `modelSelection` and `runtimeMode`, any commissioned
   interaction mode and the deliberate workspace binding. Keep its `threadId`, returned
   `modelSelection`, and preparation state. Supply launch `clientRequestId`
   (since 0.1.4, checked at v0.1.6) as a new key for each logical launch and
   retain it. Reuse it only for an identical retry under the same sign-in:
   changed inputs under a used key can return the earlier worker without an
   error. Over a link, T3 scopes the
   key to this caller before forwarding it, so the same rule holds there.
2. Read the prepared thread with `t3_thread_read`. Confirm the provider
   instance, effective model, runtime/interaction modes, project, and workspace
   binding; compare the launch's returned `modelSelection`, including options,
   with the commission, and the thread's `runtimeMode` with the one you passed. The configuration read is part of
   `t3_thread_configure` (checked at v0.1.6); pass only `{threadId}` for a read, never
   `modelSelection` as a readback. Exposing this consolidated tool also exposes
   model changes; the host owner must authorize that exposure separately from
   OAuth. Use a supported configuration read or T3's authenticated UI when
   options are not otherwise observable; keep an unresolved selection gap
   explicit. Launch replay recovers an uncertain launch in its original
   namespace; it is not a configuration read.
   Wait for preparation where necessary. If they do not match the commission,
   do not send work; resolve the mismatch through an authorized supported
   operation or report it. Do not accept a default that overrides an explicit
   selection.
3. Send the bounded brief with `t3_thread_send` and a stable
   `clientRequestId` for this logical dispatch. Keep the returned message/run
   IDs. Reuse that key only for an identical retry, not a new instruction.
   Idempotency is scoped to the authenticated client session; reauthentication
   is not evidence that an old key will still deduplicate.
4. Follow the specific run with `t3_thread_wait`, passing its `runId` and an
   explicit `timeoutMs` within this host's tool-call limit. Without one, T3
   holds the wait for up to 10 minutes (it caps any longer value at 60), and a host that
   gives up first reports a failed call while the wait continues. Then read
   messages and relevant activity. This wait settles only on a terminal run: it does not return early for a question or
   an approval. After any nonterminal result (`timedOut: true`, or a status
   that is not terminal), read the thread for pending requests as described
   below before waiting again. A timeout leaves the work running. A terminal
   run can have failed or produced only part of the requested result; a
   completed turn is not necessarily a completed commission.

Use `t3_thread_send` modes intentionally: `queue` requests a separate follow-up
turn, `steer` changes an active turn, and `restart` interrupts and restarts it.
`auto` chooses according to the target's current state, so do not use it to
send an unrelated assignment into an active worker accidentally. Give each new
logical message its own request key.

## Read, decide, and bring the result back

- Read the actual output, not just status or a completion notification. Follow
  timeline pages using `afterPosition = nextPosition` while `hasMore` is true.
  For needed truncated text, read its `itemId` with
  `textOffset = nextTextOffset` until that offset is null; offsets are UTF-16
  code units. Activity can explain blocked tools, partial effects, or failure
  that the messages view omits.
- **Look for pending requests after every nonterminal wait.** Read the worker
  with `t3_thread_read` and check `pendingRequestCount` together with its
  recent activity. That count covers every pending runtime request: approvals
  as well as questions and other kinds. `t3_pending_request` with
  `action: "list"` returns **questions only**. Do not subtract one number from
  the other to count approvals, and do not infer that no approval is pending
  from a `running` or `waiting` status. The activity view shows an approval as
  an `approval_request` item with the requested action (checked at v0.1.6).
- **Questions**: `t3_pending_request` (checked at v0.1.6) combines the older
  `t3_pending_request_*` tools with `action: "list"`, `"read"`, or
  `"respond"`; pass the target thread explicitly. Respond has no retry key:
  reconcile the pending request after a lost reply before answering again.
  Answer only within this chief's delegated authority; bring user-owned
  choices to the user. When no question interface is exposed, use the thread
  activity and ask the user to inspect the exact worker in T3.
- **Approvals belong to a person in T3.** T3's MCP tools offer no way to grant
  one (checked at v0.1.6), and a question response **cannot approve a security/permission
  request**. Tell the user now, with the worker's `link`, the exact action it
  asks to take, and what in the commission waits on the answer. Do not cancel,
  restart or relaunch the worker in a broader mode, or narrow its commission,
  merely to make the request go away. A declined request stands; see
  [Recovery and continuity](references/recovery.md#when-a-route-is-blocked)
  for what may change after it. The `pendingApproval` field and early return
  of a `delegate_task` wait belong to an internal T3 parent thread; an outside
  chief's `t3_thread_wait` has neither.
- Continue the same worker when its history matters; give it a focused
  follow-up and follow the resulting run. Use a new worker for a genuinely
  independent commission, not as a quota or permission workaround.
- Evaluate findings, check consequential claims/artifacts through permitted
  access, and integrate one usable result here. Separate what the worker
  reported from what this chief independently verified. Keep editable outputs
  with their real project/deliverable owner and enough source locators to
  recover them; confirm that unique ignored outputs left the worktree before the
  worker goes quiet. A worker asking for an effect does not authorize that effect.
  When a route to required sources is blocked, an authorized equivalent route
  keeps the owed coverage; anything narrower leaves that component owed in the
  rebrief and the report (see [recovery](references/recovery.md#when-a-route-is-blocked)).

Keep thread/project/run IDs and pending effects in the existing conversation
or normal work owner, not a new fleet registry or transcript archive. T3 retains
its conversations. Returning findings here does **not** automatically import
all T3 transcripts into the chief's native learned memory, and internal T3
parent notifications do not establish wake-up of an idle external chief.
Operate while this chief is active or recover at the next interaction unless
a separately supported and authorized wake-up mechanism has been established.

## Contract boundary

The launch/recovery method above is grounded in T3's
[released v0.1.0 outside-agent contract](https://github.com/pingdotgg/t3code/blob/v0.1.0/docs/user/outside-agents.md)
and [usage contract](https://github.com/pingdotgg/t3code/blob/v0.1.0/docs/user/usage.md).
The released [v0.1.2 capability contract](https://github.com/pingdotgg/t3code/blob/v0.1.2/packages/contracts/src/orchestratorMcp.ts#L526-L561)
and [project-default resolution](https://github.com/pingdotgg/t3code/blob/v0.1.2/apps/server/src/mcp/toolkits/project/handlers.ts#L128-L169)
qualify discovery and deliberate inheritance above. The reader's quota support
uses the released [v0.1.5 native usage contract](https://github.com/pingdotgg/t3code/blob/v0.1.5/packages/contracts/src/providerUsageLimits.ts).
The current [launch and keyed replay](https://github.com/pingdotgg/t3code/blob/v0.1.5/apps/server/src/mcp/toolkits/project/handlers.ts#L63-L138)
and [configuration/question operations](https://github.com/pingdotgg/t3code/blob/v0.1.5/apps/server/src/mcp/toolkits/thread/tools.ts#L126-L162)
are checked against released v0.1.5. Linked environments, forwarded calls,
launch model fallback and worktree cleanup are checked against released v0.1.6:
[link tools](https://github.com/pingdotgg/t3code/blob/v0.1.6/apps/server/src/mcp/toolkits/orchestrator/tools.ts#L308-L348),
[forwarding](https://github.com/pingdotgg/t3code/blob/v0.1.6/apps/server/src/peer/PeerForwarding.ts#L94-L212),
[link expiry](https://github.com/pingdotgg/t3code/blob/v0.1.6/apps/server/src/peer/PeerLinks.ts#L535-L552),
[calling-thread tools](https://github.com/pingdotgg/t3code/blob/v0.1.6/apps/server/src/mcp/McpInvocationContext.ts#L193-L206),
[launch model resolution](https://github.com/pingdotgg/t3code/blob/v0.1.6/apps/server/src/mcp/toolkits/project/handlers.ts#L168-L206)
and [cleanup rules](https://github.com/pingdotgg/t3code/blob/v0.1.6/apps/server/src/storageCleanup.ts#L836-L893).
Runtime modes and request observation are checked against released v0.1.6:
[mode values](https://github.com/pingdotgg/t3code/blob/v0.1.6/packages/contracts/src/providerPolicy.ts#L25-L45),
[mode resolution](https://github.com/pingdotgg/t3code/blob/v0.1.6/apps/server/src/mcp/delegatedTaskModes.ts#L36-L73),
[launch modes](https://github.com/pingdotgg/t3code/blob/v0.1.6/apps/server/src/mcp/toolkits/project/handlers.ts#L207-L229),
[pending count](https://github.com/pingdotgg/t3code/blob/v0.1.6/apps/server/src/mcp/OrchestratorMcpService.ts#L848-L850),
[question list](https://github.com/pingdotgg/t3code/blob/v0.1.6/apps/server/src/mcp/toolkits/thread/handlers.ts#L224-L235)
and [wait settlement](https://github.com/pingdotgg/t3code/blob/v0.1.6/apps/server/src/orchestration-v2/ThreadManagementService.ts#L928-L936).
See [Quota reader](references/limits.md)
for version qualification, separate sessions, and freshness.
Use current callable schemas for syntax and newly supported capabilities;
neither this skill nor a pinned catalog proves what this host can invoke.
Use [Connect the chief](references/setup.md) for installation and OAuth, not
worker commissions or copied credentials.
