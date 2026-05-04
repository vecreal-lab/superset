import { AuthorChip } from "./AuthorChip";

const operator = {
	user: "yuriy",
	isAgent: false,
	displayName: "Yuriy",
};

const agent = {
	user: "agent",
	role: "PROJECT_COORDINATOR",
	isAgent: true,
	displayName: "Project Coordinator",
};

export function AuthorChipDemo() {
	return (
		<div style={{ display: "flex", gap: "var(--sp-6)", alignItems: "center" }}>
			<AuthorChip attribution={operator} />
			<AuthorChip attribution={agent} size="md" variant="card-header" />
		</div>
	);
}
