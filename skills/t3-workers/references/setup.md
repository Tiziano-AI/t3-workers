# Connect the chief

Use this for first setup or missing MCP tools. If T3 tools already work in the
intended chief, reuse that connection. Installing this skill is not a reason to
log in again, add another server or restart T3.

## Find the right server and client

The T3 server owns projects, files, provider accounts and worker conversations.
Desktop, browser and phone are clients of that environment. A phone opening T3
does not turn it into the machine running the workers.

Use a released T3 server, **0.1.4 or later**: the outside-agent MCP contract
arrived in 0.1.0, and linked environments and keyed launches in 0.1.4. Verify
the running server, not only the desktop's version. Obtain its exact MCP URL.
`http://127.0.0.1:3773/mcp` applies only when the chief executes
on the same machine as that server. Remote chiefs need their own reachable,
authenticated route; pairing does not create network reachability. Do not open
an unauthenticated public port as a connection fix.

Connect the chief to **one** environment. The user's other machines are
reached through T3's linked environments, which the user sets up in T3; the
chief then passes a linked machine's `environmentId` on each call. Do not add
a separate chief registration for each machine.

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

When the person asks the chief to start the login from its own shell, that
shell is not a terminal; a Claude Code chief's shell, for example, reads
standard input from `/dev/null`. Two host behaviors follow (Codex CLI 0.166.0,
Claude Code 2.1.316). Run Codex without `--no-browser`: `codex mcp login t3`
prints the sign-in address, opens it in the browser of the machine running the
login and waits up to five minutes without reading standard input; with
`--no-browser` it reads the final URL from standard input and stops as soon as
that input ends. `claude mcp login` deletes its stored token and then gives up
unless standard input is a terminal. On macOS,
`script -q /dev/null claude mcp login t3 --no-browser < <(sleep 300)` provides
a terminal and keeps its input open, since `script` passes the end of its own
input on and that cancels the login; the `sleep` ends on its own. Both logins
wait up to five minutes, so give the call longer than that or run it in the
background: stopping it early abandons the attempt and leaves a Claude chief
signed out. Approval returns to a `localhost` address on the computer that
opened the page, so the person opens the page on the machine running the
login, enters the pairing code and chooses the access. Opened elsewhere, the
page's final URL has to be pasted into the CLI's own prompt, which a chief's
shell cannot take without passing it through chat; the person then runs the
login in their own terminal instead.

## Consent and the three kinds of authentication

- **Provider authentication** lets T3 use a particular provider account.
- **Device pairing** connects a T3 client to the environment.
- **Outside-agent OAuth** grants this chief access to the environment's MCP.

One does not replace the others. A pairing code from T3's **Settings → Sharing
& access** (or `t3 auth pairing create` on the host) can participate in the
consent flow; it is **not** the MCP bearer credential.

The human completes OAuth consent. In T3 **0.1.0**, **Full access** is an
environment-wide bundle: `orchestration:read`, `orchestration:operate`,
`settings:write` and `source-control:write`. It is not limited to a named
project. Choose the grant for the intended work; do not select or approve Full
access automatically. Credentials stay in the native client's credential
store, never in this plugin, briefs or workers. Do not copy provider tokens or
add an `Authorization` header as an OAuth workaround. [Released grant contract](https://github.com/pingdotgg/t3code/blob/v0.1.0/apps/server/src/auth/EnvironmentAuth.ts#L73-L100)

Keep the connection non-required at chief startup where the host supports it.
Choose host tool exposure and approval policy separately from the server grant.
A Codex host needs no `enabled_tools` list: without one, every tool T3 lists is
exposed, and where the host loads MCP tools on demand an unfiltered server adds
little context. An allowlist matches exact names and silently hides tools a T3
release renames, merges or adds. If the host owner wants a brake where no
approval prompt appears, a short `disabled_tools` denylist of administration
and scheduling tools fails open but survives renames. The choice is the host
owner's; [Host tool filters](capabilities.md#host-tool-filters) explains both
shapes. This guide does not enforce host controls.

### Grants expire

A chief's MCP sign-in lasts **30 days** from approval, and so does each link
between environments. Neither renews itself, and in 0.1.6 the sign-in flow
cannot make either longer: it issues a fixed 30-day session and no refresh
token. A longer-lived token minted on the host with `t3 auth session issue` is
no substitute: T3's MCP endpoint refuses it unless it is minted as an agent
sign-in, and even then it carries no signed permission ceiling, so T3 caps it
at Supervised, and a chief could send it only as the static `Authorization`
header this guide rules out. When a grant lapses, the chief's calls or the
link's calls fail until a person approves again: the chief's sign-in through
the native login flow, a link with a new pairing code from the linked machine.
`t3_environment_links` shows each link's `expiresAt`, and on the host
`t3 auth session list` shows each agent sign-in's `issued` and `expires`
times. A chief whose connection is optional at startup keeps working without
T3 once its sign-in lapses, so check the connection rather than inferring it
from silence.
[Sign-in lifetime](https://github.com/pingdotgg/t3code/blob/v0.1.6/docs/user/outside-agents.md#remove-an-agent),
[fixed lifetime](https://github.com/pingdotgg/t3code/blob/v0.1.6/apps/server/src/auth/EnvironmentAuth.ts#L73-L74),
[no refresh token](https://github.com/pingdotgg/t3code/blob/v0.1.6/apps/server/src/auth/McpOAuth.ts#L541-L546),
[unsigned ceiling](https://github.com/pingdotgg/t3code/blob/v0.1.6/apps/server/src/auth/EnvironmentAuth.ts#L1294-L1300),
[link expiry](https://github.com/pingdotgg/t3code/blob/v0.1.6/apps/server/src/peer/PeerLinks.ts#L537-L552)

### Renew before a grant lapses

On T3, approving again does not revoke the current grant, so renewal can happen
at any time before expiry rather than after calls fail:

1. When the person asks for renewal, run the chief's native login again. The
   person approves the sign-in page and chooses the access again: the page
   defaults to **Read only**, and the new sign-in carries the access chosen
   now, not the old one's. T3 issues a second sign-in with its own 30 days;
   the old one stays valid until it expires or is revoked.
2. Use the executable and configuration the chief itself runs with. Claude
   Code keeps MCP sign-ins per `CLAUDE_CONFIG_DIR`. Codex keys them by server
   name and URL: on macOS and Linux by default in the OS keychain, which every
   `CODEX_HOME` on the machine shares, or in `CODEX_HOME/.credentials.json`
   when file storage is set. A login under another configuration can
   therefore store a credential the chief never reads, or replace the one
   other Codex homes use.
3. `claude mcp login` deletes Claude Code's stored token for the server before
   it opens the sign-in, and Codex saves only after approval. Until a Claude
   renewal is approved, a Claude chief that needs its stored credential has
   none, and an abandoned attempt leaves it signed out even though T3 still
   honors the old sign-in. Start a Claude renewal only when the person
   can approve it straight away.
4. A chief that is already running may keep calling with the sign-in it
   loaded when it started. Before the old sign-in expires, reload its MCP
   connection with the host's own control (in Claude Code, `/mcp`) or start a
   new session, then [check the connection](#check-the-connection-where-it-will-be-used).
   Reload between dispatches: a retry key used under the old sign-in need not
   deduplicate under the new one, so reconcile an uncertain launch or send by
   reading the thread first.
5. T3 records no last use for agent sign-ins (`t3 auth session list` shows
   `last connected: never`), and the old and new sign-ins carry the same name.
   Let the old one lapse, or, once every chief that used it has reloaded,
   revoke the one with the earlier `issued` time, with
   `t3 auth session revoke <session-id>` against the running server's T3 home
   or under **Settings → Sharing & access**.

A link renews the same way. Before its `expiresAt`, the person links that
machine again with a new pairing code from it. T3 replaces the link's stored
sign-in in place, so forwarded calls keep working; the old sign-in stays on
the linked machine until it expires or is revoked there. As with any new link,
a retry key used before it need not deduplicate after it.
[Renew a link](https://github.com/pingdotgg/t3code/blob/v0.1.6/docs/user/remote-access.md#link-another-environment),
[linking again](https://github.com/pingdotgg/t3code/blob/v0.1.6/apps/server/src/peer/PeerLinks.ts#L442-L478)

Paired T3 clients, such as a desktop app connected to a remote environment,
hold sessions of their own. Renewing the chief's sign-in does not renew them,
and they do not affect it.

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
| Some expected tools are missing after a T3 update | Compare any host tool filter with actual discovery. An `enabled_tools` allowlist hides tools a release renamed, merged or added: the configuration reader is folded into `t3_thread_configure`, the three `t3_pending_request_*` tools into `t3_pending_request`, and `t3_environment_links` arrived in 0.1.4. T3 itself hides its link tools while linked environments are off (Settings → Labs). Exposing `configure` exposes both reading and model changes. The host owner decides whether to update the allowlist, replace it with a short `disabled_tools` denylist, or drop the filter; none of these broadens OAuth or permissions. |
| Endpoint is unreachable | Check the selected route and existing service status; do not launch a second server. |
| Authentication or scope is rejected | Inspect the exact connection/grant and native login state; a sign-in older than 30 days has expired. Do not substitute accounts. |
| A linked machine is expired or unreachable | Read `t3_environment_links` for its status and last error. An expired link needs the user to link it again with a new pairing code from that machine; do not route around it. |
| Client reports a protocol mismatch | Identify the server/client owner and follow T3's update guidance; no blind reinstall or data-root switch. |

Use the refresh controls the current host offers. An application restart affects
the user's other work and is a separate operational action.

Installing, disabling or removing this plugin leaves the
user-managed MCP connection, server-side grant, T3 service and workers intact.
Disconnect or revoke through their native owners when explicitly requested.
