# Capability boundaries

Read this when deciding whether T3 fits an assignment, interpreting quota, or
explaining what remote access and returned results actually provide. The
outside-agent baseline below is **released T3 v0.1.0**, with discovery and
project-default changes checked in **released v0.1.2**. Quota contract support
is source-checked through v0.1.2; source support and a live read are separate
claims. This does not assert that later contracts are identical. Use the
connected tool schemas for current syntax and exposure.

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

**Outside-agent MCP through released v0.1.2 has no quota/usage read.** The bundled
[quota reader](limits.md) reads T3's native provider snapshots through its
client RPC with a separately authorized environment session. It accepts exactly
0.1.0, 0.1.1, and 0.1.2/protocol 2; this is not a promised stable third-party API.
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

In v0.1.2 an outside launch can inherit a registered project's resolved model
and permission defaults, constrained by the caller's ceiling. Use that
inheritance deliberately when the commission leaves the settings open; it
must not replace an explicit account/model/option/mode selection. Null inherited
settings on an outside chief do not describe project defaults. A project read
shows saved defaults, not the effective launch result: prepare the worker idle,
then verify its configuration and workspace before sending work. This does not
establish the same inheritance for Scratch.
[Default resolution](https://github.com/pingdotgg/t3code/blob/v0.1.2/apps/server/src/mcp/toolkits/project/handlers.ts#L128-L169)

Launch has **no idempotency key**. Send and interruption do, but their namespace
is tied to the authenticated client session; reauthentication can change it.
Wait returns state, not the result, and timeout does not cancel work. Read
messages/activity and complete needed text pagination. Use the [recovery guide](recovery.md)
before repeating a possibly accepted operation. [Operations contract](https://github.com/pingdotgg/t3code/blob/v0.1.0/apps/server/src/mcp/toolkits/orchestrator/tools.ts#L236-L273),
[OAuth namespace](https://github.com/pingdotgg/t3code/blob/v0.1.0/apps/server/src/auth/McpOAuth.ts#L572-L580)

A worktree isolates tracked checkout writes, not credentials, services or
security access. T3 is not a generic filesystem-transfer API. Check source
access on the execution host and retain valuable editable output at its normal
owner before relying on workspace cleanup. Ignored files are not necessarily
protected from that cleanup.

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
