import type { ButtonHTMLAttributes, CSSProperties, ReactNode } from "react";
import type { LucideIcon } from "lucide-react";

export function cx(...classes: Array<string | false | null | undefined>) {
	return classes.filter(Boolean).join(" ");
}

export function formatDateTime(value?: string): string {
	if (!value) return "unknown";
	const date = new Date(value);
	if (Number.isNaN(date.getTime())) return value;
	return date.toLocaleString();
}

export function initialsFor(value: string): string {
	const parts = value.trim().split(/\s+/).filter(Boolean);
	if (parts.length === 0) return "?";
	if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
	return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
}

export function primitiveIconProps(label?: string) {
	return {
		size: 14,
		strokeWidth: 1.4,
		"aria-hidden": label ? undefined : true,
		"aria-label": label,
		role: label ? "img" : undefined,
		focusable: false,
	} as const;
}

export function PrimitiveIcon({
	icon: Icon,
	label,
	style,
}: {
	icon: LucideIcon;
	label?: string;
	style?: CSSProperties;
}) {
	return <Icon {...primitiveIconProps(label)} style={style} />;
}

export type PrimitiveButtonVariant = "primary" | "secondary" | "ghost" | "clay";

export function PrimitiveButton({
	variant = "secondary",
	icon: Icon,
	children,
	className,
	...buttonProps
}: ButtonHTMLAttributes<HTMLButtonElement> & {
	variant?: PrimitiveButtonVariant;
	icon?: LucideIcon;
	children: ReactNode;
}) {
	return (
		<button
			{...buttonProps}
			className={cx(
				"factory-button",
				`factory-button--${variant}`,
				className,
			)}
			type={buttonProps.type ?? "button"}
		>
			{Icon && <PrimitiveIcon icon={Icon} />}
			<span>{children}</span>
		</button>
	);
}

export const stackStyle: CSSProperties = {
	display: "flex",
	flexDirection: "column",
	gap: "var(--sp-5)",
};

export const inlineStyle: CSSProperties = {
	display: "inline-flex",
	alignItems: "center",
	gap: "var(--sp-4)",
};

export const rowStyle: CSSProperties = {
	display: "flex",
	alignItems: "center",
	gap: "var(--sp-5)",
};

export const mutedTextStyle: CSSProperties = {
	color: "var(--text-tertiary)",
};

export const monoTextStyle: CSSProperties = {
	fontFamily: "var(--font-mono)",
};

export const cardPaddingStyle: CSSProperties = {
	padding: "var(--sp-6)",
};
