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

## Packaging and connectivity

Codex consumes the portable root `plugin.json` and native marketplace at
`.agents/plugins/marketplace.json`. Claude Code uses the thin
`.claude-plugin/plugin.json` and its marketplace. Both discover the same root
`skills/` tree. There is no host-specific copy of the operating instructions.

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

T3 0.1.0 exposes provider quota through its first-party client RPC, but not its
outside-agent MCP. `skills/t3-workers/scripts/t3-limits.mjs` fills only that
read: environment discovery, a native WebSocket ticket, unary Effect RPC, and
whitelisted account/window output. It has no dependencies beyond Node.js
22.15+, no provider integrations, no cache and no process that stays alive.

This is a source-visible **native client contract**, not a documented stable
third-party quota API. The command rejects servers other than 0.1.0/protocol 2
before sending a session token. Qualify new versions deliberately; do not
silently widen the gate. Prefer a suitable native quota tool if T3 adds one,
then retire this adapter rather than maintaining two ways to read the same data.

The caller supplies a normal environment bearer session with
`orchestration:read`. MCP OAuth credentials have a different audience and
cannot be repurposed. T3 owns session issuance/revocation; the plugin never
mints, stores or renews credentials. Its default read requests no provider
refresh. Explicit `--refresh` may run native status probes and still retain
last-good quota values, hiding the latest failure. Report source timestamps,
not invented freshness. A client timeout does not cancel a server refresh.

Coverage is native provider-instance snapshots, not pooled Limits panels or
external usage hubs. No percentages are summed across accounts or providers.
The installed [quota guide](../skills/t3-workers/references/limits.md) owns
commands, auth boundaries, fields, exits and exact released source links.

Primary packaging sources:

- [OpenAI plugin packaging](https://developers.openai.com/plugins/build/plugins)
  and [desktop-only skills](https://developers.openai.com/plugins/deploy/desktop-only#plugins-without-an-mcp-server).
- [Native Codex plugin commands](https://learn.chatgpt.com/docs/developer-commands#codex-plugin).
- [Claude components](https://code.claude.com/docs/en/plugins/components),
  [marketplaces](https://code.claude.com/docs/en/plugin-marketplaces) and
  [loading/version behavior](https://code.claude.com/docs/en/plugins/loading#versions-and-updates).
- [Released T3 outside-agent contract](https://github.com/pingdotgg/t3code/blob/v0.1.0/docs/user/outside-agents.md).

## Qualification

The initial package is **0.1.0-alpha.1**, targeting the released T3 0.1.0
contract. Schema/source checks, host loading, authentication and successful
worker execution are different claims. Public availability does not imply all
of them passed.

Observed on 18 October 2026: portable manifest schema and both native Claude
manifest/marketplace validators passed. The app-bundled Codex CLI
`0.163.0-alpha.10.2` accepted the marketplace and installed/enabled the package
in an isolated home, including the shared skill and resources. This establishes
native package acceptance, not selection or use in an interactive chief. The
quota command passed a real snapshot read on T3 0.1.0/protocol 2 across Codex,
Claude and Grok instances; its explicitly authorized temporary read-only
session was revoked and absence verified. No refresh, provider inference or
live user-home plugin installation was part of that check.

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
