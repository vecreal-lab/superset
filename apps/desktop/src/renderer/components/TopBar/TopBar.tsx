import { Moon, Search, Settings, Sun } from "lucide-react";
import type { FactoryThemeMode } from "lib/stores/workspace";
import { ProjectSwitcher, type ProjectSwitcherNode } from "../factory-primitives/ProjectSwitcher";
import { PrimitiveIcon } from "../factory-primitives/common";

export interface TopBarProps {
	currentProjectId?: string;
	projectTree?: ProjectSwitcherNode[];
	themeMode?: FactoryThemeMode;
	onThemeToggle?: () => void;
	onProjectSwitch?: (projectId: string) => void;
	operatorInitials?: string;
}

const defaultProjectTree: ProjectSwitcherNode[] = [
	{ id: "software-factory", name: "Software Factory", kind: "parent project" },
];

export function TopBar({
	currentProjectId = "software-factory",
	projectTree = defaultProjectTree,
	themeMode = "dark",
	onThemeToggle,
	onProjectSwitch,
	operatorInitials = "YL",
}: TopBarProps) {
	const shortcutLabel =
		typeof navigator !== "undefined" && /Mac|iPhone|iPad|iPod/i.test(navigator.platform)
			? "Cmd K"
			: "Ctrl K";

	return (
		<header
			aria-label="Cockpit top bar"
			style={{
				display: "grid",
				gridTemplateColumns: "minmax(var(--sp-14), 1fr) minmax(var(--sp-14), calc(var(--sp-14) * 5)) auto auto",
				alignItems: "center",
				gap: "var(--sp-4)",
				borderBottom: "var(--factory-border-width) solid var(--border)",
				background: "var(--bg-app)",
				padding: "0 var(--sp-6)",
			}}
		>
			<ProjectSwitcher
				currentProjectId={currentProjectId}
				projectTree={projectTree}
				onSwitch={onProjectSwitch}
			/>
			<label
				className="factory-card"
				style={{
					display: "grid",
					gridTemplateColumns: "auto 1fr auto",
					alignItems: "center",
					gap: "var(--sp-4)",
					height: "var(--factory-control-height)",
					padding: "0 var(--sp-4)",
				}}
			>
				<PrimitiveIcon icon={Search} />
				<input
					type="search"
					placeholder="Search..."
					aria-label="Search"
					style={{
						border: 0,
						outline: 0,
						background: "transparent",
						color: "var(--text-primary)",
						minWidth: 0,
					}}
				/>
				<span style={{ fontFamily: "var(--font-mono)", color: "var(--text-tertiary)" }}>
					{shortcutLabel}
				</span>
			</label>
			<button
				type="button"
				className="factory-icon-button"
				aria-label="Toggle light and dark mode"
				title="Toggle theme"
				onClick={onThemeToggle}
			>
				<PrimitiveIcon icon={themeMode === "light" ? Moon : Sun} />
			</button>
			<button
				type="button"
				className="factory-profile-chip"
				aria-label="Operator profile"
				title="Open profile"
			>
				<PrimitiveIcon icon={Settings} />
				<span>{operatorInitials}</span>
			</button>
		</header>
	);
}
