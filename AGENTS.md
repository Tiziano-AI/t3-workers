# Working on T3 Workers

T3 Workers is a public, portable plugin for a native Codex or Claude Code
chief to operate persistent, visible workers in the user's own T3 environment.
The chief keeps the conversation and judgment; T3 owns execution and worker
state. This repository owns the reusable operating method and plugin packaging.

## Design

- Keep one shared skill and thin, native host manifests. Use current official
  host documentation and released T3 contracts, not a remembered plugin format.
- Call T3's supported MCP tools directly. Do not add another coordinator,
  transport proxy, scheduler, worker registry, credential store or tool catalog.
- Add helper code only for a demonstrated caller gap and a supported source.
  In particular, a skill does not create a missing structured quota interface.
- Keep account, model, effort and workspace choices explicit. Unknown quota is
  not unlimited; spare allowance is not permission to substitute an account.
- Reconcile uncertain effects before retrying. A wait timeout is not
  cancellation, and an interruption acknowledgement is not terminal evidence.
- Keep permissions, provider configuration and existing workers unchanged
  unless the current task explicitly authorizes those effects.

## Source and publication

This is public source. No personal account mappings, workstation paths,
credentials, transcripts, raw runtime captures or private deployment details
belong here. Use portable examples and primary-source links.

The canonical skill is under `skills/t3-workers/`. Host manifests and
marketplaces expose that same source; do not maintain host-specific copies.
The README owns installation and first use; architecture and qualification
belong in `docs/`. Keep installation, source validation, runtime discovery and
successful worker execution as distinct claims.

Do not install the plugin into a live user home, grant OAuth, launch workers,
restart applications or modify T3 as a side effect of development tests.
Use documented native plugin validation and isolated, non-inference checks.
New live qualification needs an explicitly scoped target and commission.

Preserve concurrent changes. Stage exact owned paths and review all outgoing
content for public suitability. The bootstrap commission authorizes creating
and initially publishing `Tiziano-AI/t3-workers`; later public pushes require
the user's authorization for that publication. Do not add other destinations.

Write source, documentation and commit messages in English.
