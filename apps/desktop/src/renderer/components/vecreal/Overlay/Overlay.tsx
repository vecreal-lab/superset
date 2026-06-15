import type { CSSProperties, ReactNode } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import * as Popover from "@radix-ui/react-popover";
import * as Tooltip from "@radix-ui/react-tooltip";
import { X } from "lucide-react";
import { IconButton } from "../IconButton";
import { mergeStyle, r, s, textBase, v } from "../componentInternals";

export interface OverlayProps {
	kind?: "modal" | "drawer" | "popover" | "tooltip";
	trigger: ReactNode;
	title: string;
	children: ReactNode;
	description?: string;
	open?: boolean;
	defaultOpen?: boolean;
	onOpenChange?: (open: boolean) => void;
	side?: "top" | "right" | "bottom" | "left";
}

const overlaySurface: CSSProperties = {
	...textBase,
	display: "grid",
	gap: s.px6,
	padding: s.px9,
	border: `${v.borderWidth} solid ${v.border}`,
	borderRadius: r.lg,
	background: v.bg,
	boxShadow: v.modalShadow,
	color: v.text,
	maxWidth: "min(100%, calc(var(--sp-14) * 6))",
};

export function Overlay({
	kind = "modal",
	trigger,
	title,
	description,
	children,
	open,
	defaultOpen,
	onOpenChange,
	side = "right",
}: OverlayProps) {
	if (kind === "tooltip") {
		return (
			<Tooltip.Provider delayDuration={0}>
				<Tooltip.Root open={open} defaultOpen={defaultOpen} onOpenChange={onOpenChange}>
					<Tooltip.Trigger asChild>{trigger}</Tooltip.Trigger>
					<Tooltip.Portal>
						<Tooltip.Content side={side} style={mergeStyle(overlaySurface, { maxWidth: "calc(var(--sp-14) * 3)", padding: s.px6 })}>
							<strong>{title}</strong>
							{children}
						</Tooltip.Content>
					</Tooltip.Portal>
				</Tooltip.Root>
			</Tooltip.Provider>
		);
	}

	if (kind === "popover") {
		return (
			<Popover.Root open={open} defaultOpen={defaultOpen} onOpenChange={onOpenChange}>
				<Popover.Trigger asChild>{trigger}</Popover.Trigger>
				<Popover.Portal>
					<Popover.Content side={side} style={overlaySurface}>
						<h2 style={{ margin: 0, fontSize: s.px9 }}>{title}</h2>
						{description ? <p style={{ margin: 0, color: v.body }}>{description}</p> : null}
						{children}
					</Popover.Content>
				</Popover.Portal>
			</Popover.Root>
		);
	}

	return (
		<Dialog.Root open={open} defaultOpen={defaultOpen} onOpenChange={onOpenChange}>
			<Dialog.Trigger asChild>{trigger}</Dialog.Trigger>
			<Dialog.Portal>
				<Dialog.Overlay style={{ position: "fixed", inset: 0, background: "var(--overlay-scrim)" }} />
				<Dialog.Content
					data-overlay-kind={kind}
					style={mergeStyle(overlaySurface, kind === "drawer" ? {
						position: "fixed",
						insetBlock: s.px6,
						insetInlineEnd: s.px6,
						width: "min(calc(var(--sp-14) * 5), calc(100vw - var(--sp-10)))",
					} : {
						position: "fixed",
						insetBlockStart: "50%",
						insetInlineStart: "50%",
						transform: "translate(-50%, -50%)",
					})}
				>
					<div style={{ display: "flex", alignItems: "start", justifyContent: "space-between", gap: s.px6 }}>
						<div style={{ display: "grid", gap: s.px4 }}>
							<Dialog.Title style={{ margin: 0, fontSize: s.px9 }}>{title}</Dialog.Title>
							{description ? <Dialog.Description style={{ margin: 0, color: v.body }}>{description}</Dialog.Description> : null}
						</div>
						<Dialog.Close asChild>
							<IconButton label={`Close ${title}`} variant="chrome" size="sm">
								<X size={16} aria-hidden="true" />
							</IconButton>
						</Dialog.Close>
					</div>
					{children}
				</Dialog.Content>
			</Dialog.Portal>
		</Dialog.Root>
	);
}
