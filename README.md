# T3 Workers

**Keep your main agent. Give it your T3 fleet.**

Native plugins for **Codex** and **Claude Code** to assign work to persistent,
visible [T3 Code](https://github.com/pingdotgg/t3code) workers across accounts
and providers, follow their execution, recover interrupted work and bring back
the actual results.

Your chief keeps the main conversation, judgment and integrations. T3 keeps
workers and their conversations. This plugin supplies the operating method,
MCP onboarding and the consequential lessons between them—not another server.
A small, optional command reads T3's own per-account quota snapshots.

**Status: development bootstrap, `0.1.0-alpha.1`.** The package targets T3's
released outside-agent MCP, available from **T3 0.1.0**. Publication is not a
claim that both hosts, every provider or every recovery path have passed live
qualification. See [architecture and qualification](docs/architecture.md).

## Install

Use a current native client with plugin support. There is one shared skill,
exposed through each host's own manifest and marketplace.

### Codex

```sh
codex plugin marketplace add Tiziano-AI/t3-workers
codex plugin add t3-workers@t3-workers
```

Use the CLI belonging to your intended Codex installation. A desktop app's
bundled runtime and another `codex` on your PATH can have different capabilities.
Alternatively, add the marketplace, select **T3 Workers** in the desktop plugin
directory and install it there. Start a fresh local chat and verify that the
skill is available; a Git checkout or marketplace listing alone is not proof
that the chat loaded it.

### Claude Code

```sh
claude plugin marketplace add Tiziano-AI/t3-workers
claude plugin install t3-workers@t3-workers --scope user
```

Run `/reload-plugins` where supported, or start a new session. The explicit
skill invocation is `/t3-workers:t3-workers`.

These commands install the operating package. They do not install T3,
authenticate provider accounts or approve an MCP connection.

## Connect your T3 environment

If the chief already has callable T3 tools, **reuse that connection**. The
plugin deliberately does not bundle a second MCP registration, a fixed server
address or credentials.

Otherwise, obtain the outside-agent MCP URL from your T3 environment, then use
the intended chief's native client:

```sh
# Set this to the exact endpoint you intend to control.
# Loopback applies only when the chief and T3 server run on the same machine.
T3_MCP_URL='http://127.0.0.1:3773/mcp'

# Codex
codex mcp add t3 --url "$T3_MCP_URL"
codex mcp login t3

# OR Claude Code
claude mcp add --transport http --scope user t3 "$T3_MCP_URL"
claude mcp login t3
```

Complete OAuth in the native consent flow. **In T3 0.1.0, Full access grants
environment-wide orchestration, settings-write and source-control-write
scopes**, not access limited to a named project. Choose the grant deliberately;
the plugin does not choose or approve it for you. Prefer the supported OAuth
route, not copied worker tokens or `Authorization` headers.

The installed [setup guide](skills/t3-workers/references/setup.md) covers
installation ownership, device pairing versus OAuth, headless service use,
host-specific discovery and connection recovery. No connection is propagated
to workers automatically.

## Use it

You can describe the job normally, or explicitly invoke the skill:

> Use T3 Workers to inspect my fleet. Explain account and model eligibility,
> what we know about capacity, and any gap before you dispatch anything.

> Ask a suitable T3 worker to review this proposal without changing files.
> Keep my selected account and model, follow the work, send a follow-up if
> needed, and bring back your assessment of the actual result.

> Recover the T3 worker for this assignment. Find its current state and result
> before deciding whether anything needs to be sent again.

The method is opinionated about clear ownership and recovery, not about which
provider must win. Use native subagents when they are the simpler fit; use T3
when persistent visibility, another provider/account or its execution
environment adds value. Explicit selections are not silently downgraded.

### Limits worth knowing

- **Quota is essential but not MCP-native in the 0.1.0 baseline.** The bundled
  [quota reader](skills/t3-workers/references/limits.md) uses T3's native client
  RPC with a separately authorized read-only session. It requires Node.js
  22.15+ and is qualified only for **T3 0.1.0 / protocol 2**. It reports native
  account/window snapshots, not an automatic quota router; old values can
  survive a failed refresh. T3's authenticated **Usage → Limits** remains the
  fallback when no reader credential is available.
- **The chief must be active or return.** Waiting and later recovery are
  supported operating patterns. Internal T3 parent notifications do not prove
  that an idle external chief will wake up.
- **Results are not automatic memory ingestion.** Reading a worker's answer
  does not import its complete transcript into the chief's learned memory.
- **Worktrees isolate checkouts, not security.** Retain valuable outputs before
  relying on checkout cleanup; ignored files are not necessarily protected.
- **Permission modes are ceilings, not new authority.** Publishing, spending,
  disclosure and unrelated work still need the user's commission. Human
  security approvals stay human.

The installed [capability guide](skills/t3-workers/references/capabilities.md)
explains the boundaries and links to released primary sources. The plugin does
not patch T3, change providers or install a supervisor, memory service or
polling daemon.

## Update or remove

For Codex:

```sh
codex plugin marketplace upgrade t3-workers
codex plugin add t3-workers@t3-workers
# Remove only this plugin when desired:
codex plugin remove t3-workers@t3-workers
```

For Claude Code:

```sh
claude plugin marketplace update t3-workers
claude plugin update t3-workers@t3-workers --scope user
# Remove only this plugin when desired:
claude plugin uninstall t3-workers@t3-workers --scope user
```

Reload the supported host or start a new session and check the selected version.
Disabling or uninstalling this plugin leaves the separately
configured MCP connection, OAuth grant, T3 service and accepted workers intact.
Stopping work, removing a connection and revoking its grant are separate
actions. Removing an entire marketplace can affect its installed plugins; it
is not an update-repair step.

## Development

```sh
python3 -m unittest discover -s tests -v
node --test tests/limits.test.mjs
claude plugin validate --strict .
claude plugin validate --strict .claude-plugin/plugin.json
```

These check package structure and synthetic quota-protocol cases, not live
worker success. None installs the plugin or launches a worker. For local Claude
development without installation, use
`claude --plugin-dir /absolute/path/to/t3-workers`; that starts
an interactive host and is separate from validation.

The [architecture](docs/architecture.md) records the packaging decisions,
primary documentation and remaining live qualification. Contributions should
preserve the single shared skill, native connection ownership and portable
examples. MIT licensed; not an official T3, OpenAI or Anthropic product.
