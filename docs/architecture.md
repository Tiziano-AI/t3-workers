# Architecture and qualification

## One operating method, native owners

```text
User → native Codex or Claude Code chief
     → existing native authenticated T3 MCP connection
     → optionally a linked environment, named by environmentId
     → explicitly selected visible T3 worker
     → retrieved result assessed by the chief
```

Use native subagents when they are simpler. T3 adds persistent visible workers,
provider/account choice and execution environments. It need not replace every
delegation mechanism.

The shared skill under `skills/t3-workers/` owns selection, briefing, dispatch,
result retrieval and recovery. The native chief owns conversation and judgment.
T3 owns execution, authentication and durable worker state. No plugin process
must stay alive, and there is no new gateway, state registry or scheduler.

Discovery stays native. Released v0.1.2 returns a model shortlist with search,
not a complete catalog to mirror locally. When no selection was commissioned,
T3 can resolve a registered project's defaults within the caller's ceiling;
the chief still preserves explicit selections and checks the idle worker's
effective configuration before dispatch. Saved project settings alone are not
that readback. [Discovery](https://github.com/pingdotgg/t3code/blob/v0.1.2/packages/contracts/src/orchestratorMcp.ts#L526-L561),
[default resolution](https://github.com/pingdotgg/t3code/blob/v0.1.2/apps/server/src/mcp/toolkits/project/handlers.ts#L128-L169).

Cross-machine work uses T3's own linked environments (since 0.1.4): one chief
connection, a discovered `environmentId` per call, and T3 forwarding the call
within the link's access and the chief's modes. The plugin adds no
per-machine registration, relay or alternative route, and an expired link is
renewed by a person rather than worked around. A launch always carries an
explicit `modelSelection`, because an omitted one can move to a configured
fallback account when the default's usage is exhausted, and an explicit
`runtimeMode`, because an omitted one takes the project default and can step
down silently for the provider. No runtime mode is a universal default.

Approvals stay with the person in T3. An outside chief's wait settles only on
a terminal run, so after a nonterminal wait the chief reads the thread's
pending-request count and activity. The count includes approvals, unlike the
question list; activity identifies the requested action before the chief
brings a pending approval to the user. The
plugin adds no approval relay; `delegate_task`'s `pendingApproval` serves an
internal T3 parent, not this chief. Providers map the same mode differently,
and Cursor raises no T3 approval at all; the capability reference records the
v0.1.6 mappings and their unknowns.

Follow delegated/background work with the native
`t3_thread_wait.untilDelegatedWorkSettled` option and read `resultRun`, rather
than treating the initial terminal turn as the whole assignment. Distinguish
single-run interruption from `t3_thread_interrupt.stop: true`, which also
holds the queue and stops delegates and PR watches. Verify linked-peer
support and surviving effects. These controls were already present in the
v0.1.6 contract but omitted from this method; the v0.1.7 source review repaired
that omission, not a missing T3 capability.

The native v0.1.2 thread CLI serves local scripts, but lacks controls needed by
this cycle, including idle-first launch, model options and caller-supplied
retry keys. MCP remains the chief surface; the setup reference explains the
CLI's distinct host-owner session and narrower recovery guarantees. No dispatch
wrapper or second authentication store is needed.

## Packaging and connectivity

Codex consumes the portable root `plugin.json`; Claude Code uses the thin
`.claude-plugin/plugin.json`. Both discover the same root `skills/` tree.
There is no host-specific copy of the operating instructions.

The publisher marketplace lives in
[`Tiziano-AI/plugins`](https://github.com/Tiziano-AI/plugins) and is named
`tiziano-ai` in both hosts. Its native catalogs reference this independent
GitHub repository as the plugin source. Marketplace name, catalog repository
and plugin repository are separate identities: the installation ID is
`t3-workers@tiziano-ai`. This repository carries no marketplace, and the catalog
carries no copied plugin resources.

Connectivity is deliberately **user-managed**, not bundled. A fixed loopback
URL would assume one deployment. A plugin-namespaced connection can coexist
with a manual connection without sharing its grant. Reuse native OAuth and
the exact intended endpoint instead of creating another registration or
credential store. The installed setup reference covers the missing-connection
path. This native plugin supplies a skill and an optional read command, not an
MCP proxy.

The Codex local-executor extension describes where the skill is intended to
run; it does not provide connectivity. A remotely reached Mac chief is still
the local executor. Removing this plugin does not stop T3 workers or remove
the separately configured connection/grant.

Reconsider bundling when supported native endpoint configuration and connection
identity reuse remove more user work than they create.

## A narrow quota seam

T3 v0.1.7 exposes provider quota through its first-party client RPC, but not
outside-agent MCP. `skills/t3-workers/scripts/t3-limits.mjs` fills only
that read: environment discovery, a native WebSocket ticket, unary Effect RPC, and
whitelisted account/window output. It has no dependencies beyond Node.js
22.15+, no provider integrations, no cache and no process that stays alive.

This is a source-visible **native client contract**, not a documented stable
third-party quota API. It checks identity and orchestration protocol 2 before
sending a session token, always requests an RPC-only ticket, then validates
the environment/version binding and consumed fields. Server version is
diagnostic identity data, not an allowlist or a semver compatibility promise.
Incompatible contracts fail; additive fields are ignored. Prefer a suitable
native quota tool if a released T3 server exposes one, then retire this adapter
rather than maintaining two ways to read the same data. The
[v0.1.7 MCP capability contract](https://github.com/pingdotgg/t3code/blob/v0.1.7/packages/contracts/src/orchestratorMcp.ts#L548-L604)
does not include quota. An upstream proposal alone does not establish release
support.

The audience-specific `/api/auth/websocket-ticket/rpc` route is a requirement,
with no fallback to the broader media-capable bare route. This removes reader
support for older servers without it, including 0.1.0–0.1.2. The environment,
version and selected instance must match before any refresh. Diagnostics
distinguish pre-auth rejection from post-auth validation without echoing
credentials or raw config.

The caller supplies a normal environment bearer session with
`orchestration:read`. MCP OAuth credentials have a different audience and
cannot be repurposed. T3 owns session issuance/revocation; the plugin never
mints, stores or renews credentials. Installation is not authorization to issue
a session. An authorized temporary session can serve a batch of reads: use the
exact service data root, an explicit read scope, unique label and short TTL;
close all readers before revoking that exact session and verifying revocation.
Reconcile the same session after an uncertain outcome rather than issuing
another blindly. The quota guide owns the complete native procedure.

The default read requests no provider refresh. Explicit `--refresh` may run
native status probes and still retain last-good quota values, hiding the latest
failure. Report source timestamps, not invented freshness. A client timeout
does not cancel a server refresh.

Coverage is native provider-instance snapshots, not pooled Limits panels or
external usage hubs. No percentages are summed across accounts or providers.
The installed [quota guide](../skills/t3-workers/references/limits.md) owns
commands, auth boundaries, fields, exits and exact released source links.

Primary packaging sources:

- [OpenAI plugin packaging and external marketplace sources](https://developers.openai.com/plugins/build/plugins#marketplace-metadata)
  and [desktop-only skills](https://developers.openai.com/plugins/deploy/desktop-only#plugins-without-an-mcp-server).
- [Native Codex plugin commands](https://learn.chatgpt.com/docs/developer-commands#codex-plugin).
- [Claude components](https://code.claude.com/docs/en/plugins/components),
  [external marketplace sources](https://code.claude.com/docs/en/plugin-marketplaces#choose-a-plugin-source) and
  [loading/version behavior](https://code.claude.com/docs/en/plugins/loading#versions-and-updates).
- [Released T3 outside-agent contract](https://github.com/pingdotgg/t3code/blob/v0.1.0/docs/user/outside-agents.md).

## Qualification

This is an **alpha** that requires T3 0.1.4 or later, with a released T3
0.1.0 outside-agent baseline, discovery/project-default guidance for v0.1.2,
outside-chief exposure and recovery checked at v0.1.5, linked environments,
launch model resolution, worktree cleanup, runtime modes and request
observation checked at v0.1.6. A v0.1.7 source review checked the core
launch/configuration, request/replay, linked-environment and wait/stop behavior,
plus the quota reader's protocol, RPC-only ticket and consumed snapshot
contracts. Provider-mode mappings remain checked at v0.1.6. Schema/source
checks, catalog fetching, host loading, authentication and successful worker
execution are separate qualification steps; public availability does not
establish them all.

Earlier versions of the quota command passed real snapshot reads against T3 0.1.0 on 18 October
2026, 0.1.1 on 21 October 2026, and 0.1.2 on 23 October 2026, all on protocol 2
across Codex, Claude and Grok instances. The temporary read-only sessions were
revoked after the readers exited; the v0.1.2 check also confirmed that the
revoked token was rejected and removed its private temporary material. These
reads requested no refresh or inference. They qualify transport and parsing,
not fresh provider observations, available allowance, plugin installation or a
worker cycle. The v0.1.2 quota/snapshot and auth/ticket contracts are
source-compatible.
Those are historical transport checks, not current support for the broader
legacy ticket route. Current synthetic tests cover contract admission across
release numbers, incompatible consumed fields, no broad-ticket fallback,
and rejection of malformed identity, incompatible protocol and the wrong
environment before credential transmission. Neither source review nor those
tests establish an authenticated live v0.1.7 read or that a chief loaded this
source version.

On 30 October 2026, a real v0.1.5/protocol 2 snapshot read from the updated
source passed without refresh or inference. The tagged v0.1.5 descriptor,
RPC-only ticket audience, protocol handshake and config/usage contracts were
checked separately; their links are in the quota guide. This establishes
transport and parsing of published native snapshots, not their freshness,
usable allowance or selection by an installed chief.

On 1 November 2026, v0.1.6 was qualified by comparing the reader's tagged
sources with v0.1.5, checking the installed v0.1.6 server binary and reading a
live v0.1.6 descriptor: the reader admitted it before authentication and
reached the RPC-only ticket route, which refused a placeholder credential.
No authenticated v0.1.6 snapshot read was part of that check. This was a
qualification of the earlier reader, not an exact-release requirement for
the current one.

An independent read-only v0.1.2 acceptance check exercised live discovery,
model search and recovery of an existing worker's configuration and state.
Explicit-selection and deliberate project-default launch inputs were prepared
but not submitted; neither a new worker cycle nor resolved default inheritance
was demonstrated by that check.

On 3 November 2026, runtime-mode resolution, pending-request counting, the
question list, wait settlement and the Codex, Claude, Grok and Cursor mode
mappings were read in tagged v0.1.6 source. A separate scoped live check with
a Codex worker in Scratch then exercised approval discovery: the idle worker's
explicit `approval-required` mode was verified before a harmless text-file
write, its wait returned nonterminal, and it reported one pending request
while the question list was empty. Activity identified an `approval_request`
for that write even though the thread status was `running`. The outside chief
reported the worker link, action and dependent work, leaving the decision to
the person in T3. This qualifies discovery and reporting for that Codex path,
not the approval outcome, other providers, source-coverage continuity or the
chief's judgment in future work.

Use the publisher catalog's native installation path to check delivery of this
package. Isolated package acceptance establishes that the client can install
its resources, not selection or use in an interactive chief. Do not infer a
successful worker cycle from packaging checks or the quota read.

Before calling a host integration qualified, demonstrate these outcomes in an
explicitly scoped environment:

| Check | Required observation |
| --- | --- |
| Package loading | Native installation exposes the skill and its references in the intended chief; no duplicate MCP registration. |
| Worker cycle | An idle worker has the selected account/model/options/runtime mode/workspace, then completes a useful bounded assignment and follow-up; the same thread is visible in T3. Repeat for each claimed provider path. |
| Result retrieval | Needed long text and retained artifacts are actually read, not inferred from terminal status. |
| Recovery | Rediscover by unique title without the launch receipt, repeat an identical keyed launch that returns the same `threadId`, and reconcile/repeat an identical harmless send without an extra turn. |
| Linked environment | Discover a linked machine, launch, follow and read a worker there by `environmentId`, and observe an expired link fail with a re-link instruction rather than a fallback. |
| Retention | A worker keeps its unique ignored outputs at their owner before going quiet; after cleanup retires its worktree, the next message recreates it from the branch. |
| Stop | Interrupt genuinely active work and inspect terminal state and surviving effects. |
| Human approval | In a supervised harmless write under a mode that asks, the outside chief's wait returns without a terminal run, `pendingRequestCount` is nonzero while the question list is empty, and the chief reports the worker's link, the requested action and what waits on it; the decision stays with the user in T3, and the chief neither answers it nor cancels or narrows the work to remove it. Repeat for each claimed provider; for Cursor, observe how a refusal appears instead. |
| Source coverage | When a worker's route to required sources is blocked, the result either reaches the same coverage through an authorized equivalent route, reported as such, or carries the narrowed component as still owed through the rebrief, any handoff and the report to the user. |
| Continuity | A returning chief recovers an existing worker without relaunching. If remote use is claimed, exercise that same chief through the actual remote client. |
| Package lifecycle | Update loads the new version; disable/uninstall removes the skill without cancelling workers, deleting data or silently revoking another connection. |

Do not launch paid or stateful qualification as an installation side effect.
Source tests check package paths, shared metadata and delivered resources;
they cannot certify these live outcomes. Add tests for a demonstrated defect,
not a duplicate snapshot of instruction wording. Bump both host manifest
versions on each distributed change so native caches can select the new copy.
