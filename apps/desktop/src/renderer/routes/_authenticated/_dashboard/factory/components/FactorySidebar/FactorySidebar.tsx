import { cn } from "@superset/ui/utils";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import { FactoryCliStatusBadges } from "./components/FactoryCliStatusBadges";

interface FactoryNavItem {
	to: string;
	label: string;
	exact?: boolean;
	activePrefix?: string;
}

interface FactoryNavGroup {
	label: string;
	items: FactoryNavItem[];
}

const NAV_GROUPS: FactoryNavGroup[] = [
	{
		label: "Active Work",
		items: [
			{ to: "/factory", label: "Mission Canvas", exact: true },
			{
				to: "/factory/approval-queue",
				label: "Approval Queue",
				activePrefix: "/factory/approval-queue",
			},
		],
	},
	{
		label: "Work",
		items: [
			{ to: "/factory/work-orders", label: "Work Orders" },
			{ to: "/factory/decks", label: "Decks" },
		],
	},
	{
		label: "Knowledge",
		items: [
			{ to: "/factory/foundations", label: "Foundations" },
			{ to: "/factory/design", label: "Design" },
			{ to: "/factory/uiux", label: "UIUX" },
		],
	},
	{
		label: "Review",
		items: [
			{ to: "/factory/audit-findings", label: "Audit Findings" },
			{ to: "/factory/synthesis-receipts", label: "Synthesis Receipts" },
			{ to: "/factory/lessons", label: "Lessons" },
		],
	},
	{
		label: "System",
		items: [{ to: "/settings", label: "Settings" }],
	},
];

function isActivePath(pathname: string, item: FactoryNavItem) {
	const activeRoot = item.activePrefix ?? item.to;
	if (item.exact) return pathname === item.to || pathname === `${item.to}/`;
	return (
		pathname === activeRoot ||
		pathname === `${activeRoot}/` ||
		pathname.startsWith(`${activeRoot}/`)
	);
}

export function FactorySidebar() {
	const pathname = useRouterState({ select: (s) => s.location.pathname });
	const navigate = useNavigate();

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
								return (
									<li key={item.to}>
										<a
											href={`#${item.to}`}
											aria-current={active ? "page" : undefined}
											className={cn(
												"grid min-h-7 grid-cols-[minmax(0,1fr)] items-center gap-2 rounded-md border-l-[3px] px-2 py-1 text-[12px] leading-none no-underline transition-colors",
												active
													? "border-l-[var(--accent)] text-[var(--text-dark-primary)]"
													: "border-l-transparent hover:text-[var(--text-dark-primary)]",
											)}
											onClick={(event) => {
												event.preventDefault();
												void navigate({ to: item.to as "/factory" });
											}}
										>
											<span className="truncate">{item.label}</span>
										</a>
									</li>
								);
							})}
						</ul>
					</div>
				))}
			</nav>
			<div className="border-t px-4 py-3 text-xs" style={{ color: "var(--text-dark-muted)" }}>
				<div>v0.5 visual-only</div>
				<div className="mt-0.5 truncate">FACTORY_LOCAL_ONLY=true</div>
				<FactoryCliStatusBadges />
			</div>
		</aside>
	);
}
