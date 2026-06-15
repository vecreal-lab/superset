import { Chip } from "../Chip";
import { v } from "../componentInternals";

export interface AuthorChipProps {
	name: string;
	kind?: "human" | "agent" | "project" | "system";
	role?: string;
	size?: "sm" | "md";
	showRole?: boolean;
	maxWidth?: number;
	className?: string;
}

export function AuthorChip({
	name,
	kind = "human",
	role,
	size = "sm",
	showRole,
	maxWidth,
	className,
}: AuthorChipProps) {
	const accessibleLabel =
		kind === "agent"
			? `Agent ${name}`
			: kind === "project"
				? `Project ${name}`
				: kind === "system"
					? `System ${name}`
					: name;
	const label = showRole && role ? `${name} - ${role}` : name;
	return (
		<Chip
			tone="neutral"
			size={size}
			avatarInitials={initials(name)}
			className={className}
			style={{ maxWidth, fontFamily: kind === "agent" ? v.mono : v.font }}
		>
			<span aria-label={accessibleLabel}>{label}</span>
		</Chip>
	);
}

function initials(name: string): string {
	const parts = name.trim().split(/\s+/).filter(Boolean);
	if (parts.length === 0) return "?";
	if (parts.length === 1) return parts[0]?.slice(0, 2).toUpperCase() ?? "?";
	return `${parts[0]?.[0] ?? ""}${parts[parts.length - 1]?.[0] ?? ""}`.toUpperCase();
}
