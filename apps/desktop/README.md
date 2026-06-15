# Software Factory Desktop Cockpit

This package is the Electron desktop cockpit for the local Software Factory.

## Cockpit Boot Smoke

Cockpit-touching work orders must compile the app and run:

```bash
bun run --cwd vendor/superset-sh/apps/desktop compile:app
bun run --cwd vendor/superset-sh test:cockpit-boot
```

The smoke launches the compiled Electron app in `FACTORY_LOCAL_ONLY=true`,
walks concrete authenticated routes, captures screenshots, and writes
`runs/wo-cs/cockpit-boot-smoke/results.json`.

The smoke fails when a route renders blank, triggers `RouteErrorBoundary`, or
logs a blocked local-resource message.

## factory:// Protocol

Packaged cockpit windows load from `factory://app/index.html#/`. Repository
resources that must be loaded as resources should use `factory://` URLs resolved
by the main process. Renderer code should not construct local file-resource
URLs; prefer hash/router navigation, tRPC document reads, `srcDoc`, blob/data
URLs, or `renderer/lib/factory-protocol-url.ts`.

## RouteErrorBoundary

Authenticated routes inherit `RouteErrorBoundary` through layout files. Keep
that boundary in place so route failures render an operator-readable recovery
surface instead of a blank window.

## Native Dependencies

Desktop installs should prefer published prebuilt binaries for native modules.
Run `bun run --cwd vendor/superset-sh/apps/desktop install:deps` after dependency
changes, then use `bun run --cwd vendor/superset-sh/apps/desktop copy:native-modules`
and `bun run --cwd vendor/superset-sh/apps/desktop validate:native-runtime` before
packaging.

The lockfile source of truth is `vendor/superset-sh/bun.lock`. If a package
falls back to source compilation on Windows, install Visual Studio Build Tools
with the Desktop C++ workload as a fallback, then rerun the install-deps and
native-runtime validation steps.
