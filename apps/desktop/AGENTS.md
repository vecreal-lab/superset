# Implementation details
For Electron interprocess communication, ALWAYS use trpc as defined in `src/lib/trpc`
Please use alias as defined in `tsconfig.json` when possible

## Local-only mode (FACTORY_LOCAL_ONLY)

Any renderer code that bypasses cloud organization/session lookup must use this
canonical idiom:

```typescript
const authBypassEnabled =
  env.SKIP_ENV_VALIDATION || env.FACTORY_LOCAL_ONLY === "true";
```

Use `authBypassEnabled` for every org/auth bypass condition. Do not check only
`env.SKIP_ENV_VALIDATION`; that flag is development-only and does not cover the
factory's production local-only path.

`.superset/setup.sh`, `.superset/teardown.sh`, and
`.superset/hooks/notify.sh` are no-op stubs in `FACTORY_LOCAL_ONLY` mode.
Software Factory does not use upstream Superset cloud setup/teardown
infrastructure.

Known local-only boot/auth entry points:

- `src/renderer/routes/_authenticated/layout.tsx`
- `src/renderer/routes/_authenticated/providers/CollectionsProvider/CollectionsProvider.tsx`
- `src/renderer/routes/_authenticated/providers/LocalHostServiceProvider/LocalHostServiceProvider.tsx`

Known bypass audit targets from the post-WO-C14 boot fix:

- `src/renderer/routes/_authenticated/hooks/useMigrateV1PresetsToV2/useMigrateV1PresetsToV2.ts`
- `src/renderer/routes/_authenticated/hooks/useMigrateV1DataToV2/useMigrateV1DataToV2.ts`
- `src/renderer/routes/_authenticated/components/V1MigrationSummaryModal/V1MigrationSummaryModal.tsx`
- `src/renderer/routes/_authenticated/_dashboard/v2-workspaces/hooks/useAccessibleV2Workspaces/useAccessibleV2Workspaces.ts`
- `src/renderer/routes/_authenticated/components/DashboardNewWorkspaceModal/components/DashboardNewWorkspaceModalContent/DashboardNewWorkspaceModalContent.tsx`
- `src/renderer/routes/_authenticated/settings/hosts/page.tsx`
- `src/renderer/routes/_authenticated/settings/hosts/components/HostsSettingsSidebar/HostsSettingsSidebar.tsx`
- `src/renderer/routes/_authenticated/components/DashboardNewWorkspaceModal/components/DashboardNewWorkspaceForm/components/DevicePicker/hooks/useWorkspaceHostOptions/useWorkspaceHostOptions.ts`
- `src/renderer/routes/_authenticated/settings/projects/page.tsx`
- `src/renderer/routes/_authenticated/settings/projects/components/ProjectsSettingsSidebar/ProjectsSettingsSidebar.tsx`
- `src/renderer/routes/_authenticated/settings/projects/$projectId/page.tsx`
- `src/renderer/routes/_authenticated/_dashboard/components/DashboardSidebar/hooks/useDashboardSidebarData/useDashboardSidebarData.ts`

Boot-path failure mode to remember: a provider that returns `null` because a
required context value is missing can make the entire authenticated app render
nothing with no visible error or log. In FACTORY_LOCAL_ONLY mode, always grep
providers for `return null` and verify their org/auth context can resolve from
the local-only bypass.

## Cockpit stability rules

Packaged cockpit routes must not rely on the browser's local file origin.
The main process registers the `factory://` custom protocol before any window
opens. Packaged renderer HTML is loaded from `factory://app/index.html#/`, and
repository artifacts that must be shown as resources should use `factory://`
URLs resolved by the main-process handler. Do not construct local file-resource
URLs in renderer code. Use route/hash navigation, tRPC document reads, `srcDoc`,
blob/data URLs, or `renderer/lib/factory-protocol-url.ts` as appropriate.

Every cockpit-touching WO must run the boot smoke after `compile:app`:

```bash
bun run --cwd vendor/superset-sh test:cockpit-boot
```

`test:cockpit-boot` is single-instance. Do not run it concurrently across
multiple Codex windows; serialize boot smoke verification when Codex runs in
parallel. Concurrent runs trigger the Electron single-instance lock plus Bun 255
or debug-endpoint-not-open flakes. This is not a harness bug, but a usage
limitation.

The smoke boots Electron in `FACTORY_LOCAL_ONLY=true`, walks registered concrete
routes, verifies each route renders non-blank, captures screenshots under
`runs/wo-cs/cockpit-boot-smoke/`, and fails on route error boundaries or blocked
local-resource console messages.

Every authenticated route inherits `RouteErrorBoundary` from
`_authenticated/layout.tsx` and `_authenticated/_dashboard/layout.tsx`. Do not
remove that boundary when changing route layouts. Route failures must show the
operator a readable route, message, refresh action, and report action rather
than leaving a blank cockpit.

Provider edits under `_authenticated/providers/**` require a receipt
`provider_null_return_audit`: grep for `return null`, then verify each provider
can resolve required auth/org context in `FACTORY_LOCAL_ONLY=true`.

## Local git hook discipline

Do not let Superset local notification hooks spawn interactive shells during
Software Factory work. The repo-local `.superset/hooks/notify.sh` hook is a
no-op for this workspace, exports `GIT_TERMINAL_PROMPT=0`, redirects stdin/stdout/
stderr to null, and exits successfully. If a future setup step reinstalls that
hook, preserve the non-interactive behavior so parallel Codex git operations do
not open stray `/usr/bin/bash --login` windows.

## tRPC Subscriptions (trpc-electron)

**Important:** While standard tRPC recommends async generators for subscriptions, `trpc-electron` (used for Electron IPC) **only supports observables**. The library explicitly checks `isObservable(result)` and throws an error otherwise. Use the `observable` pattern:

```typescript
// CORRECT for trpc-electron - use observable pattern
import { observable } from "@trpc/server/observable";

export const createMyRouter = () => {
  return router({
    subscribe: publicProcedure.subscription(() => {
      return observable<MyEvent>((emit) => {
        const handler = (data: MyData) => {
          emit.next({ type: "my-event", data });
        };

        myEmitter.on("my-event", handler);

        return () => {
          myEmitter.off("my-event", handler);
        };
      });
    }),
  });
};

// WRONG for trpc-electron - async generators don't work with IPC transport
export const createMyRouter = () => {
  return router({
    subscribe: publicProcedure.subscription(async function* () {
      // This will NOT work - the generator never gets invoked
      while (true) {
        yield await getNextEvent();
      }
    }),
  });
};
```
