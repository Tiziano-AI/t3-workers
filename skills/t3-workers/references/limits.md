# Quota reader

Use `scripts/t3-limits.mjs` relative to this skill's directory when the chief
needs structured native-provider allowance. It requires **Node.js 22.15+**,
T3 **0.1.0 / orchestration protocol 2**, and a caller-supplied environment
bearer session with `orchestration:read`. There are no npm dependencies or
global installation. This is a version-qualified client of T3's first-party
RPC, not a documented stable third-party quota API or an MCP wrapper.

## Read the intended environment

```sh
# With T3_WORKERS_TOKEN already supplied privately by its owner:
node <this-skill-directory>/scripts/t3-limits.mjs \
  --url http://127.0.0.1:3773 --json

# Or one explicit private token file (raw token or native issuance JSON):
node <this-skill-directory>/scripts/t3-limits.mjs \
  --url http://127.0.0.1:3773 --token-file /absolute/private/session.json --json
```

Use the **environment origin**, not its `/mcp` URL. HTTPS and loopback HTTP are
accepted; URL credentials, paths, queries and fragments are rejected. URL
selection is `--url`, then `T3_WORKERS_URL`, then local
`http://127.0.0.1:3773`. For a remote environment, select it explicitly.
Pin a known identity with `--environment-id ID` or
`T3_WORKERS_ENVIRONMENT_ID`; descriptor identity/version is checked **before**
sending the bearer token. HTTPS still relies on normal server trust; an
environment ID is not cryptographic identity proof.

Choose exactly one credential source: `T3_WORKERS_TOKEN`, `--token-file PATH`,
or `--token-stdin`. Stdin/file can contain the raw token or native issuance
JSON's top-level `token`. Ambiguous sources fail rather than silently winning.
There is no secret command-line flag, credential extraction or automatic login.
Output includes account identity and quota metadata: keep it private rather
than copying it into public issues or tracked examples.

`--instance ID` filters by native **instanceId**, not account label or driver.
Omit it to discover all configured native instances. Without `--json`, the
same result is rendered as readable account/window lines.

## A different grant from MCP OAuth

Do not repurpose the chief's MCP OAuth credential: its `mcp-client` audience
is deliberately rejected by the native client API. `orchestration:read` grants
environment-wide reads, not quota-only or project-scoped access. If no normal session has
been supplied, use T3's authenticated UI or obtain authorization for one;
installing the plugin is not that authorization.

For an authorized session, use the installed T3 CLI and the **same data root
as the intended service**. Capture stdout privately because it contains the
bearer credential. For example, after selecting a private destination outside
repositories and configuration snapshots:

```sh
# Select a unique label and a previously unused private path first.
(umask 077; set -C; t3 auth session issue \
  --scope orchestration:read --label "$T3_LIMITS_LABEL" --ttl 1h --json \
  > "$PRIVATE_SESSION_JSON")
```

Pass `--base-dir` to the native commands if the service uses a nondefault root.
**Never omit `--scope`: T3 otherwise grants broad administrative defaults.**
Record the returned `sessionId` without revealing its token. T3 owns lifecycle:

```sh
t3 auth session list --json
t3 auth session revoke <exact-session-id>
```

For a one-off check, revoke that exact session afterward, verify it no longer
appears in the active list, then remove the caller-owned private token file.
If issuance was uncertain, reconcile the uniquely labelled session before
issuing again. The helper never creates, stores, renews or revokes credentials;
neither plugin removal nor a finished command revokes a supplied session.
[Audience boundary](https://github.com/pingdotgg/t3code/blob/v0.1.0/docs/internals/environment-auth.md#L26-L62),
[native session commands](https://github.com/pingdotgg/t3code/blob/v0.1.0/apps/server/src/cli/auth.ts#L164-L235).

## Snapshots and explicit refresh

The default reads `server.getConfig`; it requests no provider probe. Add
`--refresh` only when a native status refresh is appropriate and authorized.
It invokes `server.refreshProviders`, awaits it, then reads the published
snapshot again. A selected instance is validated before refresh; unknown IDs
are not allowed to turn into an unintended all-provider operation.

Native refresh can launch status-probing runtimes/contact providers without an
inference prompt. It respects native caches. **Completion is not proof of new
quota data**: last-good values and their original `checkedAt` can survive a
failed probe with no newly published failure. `refreshRequested` means only
that the refresh was requested. A timeout or disconnect does not cancel a
server-side refresh; no automatic retry or polling occurs. `--timeout-ms`
(default `15000`, accepted range `1`–`300000`) bounds this command's
network/RPC read, not the provider's underlying work.
[Native refresh](https://github.com/pingdotgg/t3code/blob/v0.1.0/apps/server/src/provider/ProviderRegistry.ts#L705-L787),
[last-good retention](https://github.com/pingdotgg/t3code/blob/v0.1.0/packages/provider-core/src/server/usageLimits.ts#L125-L134).

## Machine result and errors

`--json` writes one JSON object to stdout, with `schemaVersion: 1`:

- `source`: selected origin, environment ID/label, server/protocol version.
- `readAt`: command observation time; **not** the quota observation time.
- `refreshRequested`: whether native refresh was requested.
- `accounts[]`: instance ID, driver, optional display name, enabled/installed,
  version/status, authentication identity/status, provider `checkedAt`, and
  optional availability/message fields.
- `accounts[].usageLimits`: `null` for unknown, or native quota `checkedAt`,
  all `windows[]`, optional published `unavailable` and reset-credit count/expiry.
  Each window preserves ID/kind/label, `usedPercent`, derived
  `remainingPercent = 100 - usedPercent`, and optional reset/duration fields.

Missing limits are neither zero use nor unlimited. Check all applicable windows;
do not sum unlike windows/providers or double-count shared account allowance.
Provider `ready` is not proof of spare quota. External usage hubs/pooled Limits
sources are **not** included. Reset counts are reported, never consumed.
[Native fields](https://github.com/pingdotgg/t3code/blob/v0.1.0/packages/contracts/src/providerUsageLimits.ts#L20-L70).

Errors instead return `schemaVersion: 1` and `error: {code, message}`. Exit codes:
`0` successful snapshot, `2` invalid input/auth source or missing instance,
`3` HTTP/transport failure, `4` unqualified/incompatible protocol or identity,
`5` native RPC rejection, `6` deadline. Successful reads may contain unknown,
unsupported or exhausted quotas; those are data, not command failures. Error
codes distinguish the failing step without dumping server config, raw RPC
frames, tokens or stack traces. No provider/account fallback is performed.
