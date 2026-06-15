import type { ReactNode } from "react";
import { useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { Button } from "../Button";
import { Chip } from "../Chip";
import { mergeStyle, overlaySurface, s, v } from "../componentInternals";

export interface FilterSortDrawerProps {
	triggerLabel?: string;
	appliedFilters?: string[];
	children?: ReactNode;
}

export function FilterSortDrawer({ triggerLabel = "Filters", appliedFilters = [], children }: FilterSortDrawerProps) {
	const [open, setOpen] = useState(false);

	return (
		<Dialog.Root open={open} onOpenChange={setOpen}>
			<div data-vecreal-component="FilterSortDrawer" data-headless-layer="@radix-ui/react-dialog">
				<Dialog.Trigger asChild>
					<Button variant="secondary" size="sm">{triggerLabel}</Button>
				</Dialog.Trigger>
				<div style={{ display: "flex", flexWrap: "wrap", gap: s.px3, marginBlockStart: s.px4 }}>
					{appliedFilters.map((filter) => <Chip key={filter} tone="clay" size="sm">{filter}</Chip>)}
				</div>
				<Dialog.Portal>
					<Dialog.Overlay style={{ position: "fixed", inset: 0, background: "var(--overlay-scrim)" }} />
					<Dialog.Content style={mergeStyle(overlaySurface, { position: "fixed", insetBlock: s.px6, insetInlineEnd: s.px6, width: "min(calc(var(--sp-14) * 5), calc(100vw - var(--sp-10)))" })}>
						<div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: s.px4 }}>
							<Dialog.Title style={{ margin: 0, fontSize: s.px9 }}>Filter and sort</Dialog.Title>
							<Dialog.Close asChild>
								<Button variant="ghost" size="sm">Close</Button>
							</Dialog.Close>
						</div>
						{children ?? <p style={{ color: v.body }}>Choose filters for this list.</p>}
						<Button variant="ghost" size="sm">Reset filters</Button>
					</Dialog.Content>
				</Dialog.Portal>
			</div>
		</Dialog.Root>
	);
}
