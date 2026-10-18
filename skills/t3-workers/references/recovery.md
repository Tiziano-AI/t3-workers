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

| What is uncertain | Safe continuation |
| --- | --- |
| Launch response was lost | Recover by unique title and project enumeration as above. Launch has no retry key; do not create another thread merely because its response is missing. If discovery cannot settle the outcome, report that uncertainty before another launch. |
| Send response was lost | Read the target timeline and run state. If retry is needed, use the identical payload and original `clientRequestId` within the same authenticated client session. Do not issue a new key to recover the same assignment. After reauthentication, reconcile without assuming the former deduplication namespace survived. |
| Wait timed out or the chief went away | Read/wait on the existing run. A timeout neither cancels the run nor authorizes resending its brief. Avoid repeatedly reading unchanged full transcripts; retain the relevant cursor. |
| Run is waiting | Inspect activity and pending questions. A zero question count does not rule out a human security approval. Use the supported human interface for permissions. |
| Provider failed, account is exhausted, or quota is unknown | Preserve any result and report the precise gap. Do not change account/model, consume a reset, reauthenticate, or launch a replacement without the necessary authority. Distinguish observed failure from stale or unavailable capacity information. |
| Worker says it is done | Read the complete needed result, check the requested output and known effects. Terminal status alone does not establish a successful commission or artifact delivery. |

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
since the last known position. Do not relaunch its assignment. Continue with a
new logical message only when the current task requires it, preserving any
unanswered human decision.

When leaving a worker running, tell the user what it is doing, its current
observed state, how its result will be recovered, and how to stop it. Record
the exact IDs, cursor, request keys relevant to uncertain effects, and pending
decision at the existing work owner when later continuation needs them. Keep
this compact; T3 owns the transcript. Do not promise automatic wake-up or
delivery into an idle external chief unless that separate path was actually
established.
