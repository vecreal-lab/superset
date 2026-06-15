# Vecreal Component Library

Status: v0 component library through WO-CL.4 Phase D, pending Gate 4 final acceptance

This folder is the physical React component library for Vecreal UI primitives
inside the Software Factory desktop app.

## Contract

- Policy:
  `projects/_shared/foundations/component-library-implementation-policy.md`
- Brand principles:
  `projects/vecreal/drafts/brand-atoms/principles.md`
- Tokens source:
  `projects/vecreal/drafts/brand-atoms/design-tokens.json`
- Generated token snapshot:
  `vendor/superset-sh/apps/desktop/src/renderer/components/vecreal/tokens.ts`
- Component specs:
  `projects/vecreal/drafts/brand-atoms/component-library/`
- Accessibility:
  `projects/vecreal/drafts/brand-atoms/accessibility.md`

## Folder Shape

Each component uses one PascalCase folder:

```text
ComponentName/
  ComponentName.tsx
  ComponentName.test.tsx
  ComponentName.preview.tsx
  index.ts
```

WO-CL.1 created the infrastructure. WO-CL.2 shipped the first dogfood
component. WO-CL.4 expands the v0 library, with Gate 3 visual review closed
through the WO-PILLS Vecreal aesthetic baseline lock.

## Shipped Components

- Foundation primitives: `Button/`, `IconButton/`, `Chip/`, `AuthorChip/`,
  `AttentionPill/`, `StatusBadge/`, `Wordmark/`, `MotionPreset/`, and
  `DateTimeText/`.
- Composition and flow: `Card/`, `GateCard/`, `PipelineStrip/`, `Overlay/`,
  `ReferenceTree/`, `MediaGrid/`, `AuditLogEntry/`, and `DiffBlock/`.
- Feedback and evidence: `ChatTurnEntry/`, `CitationLink/`, `EmptyState/`,
  `ErrorState/`, `LoadingState/`, `FileCard/`, `ToastNotification/`, and
  `GateAdvancePulse/`.
- Forms, data, and navigation: `SearchInput/`, `FormField/`, `DataTable/`,
  `FilterSortDrawer/`, and `BulkActionsBar/`.

Deferred v0 contracts: `OnboardingPanel`, `CommentThread`, and `TrendMetric`
remain approved briefs only until a later implementation pass.

Known post-v0 gaps: `AttentionPill` is accepted as a v0 provisional baseline
pending a Path A reference/spec update, and the `/automations` route alias
smoke-test issue is deferred to WO-C26.4 final smoke or a small follow-up.

## Migration Pattern

When a factory primitive needs a status pill, import `StatusBadge` from
`renderer/components/vecreal/StatusBadge` instead of recreating chip markup in
the consuming primitive. Keep the state mapping in the consumer and keep visual
tokens inside the shared component.

## Rules

- Compose from existing brand atom specs.
- Use tokens from `tokens.ts` or CSS variables backed by `design-tokens.json`.
- Do not edit brand atom source files from this folder.
- Record `component_spec_compliance` evidence when a component ships.
- Record `atoms_gap_finding` when the implementation needs a pattern that does
  not exist in the brand atoms.
