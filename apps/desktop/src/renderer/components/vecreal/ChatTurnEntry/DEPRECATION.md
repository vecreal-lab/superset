# ChatTurnEntry Deprecation Note

Status: historical component preview; deprecated for new cockpit production use.

Decision: keep `ChatTurnEntry` as design-system catalog evidence. Do not delete
the component while `DesignSystemSurface` still imports its preview.

Rationale: V0.5.4 moved routine Project Coordinator/chat work out of the cockpit
and into Claude Desktop/Codex via factory-mcp. The cockpit remains a visual
control surface, so new cockpit routes should use current factory primitives and
read-model views instead of chat-turn UI.

Allowed consumer: `renderer/components/DesignSystemSurface/DesignSystemSurface.tsx`
through `ChatTurnEntry.preview.tsx`.
