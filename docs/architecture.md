# Architecture and qualification

## One operating method, native owners

```text
User → native Codex or Claude Code chief
     → existing native authenticated T3 MCP connection
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

T3 0.1.0, 0.1.1, and 0.1.2 expose provider quota through their first-party client
RPC, but not outside-agent MCP. `skills/t3-workers/scripts/t3-limits.mjs` fills only
that read: environment discovery, a native WebSocket ticket, unary Effect RPC, and
whitelisted account/window output. It has no dependencies beyond Node.js
22.15+, no provider integrations, no cache and no process that stays alive.

This is a source-visible **native client contract**, not a documented stable
third-party quota API. The command accepts exactly 0.1.0, 0.1.1, and 0.1.2, all on
protocol 2, and rejects other versions before sending a session token. Qualify
new versions deliberately; do not silently widen the gate. Prefer a suitable
native quota tool if T3 adds one, then retire this adapter rather than
maintaining two ways to read the same data.

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

This is an **alpha** with a released T3 0.1.0 outside-agent baseline,
discovery/project-default guidance for v0.1.2, and a quota reader admitting
exactly 0.1.0, 0.1.1, and 0.1.2/protocol 2. Schema/source
checks, catalog fetching, host loading, authentication and successful worker
execution are separate qualification steps; public availability does not
establish them all.

The quota command passed real snapshot reads against T3 0.1.0 on 18 October
2026, 0.1.1 on 21 October 2026, and 0.1.2 on 23 October 2026, all on protocol 2
across Codex, Claude and Grok instances. The temporary read-only sessions were
revoked after the readers exited; the v0.1.2 check also confirmed that the
revoked token was rejected and removed its private temporary material. These
reads requested no refresh or inference. They qualify transport and parsing,
not fresh provider observations, available allowance, plugin installation or a
worker cycle. The v0.1.2 quota/snapshot and auth/ticket contracts are
source-compatible.
Synthetic tests cover all three admitted versions and rejection of unknown
versions, incompatible protocols and the wrong environment before credential
transmission. Source compatibility and these live reads do not establish that
a chief has loaded this source version.

An independent read-only v0.1.2 acceptance check exercised live discovery,
model search and recovery of an existing worker's configuration and state.
Explicit-selection and deliberate project-default launch inputs were prepared
but not submitted; neither a new worker cycle nor resolved default inheritance
was demonstrated by that check.

Use the publisher catalog's native installation path to check delivery of this
package. Isolated package acceptance establishes that the client can install
its resources, not selection or use in an interactive chief. Do not infer a
successful worker cycle from packaging checks or the quota read.

Before calling a host integration qualified, demonstrate these outcomes in an
explicitly scoped environment:

| Check | Required observation |
| --- | --- |
| Package loading | Native installation exposes the skill and its references in the intended chief; no duplicate MCP registration. |
| Worker cycle | An idle worker has the selected account/model/options/workspace, then completes a useful bounded assignment and follow-up; the same thread is visible in T3. Repeat for each claimed provider path. |
| Result retrieval | Needed long text and retained artifacts are actually read, not inferred from terminal status. |
| Recovery | Rediscover by unique title without the launch receipt, reconcile a lost send and repeat an identical harmless send under the same key without an extra turn. |
| Stop | Interrupt genuinely active work and inspect terminal state and surviving effects. |
| Human approval | A separate supervised harmless write leaves the approval decision with the user in T3. |
| Continuity | A returning chief recovers an existing worker without relaunching. If remote use is claimed, exercise that same chief through the actual remote client. |
| Package lifecycle | Update loads the new version; disable/uninstall removes the skill without cancelling workers, deleting data or silently revoking another connection. |

Do not launch paid or stateful qualification as an installation side effect.
Source tests check package paths, shared metadata and delivered resources;
they cannot certify these live outcomes. Add tests for a demonstrated defect,
not a duplicate snapshot of instruction wording. Bump both host manifest
versions on each distributed change so native caches can select the new copy.
