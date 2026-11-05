# Capability boundaries

Read this when deciding whether T3 fits an assignment, interpreting quota, or
explaining what remote access and returned results actually provide. The
outside-agent baseline below is **released T3 v0.1.0**, with discovery and
project-default changes checked in **released v0.1.2** and outside-chief
exposure/recovery checked in **released v0.1.5**. The method requires **T3
0.1.4 or later**; linked environments, launch model resolution, worktree
cleanup, runtime modes and request observation are checked in **released
v0.1.6**. Core launch/configuration, request/replay, linked-environment and
wait/stop behavior were reviewed against **v0.1.7**. The quota reader's actual
contracts are source-checked at v0.1.7, not gated by release number; source
review and a live read are separate claims. Use the connected tool schemas
for current syntax and exposure.

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

**An omitted `modelSelection` lets T3 choose the account.** An outside launch
without one takes the project's resolved default. Since 0.1.4, when that
account has an exhausted usage window for the model and a fallback selection
is configured for the project or environment, the worker starts on the
fallback account, and the launch reports no error. Pass the selection
explicitly and compare the returned `modelSelection` with it.
[Launch resolution](https://github.com/pingdotgg/t3code/blob/v0.1.6/apps/server/src/mcp/toolkits/project/handlers.ts#L168-L206),
[usage fallback](https://github.com/pingdotgg/t3code/blob/v0.1.6/packages/shared/src/usageLimits.ts#L64-L101)

**Released v0.1.7 has no outside-agent MCP quota read.** The bundled
[quota reader](limits.md) reads T3's native provider snapshots through its
client RPC with a separately authorized environment session. It requires
protocol 2, an RPC-only ticket route and compatible consumed fields, not an
allowlist of server versions. This is not a promised stable third-party API.
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
The [v0.1.7 native quota contract](https://github.com/pingdotgg/t3code/blob/v0.1.7/packages/contracts/src/providerUsageLimits.ts)
does not expand this reader's scope to pooled sources, imply fresh provider
probes, or by itself establish live qualification.

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
model and permission defaults, constrained by the caller's ceiling. Pass the
model and the runtime mode explicitly, for the reasons above and in
[Runtime modes and approvals](#runtime-modes-and-approvals); inherit the
interaction mode only deliberately. Inheritance must not replace an explicit
account/model/option/mode selection.
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

### Runtime modes and approvals

A launch's `runtimeMode` is one of `approval-required`, `auto-accept-edits`,
`auto` and `full-access`, ranked in that order. Checked at v0.1.6, T3 resolves
it in two steps. First against this connection's ceiling: an explicit mode
above it fails with `runtime_mode_escalation_denied`, and an omitted one
becomes the project's default runtime mode, or the ceiling when that default
is broader. Then against the provider: an explicit mode the provider does not
offer is refused, while an omitted one steps down to the broadest mode the
provider offers that is no broader than the mode already resolved, or to
`approval-required` when it offers none of those; it never rises above the
ceiling. `orchestrator_capabilities` lists a provider's `runtimeModes` only
when it offers a subset. The thread then reports the mode it runs in.
[Mode values](https://github.com/pingdotgg/t3code/blob/v0.1.6/packages/contracts/src/providerPolicy.ts#L25-L45),
[resolution](https://github.com/pingdotgg/t3code/blob/v0.1.6/apps/server/src/mcp/delegatedTaskModes.ts#L36-L73),
[ceiling](https://github.com/pingdotgg/t3code/blob/v0.1.6/apps/server/src/mcp/McpToolAccess.ts#L231-L249),
[project default](https://github.com/pingdotgg/t3code/blob/v0.1.6/apps/server/src/mcp/toolkits/project/handlers.ts#L207-L229),
[advertised modes](https://github.com/pingdotgg/t3code/blob/v0.1.6/apps/server/src/mcp/OrchestratorMcpService.ts#L2199-L2202)

The same mode means different things to different providers. The table
records what each released v0.1.6 adapter does with it when the runtime policy
carries no explicit approval or sandbox override; such an override replaces
these mappings, and this method does not establish when one is set. It is a
reading of T3's adapters, not a guarantee about each provider's own reviewer.

| Mode | Codex | Claude | Grok | Cursor |
| --- | --- | --- | --- | --- |
| `approval-required` | Read-only sandbox, approval policy `untrusted`; the user reviews | Permission mode `default` with T3's permission callback installed; requests Claude routes to the callback can become T3 approvals | Reads run; other tool permissions ask in T3 | Cursor's own auto-review gates execution, sandbox on |
| `auto-accept-edits` | Workspace-write sandbox, `on-request`; the user reviews | `acceptEdits` with the callback installed; Claude approves edits before the callback, and the remaining requests it routes there can become T3 approvals | Edits, deletes and moves run; other non-read permissions ask in T3 | Sandbox on, no auto-review |
| `auto` | Workspace-write sandbox, `on-request`; Codex's automatic reviewer reviews | Claude's `auto` mode; T3 installs no permission callback | Grok's own auto mode; any permission request reaching T3 asks the user | Cursor's own auto-review, sandbox on |
| `full-access` | Approval policy `never`, unrestricted sandbox | `bypassPermissions`; when the user's Claude settings disable bypass, `auto` (or `default` if auto is disabled too) with T3's permission callback installed | Permission requests are allowed | No sandbox, no auto-review |

Provider differences that change how a chief reads a worker:

- Claude in Plan interaction mode runs in permission mode `plan` with T3's
  permission callback installed, even in `auto` or `full-access`.
- A Claude worker launched in `full-access` gets the permission callback, and
  so can raise approvals, when the user's Claude settings disable bypass
  permissions.
- Cursor has no interactive approval request in T3: its adapter declares no
  approval support and rejects approval responses. A refusal by Cursor's
  auto-review appears in the worker's activity or result, never in
  `pendingRequestCount`, and there is no card in T3 for the user to answer.
  On Windows, Cursor runs without a filesystem sandbox where auto-review
  gates execution.
- Unknown from this source: when Codex's automatic reviewer escalates to the
  user, what Cursor's auto-review allows, and how Grok's native modes behave
  beyond T3's permission gate. Observe the worker rather than assuming.

[Codex mapping](https://github.com/pingdotgg/t3code/blob/v0.1.6/apps/server/src/orchestration-v2/Adapters/CodexAdapterV2.ts#L698-L737),
[Claude mapping](https://github.com/pingdotgg/t3code/blob/v0.1.6/apps/server/src/orchestration-v2/Adapters/ClaudeAdapterV2.ts#L2488-L2599),
[Grok launch mode](https://github.com/pingdotgg/t3code/blob/v0.1.6/packages/provider-grok/src/server/adapter.ts#L213-L220),
[Grok permission routing](https://github.com/pingdotgg/t3code/blob/v0.1.6/packages/provider-grok/src/server/adapter.ts#L298-L302),
[ACP permission rules](https://github.com/pingdotgg/t3code/blob/v0.1.6/packages/provider-acp/src/server/clientPolicy.ts#L75-L181),
[Cursor policy](https://github.com/pingdotgg/t3code/blob/v0.1.6/packages/provider-cursor/src/server/adapter.ts#L186-L199),
[Cursor approvals](https://github.com/pingdotgg/t3code/blob/v0.1.6/packages/provider-cursor/src/server/adapter.ts#L119-L126),
[Cursor responses](https://github.com/pingdotgg/t3code/blob/v0.1.6/packages/provider-cursor/src/server/adapter.ts#L2709-L2717)

**Observing a held worker from outside.** A top-level `t3_thread_wait`
settles only when its run is terminal; a run held on a question or an approval
keeps it waiting until `timeoutMs`. `t3_thread_read` reports
`pendingRequestCount`, which counts every pending runtime request: the
approval kinds (`command`, `file-read`, `file-change`, `mcp-elicitation`,
`permission`) and also `user_input`, `dynamic_tool_call` and `auth_refresh`.
`t3_pending_request` lists only `user_input` questions, so the difference
between the two numbers is not an approval count. The activity view renders
each approval as an `approval_request` item with its prompt, kind and reason.
No outside-agent MCP tool grants an approval; the person answers in T3. The
`pendingApproval` field, and the wait that returns early on it, belong to
`delegate_task`, which serves an internal T3 parent thread and answers an
outside chief with `thread_credential_required`.
[Request kinds](https://github.com/pingdotgg/t3code/blob/v0.1.6/packages/contracts/src/orchestrationV2.ts#L1199-L1209),
[pending count](https://github.com/pingdotgg/t3code/blob/v0.1.6/apps/server/src/mcp/OrchestratorMcpService.ts#L848-L850),
[question list](https://github.com/pingdotgg/t3code/blob/v0.1.6/apps/server/src/mcp/toolkits/thread/handlers.ts#L224-L235),
[question tool](https://github.com/pingdotgg/t3code/blob/v0.1.6/apps/server/src/mcp/toolkits/thread/tools.ts#L127-L131),
[approval activity](https://github.com/pingdotgg/t3code/blob/v0.1.6/apps/server/src/mcp/OrchestratorMcpService.ts#L914-L917),
[wait settlement](https://github.com/pingdotgg/t3code/blob/v0.1.6/apps/server/src/orchestration-v2/ThreadManagementService.ts#L928-L936),
[internal pendingApproval](https://github.com/pingdotgg/t3code/blob/v0.1.6/apps/server/src/mcp/OrchestratorMcpService.ts#L479-L523)

**Settling delegated work.** When the commission includes children or
background work, use `t3_thread_wait` with `untilDelegatedWorkSettled: true`
where supported. This waits for that work and its completion deliveries;
`resultRun` identifies the run carrying the final answer. A terminal initial
turn alone does not settle the whole assignment. Nonterminal waits still
require the pending-request checks above, and settlement still requires
reading and evaluating the result.
[Native wait contract](https://github.com/pingdotgg/t3code/blob/v0.1.7/packages/contracts/src/orchestratorMcp.ts#L486-L506)

**Interrupt and Stop differ.** `t3_thread_interrupt` with an exact `runId`
interrupts a turn. With `stop: true`, it performs T3's thread Stop: interrupt
the current turn, hold queued messages, and stop delegates and PR watches;
`runId` is ignored. An older linked peer can drop `stop` and only interrupt
the turn. Match the call to the authorized effect, then reconcile actual
state and surviving effects; an acknowledgement proves neither a complete
stop nor rollback. See [recovery](recovery.md#interrupt-a-turn-or-stop-the-assignment).
[Stop contract](https://github.com/pingdotgg/t3code/blob/v0.1.7/packages/contracts/src/orchestratorMcp.ts#L509-L529),
[forwarding boundary](https://github.com/pingdotgg/t3code/blob/v0.1.7/apps/server/src/mcp/OrchestratorMcpService.ts#L3188-L3237)

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
[deferred exposure](https://github.com/openai/codex/blob/67f0994b532b8740f14b5b738af7b7b2a915b1d6/codex-rs/core/src/mcp_tool_exposure.rs#L158-L162)

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
a wait for up to 10 minutes, and it caps any longer value at 60
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
- While linked environments are off on the connected machine, T3 hides its
  link tools, and a call naming another machine fails with
  `capability_denied`; the user turns them on in Settings → Labs.
- A link holds a sign-in on the linked machine that lasts 30 days and does
  not renew. Once it expires, calls fail with a message naming that machine;
  the user links it again with a new pairing code from it. Expiry is not a
  reason to substitute another route, machine or account. `t3_environment_link`
  shows its request card in the calling T3 thread, so an outside chief cannot
  raise it. A new link is a new sign-in there, so a retry key used before it
  need not deduplicate after it.

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
