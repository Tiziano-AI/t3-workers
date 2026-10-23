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
retrying a lost response, changing an active assignment, or handing work back
unfinished, read [Recovery and continuity](references/recovery.md).

If tools are missing or the user requests connection/setup, read
[Connect the chief](references/setup.md). For capability, quota, memory, or
transport questions, read [Capability boundaries](references/capabilities.md).
These references travel with the skill; they are not separate integrations.

## Establish the callable connection and selection

1. Discover the actual T3 tools exposed in this host. Names below are **tool
   base names**, not a fixed MCP namespace: a user-managed connection and a
   plugin-managed connection can have different prefixes. If several T3
   connections exist, resolve the intended environment before an effect;
   distinguish their configured endpoints and relevant project inventories.
2. Call `orchestrator_capabilities`. Inspect provider instances, the model
   shortlist, supported options, constraints, and permission ceiling. If the
   intended model is absent, use `search` before declaring it unavailable.
   Check `omittedModels` rather than treating the shortlist as a complete
   catalog. Catalog presence establishes selection eligibility, not working
   authentication, successful inference, or available quota. A missing host tool
   is not proof that the server lacks that operation. Do not repair configuration, log in, or grant
   access as an unrequested preflight.
3. Act as an **outside chief**, not an internal T3 parent. With
   `parentThreadId: null`, launch ordinary top-level workers using
   `t3_thread_launch`; do not infer access to internal `delegate_task` or its
   completion delivery. Supply target IDs explicitly instead of relying on
   calling-thread inheritance.
4. Resolve the intended provider **instance/account**, model, and requested
   effort or service tier from current discovery. Distinguish the provider
   driver from a configured account instance. A display name is a configured
   label, not independently verified account identity; when that distinction
   matters, use a supported identity read or confirm the mapping with the user.
   Use stable IDs, not optional display labels. Read each option's advertised
   `values` and optional default, then pass selected options as `{id, value}`;
   do not copy the descriptive schema or knobs between providers. Preserve
   explicit user selections. A missing model, exhausted account, or unsupported
   option is a declared gap, not permission to switch silently or change global
   defaults.

### Capacity before dispatch

Consider applicable account, session, weekly, and model-specific allowance
windows together with authentication/health and work already in progress.
An exhausted applicable window can block an otherwise full window. Percentages
across providers are not equivalent token budgets, and another thread does not
create more account capacity.

Use a suitable native structured capacity tool if the connected release
exposes one. Released T3 **through v0.1.2** does not expose this through
outside-agent MCP. This package's optional reader uses the native client RPC instead:

```sh
node "/absolute/path/to/installed/skills/t3-workers/scripts/t3-limits.mjs" --json
```

Replace the example path with this installed skill's directory. Read
[Quota reader](references/limits.md) before first use: it requires Node.js
22.15+ and an explicitly supplied normal T3 read-only session, **not** the MCP
OAuth credential. Do not issue a session as an unrequested preflight. Default
to published snapshots; `--refresh` explicitly requests native status probes.
The reader accepts exactly 0.1.0, 0.1.1, and 0.1.2/protocol 2 and covers native
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
pagination when needed. For settings the commission leaves open, you may
deliberately use a registered project's defaults; null inherited
settings on an outside chief are not those defaults. `t3_project_read` shows
saved defaults, not the launch's effective configuration. Preserve any explicit
account, model, option, or mode selection and verify the prepared worker either
way. For projectless analysis use native `scratch: true`,
which creates a fresh folder outside any repository. For code changes choose
the exact project and checkout/worktree deliberately. Omitted
`workspaceStrategy` means the **project root**, not this chief's checkout.
Use T3's workspace binding instead of asking the worker to create a worktree
through shell. A worktree separates tracked writes, not credentials, services,
account storage, or access to other checkouts.

Workers may run on a different host or lack the chief's integrations and
files. Verify access to necessary sources; provide only authorized context,
not an entire private conversation. T3 MCP is not a generic filesystem/file
transfer surface. Full access is an execution ceiling, not authority to spend,
publish, share private data, or make unrelated changes. Pick a supported
runtime mode within both the grant and the commission's actual authority.

## Launch idle, verify, then send

1. Create a uniquely titled worker with `t3_thread_launch`, **omitting the
   initial message and attachments**. Pass commissioned selections and modes,
   and the deliberate workspace binding; omit settings only when intentionally
   using the registered project's defaults within the caller's ceiling. Keep
   its `threadId` and preparation state. Launch has no retry
   key: an uncertain response requires reconciliation, never a blind relaunch.
2. Read the prepared thread with `t3_thread_read` and
   `t3_thread_configuration`. Confirm the provider instance, effective model
   and options, runtime/interaction modes, project, and workspace binding.
   Wait for preparation where necessary. If they do not match the commission,
   do not send work; resolve the mismatch through an authorized supported
   operation or report it. Do not accept a default that overrides an explicit
   selection.
3. Send the bounded brief with `t3_thread_send` and a stable
   `clientRequestId` for this logical dispatch. Keep the returned message/run
   IDs. Reuse that key only for an identical retry, not a new instruction.
   Idempotency is scoped to the authenticated client session; reauthentication
   is not evidence that an old key will still deduplicate.
4. Follow the specific run with bounded `t3_thread_wait` calls, then read
   messages and relevant activity. A timeout leaves the work running. A
   terminal run can have failed or produced only part of the requested result;
   a completed turn is not necessarily a completed commission.

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
- Use `t3_pending_request_list` and `t3_pending_request_read` for questions.
  Answer through `t3_pending_request_respond` within this chief's delegated
  authority and available context; bring user-owned choices to the user.
  These tools **cannot approve security/permission requests**. Leave those
  decisions to the user in T3's supported interface; do not answer a question
  to bypass approval.
- Continue the same worker when its history matters; give it a focused
  follow-up and follow the resulting run. Use a new worker for a genuinely
  independent commission, not as a quota or permission workaround.
- Evaluate findings, check consequential claims/artifacts through permitted
  access, and integrate one usable result here. Separate what the worker
  reported from what this chief independently verified. Keep editable outputs
  with their real project/deliverable owner and enough source locators to
  recover them. A worker asking for an effect does not authorize that effect.

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
uses the released [v0.1.2 native usage contract](https://github.com/pingdotgg/t3code/blob/v0.1.2/packages/contracts/src/providerUsageLimits.ts);
see its reference for version qualification, separate sessions, and freshness.
Use current callable schemas for syntax and newly supported capabilities;
neither this skill nor a pinned catalog proves what this host can invoke.
Use [Connect the chief](references/setup.md) for installation and OAuth, not
worker commissions or copied credentials.
