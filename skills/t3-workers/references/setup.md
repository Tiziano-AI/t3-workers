# Connect the chief

Use this for first setup or missing MCP tools. If T3 tools already work in the
intended chief, reuse that connection. Installing this skill is not a reason to
log in again, add another server or restart T3.

## Find the right server and client

The T3 server owns projects, files, provider accounts and worker conversations.
Desktop, browser and phone are clients of that environment. A phone opening T3
does not turn it into the machine running the workers.

Use a released T3 server with the outside-agent MCP contract, introduced in
**0.1.0**. Verify the running server, not only the desktop's version. Obtain its
exact MCP URL. `http://127.0.0.1:3773/mcp` applies only when the chief executes
on the same machine as that server. Remote chiefs need their own reachable,
authenticated route; pairing does not create network reachability. Do not open
an unauthenticated public port as a connection fix.

T3's [installation guide](https://github.com/pingdotgg/t3code/blob/v0.1.0/docs/user/install.md)
distinguishes the desktop app from the standalone CLI. In particular,
`brew install --cask t3-code` installs the desktop, **not** the standalone CLI.
The desktop can expose its bundled command through Settings → General → About
→ t3 command → Install. The separate CLI has its own installer and update path;
inspect which executable you have before choosing either.

For an explicitly commissioned background-server setup, use T3's native
`t3 service install` and `t3 service status`, not a custom supervisor. On macOS
the service starts at **login**, not before login, and stops at logout; the
machine must remain logged in and awake for unattended use. `t3 serve` serves
the web UI without opening a browser. Run **one server per T3 home**: do not
start it beside an active service using the same data.

Installation, service changes and updates are separate effects from connecting
this chief. Follow T3's [background-service guide](https://github.com/pingdotgg/t3code/blob/v0.1.0/docs/user/background-service.md)
and [update guide](https://github.com/pingdotgg/t3code/blob/v0.1.0/docs/user/updating.md)
when those effects are requested. A desktop sidebar update can coordinate
provider, connected-server and desktop updates; do not assume it changes only
the visible client. Updating a standalone launcher does not prove an existing
server process has restarted on that version.

### Local scripting is a narrower route

Released v0.1.2 provides native `t3 thread start/send/show/list` for scripts on the
server's host. Inspect the selected executable and T3 home before using it;
an update or new grant is not an automatic preflight. Keep MCP as the chief's
operating surface: the CLI does not expose idle-first launch, model options
such as effort/tier, caller-supplied retry keys, interruption, or question
responses. Its `send` always queues. After an uncertain dispatch, reconcile the
existing thread/timeline rather than repeating the command blindly.
[Native scripting guide](https://github.com/pingdotgg/t3code/blob/v0.1.2/docs/user/outside-agents.md#scripts-on-the-host)

These thread commands create a **host-owner/full-access session**, distinct
from MCP OAuth and the quota reader's temporary read-only session. They normally
attempt revocation on exit, but cleanup is not guaranteed; the underlying TTL
is 30 days. Even `show`/`list` are not credential-free reads, and process exit
does not prove revocation. Do not use this route as the quota reader's session
recipe or add a wrapper to imitate the missing MCP controls.
[CLI lifecycle](https://github.com/pingdotgg/t3code/blob/v0.1.2/apps/server/src/cli/thread.ts),
[session lifetime](https://github.com/pingdotgg/t3code/blob/v0.1.2/apps/server/src/auth/EnvironmentAuth.ts#L72-L86)

## Register through the native chief

Choose the intended native installation and configuration scope. A desktop's
bundled Codex and an unrelated `codex` on PATH can differ. An account switch,
another runtime home and another machine are not the same change: inspect the
current connection before deciding any credentials are missing.

For a **new** user-managed connection, substitute the exact URL and run only
the block for the intended chief. Do not overwrite an existing `t3`
registration without resolving its owner.

**Codex**

```sh
T3_MCP_URL='http://127.0.0.1:3773/mcp'
codex mcp add t3 --url "$T3_MCP_URL"
codex mcp login t3
```

**Claude Code**

```sh
T3_MCP_URL='http://127.0.0.1:3773/mcp'
claude mcp add --transport http --scope user t3 "$T3_MCP_URL"
claude mcp login t3
```

Claude Code can also initiate consent through `/mcp`.
Use the client's supported browserless flow if appropriate; do not manufacture
OAuth callbacks or paste secrets into chat. See [T3 outside-agent setup](https://github.com/pingdotgg/t3code/blob/v0.1.0/docs/user/outside-agents.md),
[native Codex MCP](https://learn.chatgpt.com/docs/extend/mcp#connect-an-existing-mcp-server)
and [Claude MCP](https://code.claude.com/docs/en/mcp).

## Consent and the three kinds of authentication

- **Provider authentication** lets T3 use a particular provider account.
- **Device pairing** connects a T3 client to the environment.
- **Outside-agent OAuth** grants this chief access to the environment's MCP.

One does not replace the others. A pairing code from the authenticated T3
Settings → Connections page (or its native pairing command) can participate in
the consent flow; it is **not** the MCP bearer credential.

The human completes OAuth consent. In T3 **0.1.0**, **Full access** is an
environment-wide bundle: `orchestration:read`, `orchestration:operate`,
`settings:write` and `source-control:write`. It is not limited to a named
project. Choose the grant for the intended work; do not select or approve Full
access automatically. Credentials stay in the native client's credential
store, never in this plugin, briefs or workers. Do not copy provider tokens or
add an `Authorization` header as an OAuth workaround. [Released grant contract](https://github.com/pingdotgg/t3code/blob/v0.1.0/apps/server/src/auth/EnvironmentAuth.ts#L73-L100)

Keep the connection non-required at chief startup where the host supports it.
Choose host tool exposure and approval policy separately from the server grant:
the operating cycle does not need destructive administration or internal T3
tools. A broad grant does not require exposing every server tool to the model.
This guide is not enforcement of those host controls.

## Check the connection where it will be used

After the host's supported refresh or a new session, discover the tools in the
**actual chief chat** and call `orchestrator_capabilities`. Resolve the intended
environment with project reads. A config entry, successful login page or other
CLI session does not establish tool access here. Tool prefixes can differ;
follow the actual catalog rather than matching one hardcoded namespace.

If tools are missing, distinguish these cases before changing anything:

| Observation | Next check |
| --- | --- |
| Plugin skill is missing | Check marketplace, installed version and host reload; this is not a T3 service failure. |
| Skill loads, but T3 tools do not | Inspect the native MCP registration and discovery/enablement in this chief. |
| Endpoint is unreachable | Check the selected route and existing service status; do not launch a second server. |
| Authentication or scope is rejected | Inspect the exact connection/grant and native login state; do not substitute accounts. |
| Client reports a protocol mismatch | Identify the server/client owner and follow T3's update guidance; no blind reinstall or data-root switch. |

Use the refresh controls the current host offers. An application restart affects
the user's other work and is a separate operational action.

Installing, disabling or removing this plugin leaves the
user-managed MCP connection, server-side grant, T3 service and workers intact.
Disconnect or revoke through their native owners when explicitly requested.
