import { ChevronDown } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { WorkspaceContext } from "lib/types/factory-operator-console";
import { PrimitiveIcon, mutedTextStyle, stackStyle } from "../common";

export interface ProjectSwitcherNode {
	id: string;
	name: string;
	kind?: string;
	children?: ProjectSwitcherNode[];
}

export interface ProjectSwitcherProps {
	currentProjectId: string;
	projectTree: ProjectSwitcherNode[];
	workspace?: WorkspaceContext;
	onSwitch?: (projectId: string) => void;
}

function findProject(nodes: ProjectSwitcherNode[], id: string): ProjectSwitcherNode | null {
	for (const node of nodes) {
		if (node.id === id) return node;
		const child = findProject(node.children || [], id);
		if (child) return child;
	}
	return null;
}

function ProjectNodeButton({
	node,
	depth,
	onSwitch,
}: {
	node: ProjectSwitcherNode;
	depth: number;
	onSwitch?: (projectId: string) => void;
}) {
	return (
		<div style={stackStyle}>
			<button
				type="button"
				className="factory-button factory-button--ghost"
				onClick={() => onSwitch?.(node.id)}
				style={{
					justifyContent: "flex-start",
					paddingLeft: `calc(var(--sp-5) + (${depth} * var(--sp-6)))`,
				}}
			>
				<span>{node.name}</span>
				{node.kind && <span style={mutedTextStyle}>{node.kind}</span>}
			</button>
			{node.children?.map((child) => (
				<ProjectNodeButton
					key={child.id}
					node={child}
					depth={depth + 1}
					onSwitch={onSwitch}
				/>
			))}
		</div>
	);
}

export function ProjectSwitcher({
	currentProjectId,
	projectTree,
	workspace,
	onSwitch,
}: ProjectSwitcherProps) {
	const [open, setOpen] = useState(false);
	const rootRef = useRef<HTMLDivElement | null>(null);
	const current = findProject(projectTree, currentProjectId) || projectTree[0];

	useEffect(() => {
		if (!open) return undefined;
		const onPointerDown = (event: PointerEvent) => {
			if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
		};
		const onKeyDown = (event: KeyboardEvent) => {
			if (event.key === "Escape") setOpen(false);
		};
		window.addEventListener("pointerdown", onPointerDown);
		window.addEventListener("keydown", onKeyDown);
		return () => {
			window.removeEventListener("pointerdown", onPointerDown);
			window.removeEventListener("keydown", onKeyDown);
		};
	}, [open]);

	return (
		<div ref={rootRef} style={{ position: "relative" }}>
			<button
				type="button"
				className="factory-project-switcher"
				aria-haspopup="tree"
				aria-expanded={open}
				onClick={() => setOpen((value) => !value)}
				data-workspace-id={workspace?.workspaceId}
			>
				<span>{current?.name || "Software Factory"}</span>
				<PrimitiveIcon
					icon={ChevronDown}
					style={{
						transform: open ? "rotate(180deg)" : undefined,
						transition: "transform var(--motion-fast) var(--ease-out)",
					}}
				/>
			</button>
			{open && (
				<div
					className="factory-card"
					role="tree"
					aria-label="Project hierarchy"
					style={{
						position: "absolute",
						top: "calc(100% + var(--sp-3))",
						left: 0,
						zIndex: 20,
						width: "calc(var(--sp-14) * 4)",
						padding: "var(--sp-4)",
					}}
				>
					{projectTree.map((node) => (
						<ProjectNodeButton
							key={node.id}
							node={node}
							depth={0}
							onSwitch={(projectId) => {
								onSwitch?.(projectId);
								setOpen(false);
							}}
						/>
					))}
				</div>
			)}
		</div>
	);
}
