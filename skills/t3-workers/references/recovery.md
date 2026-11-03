# Recovery and continuity

Read this when a response is lost, a worker appears stuck, the chief returns,
or work must stop. Recover the surviving effect through T3 before submitting
another effect. T3's conversation/run state remains the owner after this
plugin is disabled or uninstalled; removal does not cancel workers, revoke
grants, or delete their data.

## Resolve the worker before acting

Use retained project/thread/run IDs where available. Otherwise discover the
project and search `t3_thread_list` by the distinctive title, following cursors.
Check settled/snoozed filters if relevant; one active-list page is not proof
that a thread is absent. Listing pages can shift as state changes.

If the launch response lost the project ID, page `t3_project_list`, then search
`t3_thread_list` with `projectId` and `titleContains` across candidate projects,
expanding to all projects when necessary. In v0.1.0, Scratch is an ordinary
registered project: its initial name and icon are mutable, so neither a fixed
name nor a guessed ID is a recovery key. An empty search during an uncertain
launch is not atomic proof of absence.
([Scratch registration](https://github.com/pingdotgg/t3code/blob/v0.1.0/apps/server/src/project/ManagedProjectFolders.ts#L281-L326),
[project enumeration](https://github.com/pingdotgg/t3code/blob/v0.1.0/apps/server/src/mcp/OrchestratorMcpService.ts#L2379-L2423))

A title is a discovery clue, not an effect target. Resolve ambiguous matches
using provider instance, project, creation context, and timeline; then act on
the exact `threadId`. Read durable state and relevant activity to distinguish
preparation, a running turn, a pending question/approval, terminal failure, and
a completed result. Preserve partial outputs and effects even when the final
run failed.

## Reconcile by the uncertain transition

The request-key guarantees below belong to MCP and its authenticated client
session; they do not apply to the native `t3 thread` CLI.

| What is uncertain | Safe continuation |
| --- | --- |
| MCP launch response was lost | Since 0.1.4 (checked at v0.1.6), when `clientRequestId` was supplied, retry the identical launch with that original key and the same `environmentId` in the same authenticated client session, then read the returned thread. Without that key, recover by unique title and project enumeration in the target environment as above. Do not create another thread merely because its response is missing. After reauthentication, reconcile without assuming the former namespace survived. |
| MCP send response was lost | Read the target timeline and run state. If retry is needed, use the identical payload and original `clientRequestId` within the same authenticated client session. Do not issue a new key to recover the same assignment. After reauthentication, reconcile without assuming the former deduplication namespace survived. |
| Configuration change or question response was lost | These operations have no request key (checked at v0.1.6). Read the effective configuration or list/read the exact pending request before repeating. Do not treat a read-only `t3_thread_configure {threadId}` as a model change. |
| Native CLI start/send response was lost | Recover the thread and read its timeline/run state before another command. `start` may already have created the worker; `send` always queues and offers no caller-supplied retry key. Repeating it can create another turn. |
| Wait timed out or the chief went away | Read/wait on the existing run with an explicit `timeoutMs` within the host's tool-call limit; a host-side timeout is as uncertain as T3's. A timeout neither cancels the run nor authorizes resending its brief. Avoid repeatedly reading unchanged full transcripts; retain the relevant cursor. |
| A linked machine's call failed | Read `t3_environment_links`. If the link expired, the worker's thread stays on that machine: the user links the machine again with a new pairing code from it, then recover the worker by its IDs, or by unique title there, with the same `environmentId`. The new link is a new sign-in on that machine, so a launch or send key used before it need not deduplicate after it. Do not relaunch the assignment on another machine, account or route. If the link is only unreachable, retry the read later rather than repeating an effect. |
| Wait returned without a terminal run | Read the thread's `pendingRequestCount` and recent activity before waiting again. The count includes approvals; `t3_pending_request` lists only questions, so an empty list or a `running`/`waiting` status does not rule out an approval. Bring a pending approval to the user with the worker's `link`, the requested action and what waits on it; the person answers it in T3. A Cursor worker raises no T3 approval: look for refusals in its activity instead. |
| Provider failed, account is exhausted, or quota is unknown | Preserve any result and report the precise gap. Do not change account/model, consume a reset, reauthenticate, or launch a replacement without the necessary authority. Distinguish observed failure from stale or unavailable capacity information. |
| Worker says it is done | Read the complete needed result, check the requested output and known effects. Terminal status alone does not establish a successful commission or artifact delivery. |
| A worker's worktree is gone | T3's storage cleanup may have retired it after inactivity. The branch, commits and conversation remain, and the next message recreates the worktree from the branch without its ignored files. Recover what the branch holds; outputs that lived only in ignored files are gone unless they were kept elsewhere. |

## When a route is blocked

A pending or declined approval, a refused tool, a missing integration or an
exhausted account can block the way a worker was to reach part of its result.
Before changing that way, name the component the commission owes, such as
exploration of a named source set, a check, or an independent review, and
decide which of two different changes you are making.

- **An equivalent alternative** reaches the same component with the same
  coverage, through a route already within authority. For example, when a
  worker's reads of required files are held and the complete primary material
  is already admitted to this commission, giving the worker that complete
  material another way (placed where it can read it, or supplied whole)
  changes only the reading mechanism. Coverage is preserved and no human
  escalation is needed for the change. Say in the report which route changed.
  A request still pending in T3 remains the user's; the alternative does not
  answer it.
- **A narrowed result** delivers less: chief-selected excerpts, summaries or
  conclusions in place of the worker's own exploration of the required
  sources, a subset of them, or a skipped check. That is not the owed
  component, and disclosing the substitution does not complete it. Keep the
  component owed: say in the rebrief what the worker received instead and
  which of its findings depend on the gap; carry the gap in any handoff; and
  report it to the user as open, with what would complete it.
  Only actual coverage or a change in the user's commission closes that gap.

An explicit refusal, such as a declined approval or the user's no, closes that
route. Do not reach the same effect by another route; report what it blocks.
In either case keep partial results that are useful, labeled with what they
cover.

## Interrupt a real run

When stopping is authorized, call `t3_thread_interrupt` with the exact thread,
the known active `runId` where supported, and a stable `clientRequestId` for
that interruption. Keep the returned state. Reuse its key for an identical
retry; reconcile first if the authenticated session changed.

`interrupt_requested` is acceptance, not a completed stop. Wait/read the run
until terminal, inspect activity, and account for files, external processes,
or other effects that can survive provider interruption. A late `completed`
result can win the race; read it rather than claiming it was cancelled.
`no_active_run` is not proof that an earlier run made no changes. Do not use
`restart` as a substitute for establishing what stopped and what survives.

If terminal state or surviving effects cannot be established, say exactly what
is uncertain and retain the IDs and recovery route. Never claim rollback from
an interruption acknowledgement.

## Return and handoff

On the chief's return, recover the existing worker and inspect what happened
since the last known position, including `pendingRequestCount`. Do not
relaunch its assignment. Continue with a
new logical message only when the current task requires it, preserving any
unanswered human decision.

Before a worker's thread goes quiet, confirm that its unique ignored outputs
(session-continuity records, renders, generated local configuration) are at
their owner: committed, or copied to the deliverable's real location. Storage
cleanup can retire an inactive worktree with its ignored files.

When leaving a worker running, tell the user what it is doing, its current
observed state, how its result will be recovered, and how to stop it. Record
the exact IDs, cursor, request keys relevant to uncertain effects, pending
decision and any component still owed after a narrowed route at the existing
work owner when later continuation needs them. Keep
this compact; T3 owns the transcript. Do not promise automatic wake-up or
delivery into an idle external chief unless that separate path was actually
established.
