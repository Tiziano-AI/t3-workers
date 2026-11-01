# Capability boundaries

Read this when deciding whether T3 fits an assignment, interpreting quota, or
explaining what remote access and returned results actually provide. The
outside-agent baseline below is **released T3 v0.1.0**, with discovery and
project-default changes checked in **released v0.1.2** and outside-chief
exposure/recovery checked in **released v0.1.5**. The method requires **T3
0.1.4 or later**; linked environments, launch model resolution and worktree
cleanup are checked in **released v0.1.6**. Quota contract support is
source-checked for 0.1.0, 0.1.1, 0.1.2, 0.1.5 and 0.1.6; source support and a
live read are separate claims. This does not assert that intervening or later
contracts are identical. Use the connected tool schemas for current syntax and
exposure.

## What each side owns

The native chief owns the user's main conversation, judgment and integrations.
T3 owns worker conversations, provider execution and workspaces on its host.
This plugin supplies a shared operating skill; it does not move provider
subscriptions, files or authentication into the chief.

An outside OAuth caller has no internal T3 parent thread. The supported pattern
is visible top-level workers, discovered and continued by their IDs. Internal
`delegate_task`, internal parent wake-up, provider-session MCP and tools offered
to a worker do not automatically become capabilities of the outside chief.
[Caller contract](https://github.com/pingdotgg/t3code/blob/v0.1.0/apps/server/src/auth/McpOAuth.ts#L556-L585)

## Accounts, models and capacity

`orchestrator_capabilities` describes eligible instances, a model shortlist,
options and constraints. In v0.1.2 it supports `search` and reports
`omittedModels`: an absent model is not necessarily unavailable. Search for the
intended model before declaring a gap. Use stable instance/model IDs, not
optional display labels. Options describe `{id, values, default?}`; selected
options are `{id, value}`. An effort or tier supported by one driver need not
exist on another. [Discovery contract](https://github.com/pingdotgg/t3code/blob/v0.1.2/packages/contracts/src/orchestratorMcp.ts#L526-L561)

A configured account label is not verified authenticated identity, and catalog
presence is not provider health or spare quota.

**An omitted `modelSelection` lets T3 choose the account.** Since 0.1.4 an
outside launch without one takes the project's resolved default. When that
account has an exhausted usage window for the model and a fallback selection
is configured for the project or environment, the worker starts on the
fallback account, and the launch reports no error. Pass the selection
explicitly and compare the returned `modelSelection` with it.
[Launch resolution](https://github.com/pingdotgg/t3code/blob/v0.1.6/apps/server/src/mcp/toolkits/project/handlers.ts#L168-L206),
[usage fallback](https://github.com/pingdotgg/t3code/blob/v0.1.6/packages/shared/src/usageLimits.ts#L64-L101)

**Released v0.1.6, like the earlier qualified releases, has no outside-agent MCP quota read.** The bundled
[quota reader](limits.md) reads T3's native provider snapshots through its
client RPC with a separately authorized environment session. It accepts exactly
0.1.0, 0.1.1, 0.1.2, 0.1.5 and 0.1.6/protocol 2; this is not a promised stable third-party API.
The authenticated **Usage → Limits** UI remains the fallback and can also include
pooled/external usage sources outside the reader's coverage. Available windows
depend on the provider/auth path:

- Codex uses a temporary native app-server rate-limit read.
- Claude uses its SDK usage request without a prompt and with caching.
- Subscription-authenticated Grok uses its billing read; API-key/custom auth
  does not expose that subscription allowance.

Opening Limits can run these non-inference probes. A failed probe can leave
last-good percentages and their older `checkedAt`, hiding the latest failure;
even a refresh can reuse cached data. Preserve the window, account, observation
date and any published failure, not just a colored bar. A full session window
does not override an exhausted weekly window. Do not add percentages across
providers or treat them as comparable token budgets. Unknown allowance is
neither zero nor unlimited. See the
[released usage guide](https://github.com/pingdotgg/t3code/blob/v0.1.0/docs/user/usage.md#L79-L122).
The reader's additional 0.1.2 support uses the
[released native quota contract](https://github.com/pingdotgg/t3code/blob/v0.1.2/packages/contracts/src/providerUsageLimits.ts)
and does not expand its scope to pooled sources, imply fresh provider probes,
or by itself establish live qualification.

There is no automatic capacity router or reset mechanism in this package.
Capacity can inform an authorized choice; it does not authorize silently
switching account/model, purchasing quota, consuming a reset or restarting work.

## Execution and recovery

Scratch supports an idle launch: `scratch: true`, without initial message or
attachments, creates a fresh nonrepository folder. Do not combine it with
`projectId` or `workspaceStrategy`. For code, bind the actual registered project
and deliberate root/worktree strategy; project root is not the chief's working
directory. [Launch contract](https://github.com/pingdotgg/t3code/blob/v0.1.0/apps/server/src/mcp/toolkits/project/tools.ts#L104-L140)

Since v0.1.2 an outside launch can inherit a registered project's resolved
model and permission defaults, constrained by the caller's ceiling. Inherit
modes only deliberately, and pass the model explicitly for the reason above;
inheritance must not replace an explicit account/model/option/mode selection.
Null inherited settings on an outside chief do not describe project defaults.
A project read shows saved defaults, not the effective launch result: prepare
the worker idle, then verify its configuration and workspace before sending
work. This does not establish the same inheritance for Scratch.
[Default resolution](https://github.com/pingdotgg/t3code/blob/v0.1.2/apps/server/src/mcp/toolkits/project/handlers.ts#L128-L169)

In released v0.1.5, the configuration reader is folded into
`t3_thread_configure` rather than the older separate `t3_thread_configuration`.
Its read form supplies only the `threadId`; setting
`modelSelection` is a mutation and needs its own authority. The launch receipt
also returns `modelSelection`, while `t3_thread_read` supplies workspace and run
state. `t3_pending_request` combines the older list/read/respond operations.
Exposing `t3_thread_configure` exposes both read and change; there is no
read-only replacement. The tool is annotated destructive, so a host may
require approval even for its read form.
[Read/write branches](https://github.com/pingdotgg/t3code/blob/v0.1.5/apps/server/src/mcp/toolkits/thread/handlers.ts#L194-L260).

### Host tool filters

The host decides which of T3's tools the model sees; the OAuth grant and the
permission ceiling decide what those tools may do. Choosing one does not set
the other. A Codex host needs no `enabled_tools` list: without one it exposes
every tool T3 lists, and where the host loads MCP tools on demand through
tool search, an unfiltered server adds little context. An `enabled_tools`
allowlist matches exact names, so it silently hides any tool a T3 release
renames or merges, along with every new one, such as `t3_environment_links`
in 0.1.4, until someone edits the list.

A host owner who wants a brake where no approval prompt appears (for example
Codex with `approval_policy = "never"`) can set a short `disabled_tools`
denylist of the administration and scheduling tools the chief should not call,
such as `t3_project_delete`, `t3_environment_unlink` or `schedule_task`. A
denylist fails open, because a new tool is exposed until it is added, but it
survives renames of the tools the chief needs. Whether to filter, and how, is
the host owner's choice; review the choice against each T3 release.
[Codex tool filter](https://github.com/openai/codex/blob/67f0994b532b8740f14b5b738af7b7b2a915b1d6/codex-rs/codex-mcp/src/tools.rs#L63-L96),
[deferred exposure](https://github.com/openai/codex/blob/67f0994b532b8740f14b5b738af7b7b2a915b1d6/codex-rs/core/src/mcp_tool_exposure.rs#L156-L160)

Since 0.1.4, launch supports optional **`clientRequestId`** (checked at
v0.1.6); supply and retain it for a new logical launch. Releases 0.1.0–0.1.3
lack that field. Launch, send and interruption retry keys are tied to the
authenticated client session;
reauthentication can change their namespace. Do not replay changed inputs under
an old key or assume it survives a new grant: a changed launch payload with
the same key can replay the first worker without a conflict error. Model
changes and question responses have no retry key; reconcile them before repeating.
Wait returns state, not the result, and timeout does not cancel work. Pass
an explicit `timeoutMs` within the host's tool-call limit: without one T3 holds
a wait for up to 10 minutes, and it accepts at most 60
([wait bounds](https://github.com/pingdotgg/t3code/blob/v0.1.6/apps/server/src/mcp/OrchestratorMcpService.ts#L125-L126)).
Read messages/activity and complete needed text pagination. Use the [recovery guide](recovery.md)
before repeating a possibly accepted operation. [Launch replay](https://github.com/pingdotgg/t3code/blob/v0.1.5/apps/server/src/mcp/toolkits/project/handlers.ts#L63-L138),
[OAuth namespace](https://github.com/pingdotgg/t3code/blob/v0.1.5/apps/server/src/auth/McpOAuth.ts#L564-L575)

A worktree isolates tracked checkout writes, not credentials, services or
security access. T3 is not a generic filesystem-transfer API. Check source
access on the execution host and retain valuable editable output at its normal
owner before relying on workspace cleanup.

T3's storage cleanup runs on its own once the environment owner enables an age
or merge rule in Settings → Storage; the source default removes nothing by age.
Checked at v0.1.6, an inactivity rule removes a worktree when its threads have
had no message or run for the configured number of days, settled or not, and a
separate settled-age rule can remove it sooner. Uncommitted changes, an open
terminal, a running thread or pending work, and binding by several top-level
threads keep it. Ignored files keep it only under the "any local files" rule,
and `node_modules` never does. The branch, its commits and the conversation
stay; the next message to the thread recreates the worktree from its branch,
without the ignored files. Keep unique ignored outputs, such as
session-continuity records or renders, at their owner before a thread goes
quiet. A reviewer bound to an implementer's worktree as a second top-level
thread shares its writes and keeps it from ever retiring; give the reviewer a
new worktree from the implementation branch instead.
[Cleanup rules](https://github.com/pingdotgg/t3code/blob/v0.1.6/apps/server/src/storageCleanup.ts#L836-L893),
[local-change check](https://github.com/pingdotgg/t3code/blob/v0.1.6/apps/server/src/storageCleanup.ts#L567-L605),
[defaults](https://github.com/pingdotgg/t3code/blob/v0.1.6/packages/contracts/src/settings.ts#L1164-L1173),
[recreation](https://github.com/pingdotgg/t3code/blob/v0.1.6/apps/server/src/orchestration-v2/ProviderTurnStartService.ts#L628-L662)

## Linked environments

Since 0.1.4 an environment can link the user's other machines. The chief
keeps one connection: `t3_environment_links` lists each linked environment
with its status, access, `expiresAt` and last error, and tools that take an
optional `environmentId` send the call there. The linked machine holds the call
to the link's access, narrowed to the chief's own modes. Checked at v0.1.6:

- A forwarded call cannot carry attachments.
- Retry keys are scoped to the calling client before they are forwarded, so
  the launch and send rules above hold across the link.
- A forwarded wait travels in pieces under a minute, so a long `timeoutMs`
  survives routes that drop idle requests.
- A worker that a link started cannot use links itself.
- While linked environments are off on the connected machine, a call naming
  another machine fails with `capability_denied`; the user turns them on in
  Settings → Labs.
- A link holds a sign-in on the linked machine that lasts 30 days and does
  not renew. Once it expires, calls fail with a message naming that machine;
  the user links it again with a new pairing code from it. Expiry is not a
  reason to substitute another route, machine or account.

[Link tools](https://github.com/pingdotgg/t3code/blob/v0.1.6/apps/server/src/mcp/toolkits/orchestrator/tools.ts#L308-L348),
[forwarding](https://github.com/pingdotgg/t3code/blob/v0.1.6/apps/server/src/peer/PeerForwarding.ts#L94-L212),
[expiry](https://github.com/pingdotgg/t3code/blob/v0.1.6/apps/server/src/peer/PeerLinks.ts#L535-L552),
[sign-in lifetime](https://github.com/pingdotgg/t3code/blob/v0.1.6/apps/server/src/auth/EnvironmentAuth.ts#L74)

## Remote access, memory and continuation

Reaching the same Mac chief remotely preserves that chief's execution route;
opening a separate T3 client is a different interaction. Pairing, network
reachability, chief tool access and successful provider work are separate
checks. This plugin does not configure tunnels, new hosts or remote-chief
delivery.

T3 retains its worker transcripts. Reading a result into the chief does not
import the complete conversation into native learned memory. Curate useful
findings and unresolved effects at the chief's normal work owner; do not build
a second transcript archive to imply memory integration.

Operate while the chief follows the work, or recover the worker when the chief
returns. Internal T3 parent notifications do not establish delivery into or
wake-up of an idle external chat. A separate supported wake-up mechanism needs
its own demonstrated lifecycle and user authorization; this plugin ships none.
