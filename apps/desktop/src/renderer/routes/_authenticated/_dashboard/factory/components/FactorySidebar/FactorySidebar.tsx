import { Badge } from "@superset/ui/badge";
import { cn } from "@superset/ui/utils";
import { Link, useRouterState } from "@tanstack/react-router";
import {
	BarChart3,
	BookOpen,
	CheckCircle2,
	ClipboardList,
	Compass,
	FileText,
	GitBranch,
	Layers,
	Lightbulb,
	ListTree,
	MessageSquare,
	Target,
	Users,
} from "lucide-react";
import type { ReactNode } from "react";
import { useDialogueAttentionCounts } from "../../hooks/useDialogueAttentionCounts";
import { ProjectSwitcher } from "./components/ProjectSwitcher";

interface FactoryNavItem {
	to: string;
	label: string;
	icon: ReactNode;
	surface: string;
	exact?: boolean;
}

const NAV_ITEMS: FactoryNavItem[] = [
	{
		to: "/factory",
		label: "Home",
		icon: <Compass className="size-4" />,
		surface: "home",
		exact: true,
	},
	{
		to: "/factory/mission",
		label: "Mission",
		icon: <Target className="size-4" />,
		surface: "mission",
	},
	{
		to: "/factory/foundations",
		label: "Foundations",
		icon: <Layers className="size-4" />,
		surface: "foundations",
	},
	{
		to: "/factory/work-orders",
		label: "Work Orders",
		icon: <ClipboardList className="size-4" />,
		surface: "work-orders",
	},
	{
		to: "/factory/decisions",
		label: "Decisions",
		icon: <ListTree className="size-4" />,
		surface: "decisions",
	},
	{
		to: "/factory/lessons",
		label: "Lessons",
		icon: <Lightbulb className="size-4" />,
		surface: "lessons",
	},
	{
		to: "/factory/projects",
		label: "Projects",
		icon: <FileText className="size-4" />,
		surface: "projects",
	},
	{
		to: "/factory/roles",
		label: "Roles",
		icon: <Users className="size-4" />,
		surface: "roles",
	},
	{
		to: "/factory/build-vs-compose",
		label: "Build vs Compose",
		icon: <GitBranch className="size-4" />,
		surface: "build-vs-compose",
	},
	{
		to: "/factory/strategy-pulse",
		label: "Strategy Pulse",
		icon: <BarChart3 className="size-4" />,
		surface: "strategy-pulse",
	},
	{
		to: "/factory/approvals",
		label: "Approvals",
		icon: <CheckCircle2 className="size-4" />,
		surface: "approvals",
	},
	{
		to: "/factory/dialogues",
		label: "Dialogues",
		icon: <MessageSquare className="size-4" />,
		surface: "dialogues",
	},
];

export function FactorySidebar() {
	const pathname = useRouterState({ select: (s) => s.location.pathname });
	const { countForSurface } = useDialogueAttentionCounts();

	return (
		<div className="flex h-full w-full flex-col overflow-hidden border-r bg-background">
			<div className="flex items-center gap-2 px-4 py-4 border-b">
				<div className="flex size-7 items-center justify-center rounded-md bg-primary/10">
					<BookOpen className="size-4 text-primary" />
				</div>
				<div className="min-w-0">
					<div className="text-sm font-semibold">Software Factory</div>
					<div className="text-xs text-muted-foreground truncate">
						Vertical AI cockpit
					</div>
				</div>
			</div>
			<div className="border-b px-4 py-3">
				<ProjectSwitcher />
			</div>
			<nav className="flex-1 overflow-y-auto px-2 py-2">
				<ul className="flex flex-col gap-0.5">
					{NAV_ITEMS.map((item) => {
						const isActive = item.exact
							? pathname === item.to || pathname === `${item.to}/`
							: pathname === item.to ||
								pathname === `${item.to}/` ||
								pathname.startsWith(`${item.to}/`);
						return (
							<li key={item.to}>
								<Link
									to={item.to}
									className={cn(
										"flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-sm transition-colors",
										isActive
											? "bg-accent text-accent-foreground"
											: "text-muted-foreground hover:bg-accent/50 hover:text-foreground",
									)}
									>
									{item.icon}
									<span className="truncate">{item.label}</span>
									{countForSurface(item.surface) > 0 && (
										<Badge
											variant="secondary"
											className="ml-auto min-w-5 justify-center px-1.5 py-0 text-[10px]"
										>
											{countForSurface(item.surface)}
										</Badge>
									)}
								</Link>
							</li>
						);
					})}
				</ul>
			</nav>
			<div className="border-t px-4 py-3 text-xs text-muted-foreground">
				<div>v0 · local-only</div>
				<div className="mt-0.5 truncate">FACTORY_LOCAL_ONLY=true</div>
			</div>
		</div>
	);
}
