# Vecreal Component Vocabulary v0

Status: proposed for WO-CL.4 Gate 1 operator attestation
Date: 2026-05-05
Owner: COMPONENT_DESIGNER / PRODUCT_SCOPE

This is the proposed v0 reusable React component vocabulary for
`vendor/superset-sh/apps/desktop/src/renderer/components/vecreal/`.

Gate 1 decides whether this vocabulary is the right batch target before Phase B
design briefs begin.

## Source Discipline

- Brand atom authority: principle > component spec > token
  (`projects/vecreal/drafts/brand-atoms/principles.md`, source section 07).
- Accessibility floor: WCAG 2.1 AA
  (`projects/vecreal/drafts/brand-atoms/accessibility.md`, source section 48).
- Component review floor:
  `projects/_shared/foundations/component-library-a11y-checklist.md`.
- Token source: `design-tokens.json` through the generated `tokens.ts`
  snapshot; no raw visual values in component code.

## Build Intent Key

- `already_shipped`: present from CL.1/CL.2/CL.3; CL.4 cites but does not
  rebuild.
- `phase_b_build`: included in CL.4 Phase B briefs and Phase C implementation
  if Gate 1 approves.
- `phase_b_adaptation`: existing/migrated component receives additive variant
  or wrapper.
- `defer_product_wo`: product-specific pattern; consume later in Construction
  PM or Corporate Brain product UI WOs.
- `defer_after_v0`: useful but not needed for the first reusable batch.

## Proposed V0 Components

| Component | State | Build intent | Cited specs | Variants / sizes in v0 | States in v0 | Motion | A11y notes | Migration target | Complexity | Rationale | Deferred / gaps |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `tokens.ts` | `direct_consume` | already_shipped | `design-tokens.json`, source sections 04, 05, 22, 48, 59, 63 | generated token snapshot | n/a | token source only | n/a | none | n/a | Every component consumes tokens through this file. | Do not edit token source in CL.4. |
| `MotionPreset` | `direct_consume` | already_shipped | `live-state-cues.md` section 26; `loading-micro-indicators.md` section 63; `approval-workflow.md` section 59 | attention, progress, gate, reduced-motion wrappers | active, entering, exiting, reduced-motion | existing CL.3 presets | must respect `prefers-reduced-motion` | none | shipped | Shared motion wrapper prevents ad hoc animation. | Token alias gap `cl4-a2-token-alias-001` remains Path B. |
| `StatusBadge` | `direct_consume` | already_shipped | `live-state-cues.md` section 26; `notifications.md` section 39; `buttons.md` section 24 pill rhythm | queued, ready, running, completed, failed, canceled, paused | hover, focus, compact, live | `MotionPreset` only for running/active | state label cannot rely on color only | `factory-primitives/RunStatusBadge` consumers | shipped | Already dogfooded in CL.2 and needed by runs/right rail. | None for v0. |
| `ToastNotification` | `direct_consume` | already_shipped | `feedback.md` section 32; `notifications.md` section 39 | success, info, warning, error | entering, leaving, dismissed | `MotionPreset` | must not be the only state signal | none | shipped | Confirmation feedback for component surfaces. | Keep toasts secondary, never primary. |
| `GateAdvancePulse` | `direct_consume` | already_shipped | `approval-workflow.md` section 59; `live-state-cues.md` section 26 | compact, inline | active, reduced-motion | `MotionPreset` | decorative pulse disabled under reduced motion | none | shipped | Gate progress needs visible but quiet state. | Token alias gap applies. |
| `ChatTurnEntry` | `direct_consume` | already_shipped | `avatars-chips.md` section 33; `cards.md` section 36; `citations.md` section 28 | operator, coordinator, subagent-disclosed | hover, focus-within, cited, stale | static by default | author label, cited references reachable | none | shipped | Project Coordinator chat is the primary cockpit UI. | Subagent attribution variants can wait for C30.3/C26.x. |
| `Wordmark` | `direct_consume` | phase_b_adaptation | `wordmark.md`; `reference-design-system.html` lines 1505-1530; `assets/wordmark.svg` | titlebar, header, deck | light, dark | static | SVG title/label when meaningful; decorative when redundant | FactoryShell text/SVG usage | small | Prevents title-bar brand drift and V duplication. | No new visual pattern. |
| `Button` | `direct_consume` | phase_b_build | `buttons.md` section 24 | primary, secondary, ghost, clay, split, segmented | hover, focus, disabled, loading | loading indicator only | native `button`; icon-only requires label | scattered local buttons | medium | Base command primitive for every UI. | Destructive variant deferred unless spec confirms. |
| `IconButton` | `direct_consume` | phase_b_build | `buttons.md` section 24; `iconography.md` section 23 | ghost, toolbar, window-control-compatible | hover, focus, disabled, pressed | static | required `aria-label`; tooltip for unfamiliar icons | local icon buttons | small | Dense cockpit chrome needs consistent icon affordances. | Window-control specialization stays shell-owned. |
| `Chip` | `direct_consume` | phase_b_build | `avatars-chips.md` section 33 | filter, removable, avatar, mention, project-owner | xs, sm, md | hover, focus, selected, disabled | text label plus optional status semantics | `AuthorChip`, filters | medium | Chips appear in filters, authors, references, and handoffs. | Presence statuses explicitly out of scope. |
| `AuthorChip` | `adaptation` | phase_b_adaptation | `avatars-chips.md` section 33; author attribution schema from WO-B4.1 | human, agent-role, long-name | sm, md | hover, focus | initials/text readable; no photo/presence status | `factory-primitives/AuthorChip` | medium | Existing primitive should migrate to shared vecreal vocabulary. | Role-color tinting forbidden. |
| `AttentionPill` | `direct_consume` | phase_b_build | `notifications.md` section 39; `live-state-cues.md` section 26 | count, needs-my-reply, warning, blocker | sm, md | hover, focus, live-count | count and label announced where needed | right rail status indicators | small | Right rail and sidebar counts need one status grammar. | Keep color use under 95/5 clay rule. |
| `Card` | `direct_consume` | phase_b_build | `cards.md` section 36 | default, compact, interactive, evidence | sm, md | hover, focus, selected | clickable cards need button/link semantics | local cards | medium | Foundation for GateCard, MergePacket, rail items, file cards. | Rich marketing-card variants out of scope. |
| `GateCard` | `adaptation` | phase_b_adaptation | `approval-workflow.md` section 59; `cards.md` section 36; `buttons.md` section 24 | standard, mockup approval, merge approval | pending, approved, revised, blocked | `GateAdvancePulse` for active state | actions keyboard reachable; status text not color-only | `factory-primitives/GateCard` if present | large | Operator gates are central to factory work. | Advanced per-gate bodies can be slotted children. |
| `PipelineStrip` | `adaptation` | phase_b_adaptation | `multi-step-flows.md` section 37; `live-state-cues.md` section 26; `loading-micro-indicators.md` section 63 | compact, rail, full | empty, partial, active, complete, failed | `MotionPreset` for active stage | each stage has text/aria current | `factory-primitives/PipelineStrip` | large | Work-order progress needs a single visual grammar. | Graph-like orchestration deferred. |
| `DateTimeText` | `direct_consume` | phase_b_build | `date-time.md` section 35 | absolute, relative, deadline, timestamp range | stale, overdue, upcoming | static | semantic `time` element when possible | local timestamp formatting | small | Runs, receipts, and PM logs all need consistent dates. | Locale/deep calendar behaviors deferred. |
| `EmptyState` | `direct_consume` | phase_b_build | `empty-states.md` section 51; `brand-voice.md` | list-empty, filtered-empty, no-active-work | default, with-action | static | plain English; action button reachable | local placeholders | small | Informational screens must never feel blank or decorative. | Illustrations out of scope. |
| `ErrorState` | `direct_consume` | phase_b_build | `error-states.md` section 52; `feedback.md` section 32 | inline, panel, route, recoverable | retry, blocked, details-available | static unless retrying | plain-English summary; technical detail opt-in | local error panels | medium | C30 loop detection and cockpit errors need calm recovery UI. | Raw log viewer deferred to detail disclosure. |
| `LoadingState` | `direct_consume` | phase_b_build | `loading-states.md` section 53; `loading-micro-indicators.md` section 63 | skeleton, panel, inline, dots | loading, refreshing, delayed | `MotionPreset` or static under reduced motion | loading labels where state is not obvious | local spinners | medium | Replaces unlabelled spinners with specific states. | Micro-indicator aliases remain Path B. |
| `Overlay` | `direct_consume` | phase_b_build | `modals-overlays.md` section 25; `accessibility.md` section 48 | Modal, Drawer, Popover, Tooltip | open, closing, focus-trapped | reduced entrance/exit only | focus trap, Escape close, labelled title | local modals/drawers | large | Settings, previews, and detail overlays need a single a11y base. | Complex command palette remains Search-owned. |
| `SearchInput` | `direct_consume` | phase_b_build | `search.md` section 34; `forms.md` section 29 | global, local, command, list-filter | empty, typing, results, no-results | static | labelled input; keyboard result navigation | local search boxes | medium | Cockpit and product knowledge surfaces need consistent search. | Fuzzy search engine behavior stays route-owned. |
| `FormField` | `direct_consume` | phase_b_build | `forms.md` section 29 | input, textarea, select, checkbox, radio, inline validation | focus, disabled, invalid, required | static | label/description/error association | local form controls | large | Gates, settings, onboarding, and Construction PM forms all need this base. | Numeric/currency field variants deferred to product WOs. |
| `DataTable` | `direct_consume` | phase_b_build | `tables.md` section 30; `filter-sort-drawer.md` section 55 | compact, selectable, sortable, empty | hover, selected, loading, filtered | static | real table markup; header scope | local tables/lists | large | WOs, receipts, findings, logs, RFIs, and portfolio views need tables. | Virtualized/huge-table behavior deferred. |
| `FilterSortDrawer` | `direct_consume` | phase_b_build | `filter-sort-drawer.md` section 55; `buttons.md` section 24; `avatars-chips.md` section 33 | closed, open, applied filters | focus, reset, disabled option | static | drawer focus handling; chips removable by keyboard | list filters | medium | List surfaces need direct controls, not chat, for passive filtering. | Saved filter presets deferred. |
| `BulkActionsBar` | `adaptation` | phase_b_build | `bulk-actions.md` section 54; `buttons.md` section 24 | selection-count, action group | empty, active, disabled | static | buttons labelled; destructive actions require confirmation | list actions | medium | Useful once DataTable has selectable rows. | Cross-page bulk operations deferred. |
| `FileCard` | `direct_consume` | phase_b_build | `files.md` section 38; `citations.md` section 28 | document, image, receipt, attachment | uploading, ready, missing, selected | optional upload progress | file type and status spoken | local attachment/file rows | medium | Project Brain and cockpit both revolve around cited artifacts. | True upload workflow stays product/route-owned. |
| `CitationLink` | `direct_consume` | phase_b_build | `citations.md` section 28; `confidence-primitive.md`; `citation-primitive.md` | inline, footnote, evidence chip | hover, focus, expanded | static | link text meaningful; target clear | local citations | medium | Citation-everywhere requires a reusable primitive. | Deep source preview lives in ReferenceTree/FileCard. |
| `ReferenceTree` | `direct_consume` | phase_b_build | `reference-tree.md` section 40; `citations.md` section 28 | source tree, dependency tree, compact rail | expanded, collapsed, selected, broken | static | tree keyboard semantics where interactive | `DependencyGraph`/source references | large | Entity mention expansion and evidence graphs need structure. | Full graph layout deferred. |
| `MediaGrid` | `direct_consume` | phase_b_build | `photo-gallery.md` section 46; `modals-overlays.md` section 25 | thumbnail grid, mockup grid, modal-trigger | selected, approved, pending, revision-requested | static | image alt/label; modal focus trap | MockupRenderer/MockupApprovalGrid | large | Mockup review and Construction PM photos share grid needs. | Photo editing/annotation deferred. |
| `AuditLogEntry` | `adaptation` | phase_b_build | `audit-log-surface.md` section 62; `log-design-system.md` section 47 | receipt, run event, finding, synthesis | expanded, collapsed, warning, blocker | static | event time/source accessible | audit/finding rows | medium | AUDIT/SYNTHESIS browsers need consistent trace rows. | Full timeline surface deferred. |
| `DiffBlock` | `direct_consume` | phase_b_build | `versioning-diff-ui.md` section 57; `cards.md` section 36 | inline diff, file diff, summary diff | added, removed, changed, unchanged | static | color plus text/sign; code readable | local diff renderers | large | Foundation/doc revisions and drawings need legible diffs. | Drawing overlay diff deferred to product-specific work. |
| `OnboardingPanel` | `adaptation` | defer_after_v0 | `onboarding.md` section 61; `multi-step-flows.md` section 37 | inherited, outstanding, complete | active, blocked, complete | PipelineStrip if stepped | clear labels and progress | adaptive onboarding | large | Needed for C26.5 but not the first CL.4 build batch. | Brief when onboarding WO begins. |
| `CommentThread` | `adaptation` | defer_after_v0 | `threaded-comments.md` section 42; `anchored-comments.md` section 58 | thread, anchored, resolved | open, resolved, replying | static | editor labels; thread navigation | future review surfaces | large | Useful for document review but coordinator chat is primary today. | Build only when a surface needs comments. |
| `TrendMetric` | `adaptation` | defer_after_v0 | `trends-data-viz.md` section 27 | metric card, mini trend, comparison | loading, empty, warning | subtle counter only if needed | chart/table labels; color not sole signal | Home/Strategy Pulse | medium | Corporate Brain and dashboards will need it. | Chart library choice deferred. |

## Deferred Product-Specific Specs

These specs are important, but they should not become CL.4 generic v0
components unless the operator promotes them at Gate 1:

| Spec | Reason deferred |
| --- | --- |
| `subcontractor-profile.md` section 44 | Construction PM product-specific; build in Project Brain product UI WO. |
| `schedule-strip.md` section 43 | Construction PM schedule-awareness primitive; PipelineStrip covers factory runs. |
| `cost-tables.md` section 45 | Product-specific cost/CO/invoice tables; DataTable foundation ships first. |
| `mobile-patterns.md` section 60 | Desktop Electron cockpit is the current target; mobile companion is v1/v2. |
| `slide-*.md` WO-C34.5 slide atoms | Pitch-deck/export artifacts, not React cockpit/product components for CL.4. |

## Open Spec Gaps

```yaml
spec_gaps:
  - finding_id: cl4-a2-token-alias-001
    severity: info
    type: token_coverage_gap
    applies_to:
      - MotionPreset
      - GateAdvancePulse
      - PipelineStrip
      - LoadingState
    summary: >
      CL.3 needed semantic aliases named duration-base, easing-emphasized,
      and easing-decelerate; existing generated token names cover the values
      as motion-medium, ease-spring, and ease-out.
    action: >
      Keep using existing token names. Do not modify design-tokens.json or
      known-gaps.md in CL.4; route to operator-curator Path A later.
```

## Gate 1 Recommendation

Approve this vocabulary if the operator wants CL.4 Phase B to brief reusable
factory/product primitives first, while leaving Construction PM-specific and
deck-specific atoms visible but deferred.
