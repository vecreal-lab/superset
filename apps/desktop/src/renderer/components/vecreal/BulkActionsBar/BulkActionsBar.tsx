import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { Button } from "../Button";
import { buttonBase, mergeStyle, overlaySurface, r, s, textBase, v } from "../componentInternals";

export interface BulkActionsBarProps {
	selectedCount: number;
	actions: Array<{ id: string; label: string; disabled?: boolean }>;
}

export function BulkActionsBar({ selectedCount, actions }: BulkActionsBarProps) {
	const hasSelection = selectedCount > 0;
	return (
		<div data-vecreal-component="BulkActionsBar" data-headless-layer="@radix-ui/react-dropdown-menu" style={{ ...textBase, display: "flex", alignItems: "center", justifyContent: "space-between", gap: s.px6, padding: s.px6, border: `${v.borderWidth} solid ${v.border}`, borderRadius: r.md, background: v.bgSoft }}>
			<span style={{ color: hasSelection ? v.text : v.muted, fontSize: s.px7 }}>{selectedCount} selected</span>
			<DropdownMenu.Root>
				<DropdownMenu.Trigger asChild disabled={!hasSelection}>
					<Button variant="secondary" size="sm" disabled={!hasSelection}>Actions</Button>
				</DropdownMenu.Trigger>
				<DropdownMenu.Portal forceMount>
					<DropdownMenu.Content style={overlaySurface}>
						{actions.map((action) => (
							<DropdownMenu.Item key={action.id} disabled={action.disabled} style={mergeStyle(buttonBase, { justifyContent: "flex-start", background: "transparent", borderColor: "transparent" })}>
								{action.label}
							</DropdownMenu.Item>
						))}
					</DropdownMenu.Content>
				</DropdownMenu.Portal>
			</DropdownMenu.Root>
		</div>
	);
}
