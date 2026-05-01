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
