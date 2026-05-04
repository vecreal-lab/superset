import { cn } from "@superset/ui/utils";
import { useRouterState } from "@tanstack/react-router";
import { DialogueAttentionBadge } from "renderer/components/factory-primitives/DialogueAttentionBadge";
import { useDialogueAttentionCounts } from "../../hooks/useDialogueAttentionCounts";
import { FactoryCliStatusBadges } from "./components/FactoryCliStatusBadges";

interface FactoryNavItem {
	to: string;
	label: string;
	surface: string;
	exact?: boolean;
}

interface FactoryNavGroup {
	label: string;
	items: FactoryNavItem[];
}

const NAV_GROUPS: FactoryNavGroup[] = [
	{
		label: "Home / Overview",
		items: [{ to: "/factory", label: "Home", surface: "home", exact: true }],
	},
	{
		label: "Active Work",
		items: [
			{ to: "/factory/work-orders", label: "Work Orders", surface: "work-orders" },
			{ to: "/factory/approvals", label: "Approvals", surface: "approvals" },
			{ to: "/factory/dialogues", label: "Dialogues", surface: "dialogues" },
			{ to: "/factory/intake", label: "Intake", surface: "intake" },
		],
	},
	{
		label: "Design + UIUX",
		items: [
			{ to: "/factory/design", label: "Design", surface: "design" },
			{ to: "/factory/uiux", label: "UIUX Area", surface: "uiux" },
		],
	},
	{
		label: "Read / Reference",
		items: [
			{ to: "/factory/foundations", label: "Foundations", surface: "foundations" },
			{ to: "/factory/decisions", label: "Decisions", surface: "decisions" },
			{ to: "/factory/lessons", label: "Lessons", surface: "lessons" },
			{ to: "/factory/roles", label: "Roles", surface: "roles" },
			{
				to: "/factory/strategy-pulse",
				label: "Strategy Pulse",
				surface: "strategy-pulse",
			},
			{
				to: "/factory/build-vs-compose",
				label: "Build vs Compose",
				surface: "build-vs-compose",
			},
		],
	},
	{
		label: "Audit / Review",
		items: [
			{ to: "/factory/audit-findings", label: "Audit Findings", surface: "audit" },
			{
				to: "/factory/synthesis-receipts",
				label: "SYNTHESIS Receipts",
				surface: "synthesis",
			},
		],
	},
	{
		label: "System",
		items: [{ to: "/factory/settings", label: "Settings", surface: "settings" }],
	},
];

function isActivePath(pathname: string, item: FactoryNavItem) {
	if (item.exact) return pathname === item.to || pathname === `${item.to}/`;
	return (
		pathname === item.to ||
		pathname === `${item.to}/` ||
		pathname.startsWith(`${item.to}/`)
	);
}

export function FactorySidebar() {
	const pathname = useRouterState({ select: (s) => s.location.pathname });
	const { mineCountForSurface, hasMineAttentionForSurface } =
		useDialogueAttentionCounts();

	return (
		<aside
			className="flex h-full w-full flex-col overflow-hidden border-r"
			style={{
				background: "var(--bg-sidebar-dark)",
				color: "var(--text-dark-muted)",
			}}
			aria-label="Factory navigation"
		>
			<nav className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
				{NAV_GROUPS.map((group) => (
					<div key={group.label} className="mb-3">
						<div
							className="mb-1 px-2 font-mono text-[9px] font-semibold uppercase leading-none"
							style={{ color: "var(--text-dark-tertiary)" }}
						>
							{group.label}
						</div>
						<ul className="flex flex-col gap-0.5">
							{group.items.map((item) => {
								const active = isActivePath(pathname, item);
								const attentionCount = mineCountForSurface(item.surface);
								return (
									<li key={item.to}>
										<a
											href={item.to}
											aria-current={active ? "page" : undefined}
											className={cn(
												"grid min-h-7 grid-cols-[minmax(0,1fr)_auto] items-center gap-2 rounded-md border-l-[3px] px-2 py-1 text-[12px] leading-none no-underline transition-colors",
												active
													? "border-l-[var(--accent)] text-[var(--text-dark-primary)]"
													: "border-l-transparent hover:text-[var(--text-dark-primary)]",
											)}
										>
											<span className="truncate">{item.label}</span>
											<DialogueAttentionBadge
												count={attentionCount}
												hasMineAttention={hasMineAttentionForSurface(item.surface)}
											/>
										</a>
									</li>
								);
							})}
						</ul>
					</div>
				))}
			</nav>
			<div className="border-t px-4 py-3 text-xs" style={{ color: "var(--text-dark-muted)" }}>
				<div>v0 local-only</div>
				<div className="mt-0.5 truncate">FACTORY_LOCAL_ONLY=true</div>
				<FactoryCliStatusBadges />
			</div>
		</aside>
	);
}
