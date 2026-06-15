import { useMemo } from "react";
import { hotkeysCoreFeature, selectionFeature, syncDataLoaderFeature } from "@headless-tree/core";
import { useTree } from "@headless-tree/react";
import { StatusBadge } from "../StatusBadge";
import { buttonBase, s, textBase, v } from "../componentInternals";

export interface ReferenceTreeNode {
	id: string;
	label: string;
	state?: "satisfied" | "pending" | "broken";
	children?: ReferenceTreeNode[];
}

export interface ReferenceTreeProps {
	nodes: ReferenceTreeNode[];
	label?: string;
}

function flattenNodes(nodes: ReferenceTreeNode[], map = new Map<string, ReferenceTreeNode>()) {
	for (const node of nodes) {
		map.set(node.id, node);
		if (node.children) flattenNodes(node.children, map);
	}
	return map;
}

export function ReferenceTree({ nodes, label = "Reference tree" }: ReferenceTreeProps) {
	const data = useMemo(() => {
		const map = flattenNodes(nodes);
		map.set("root", { id: "root", label, children: nodes });
		return map;
	}, [label, nodes]);
	const tree = useTree<string>({
		initialState: { expandedItems: ["root", ...nodes.map((node) => node.id)] },
		rootItemId: "root",
		getItemName: (item) => item.getItemData(),
		isItemFolder: (item) => Boolean(data.get(item.getId())?.children?.length),
		dataLoader: {
			getItem: (itemId) => data.get(itemId)?.label ?? itemId,
			getChildren: (itemId) => data.get(itemId)?.children?.map((node) => node.id) ?? [],
		},
		indent: 16,
		features: [syncDataLoaderFeature, selectionFeature, hotkeysCoreFeature],
	});

	return (
		<div data-vecreal-component="ReferenceTree" data-headless-layer="@headless-tree/react">
			<div {...tree.getContainerProps()} aria-label={label} style={{ ...textBase, display: "grid", gap: s.px3 }}>
				{tree.getItems().filter((item) => item.getId() !== "root").map((item) => {
					const node = data.get(item.getId());
					const state = node?.state ?? "pending";
					return (
						<button
							{...item.getProps()}
							key={item.getId()}
							type="button"
							style={{
								...buttonBase,
								justifyContent: "flex-start",
								paddingInlineStart: `calc(var(--sp-4) + (${item.getItemMeta().level} * var(--sp-8)))`,
								background: item.isSelected() ? v.bgHover : "transparent",
								borderColor: item.isFocused() ? v.clayLight : "transparent",
								color: state === "broken" ? v.error : v.body,
								minHeight: s.px10,
								fontSize: s.px6,
							}}
						>
							<span aria-hidden="true">{item.isFolder() ? (item.isExpanded() ? "-" : "+") : "."}</span>
							<span>{item.getItemName()}</span>
							<StatusBadge variant={state === "satisfied" ? "success" : state === "broken" ? "error" : "neutral"} size="sm">
								{state}
							</StatusBadge>
						</button>
					);
				})}
			</div>
		</div>
	);
}
