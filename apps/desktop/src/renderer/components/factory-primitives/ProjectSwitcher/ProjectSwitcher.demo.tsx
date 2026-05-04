import { ProjectSwitcher } from "./ProjectSwitcher";

export function ProjectSwitcherDemo() {
	return (
		<ProjectSwitcher
			currentProjectId="software-factory"
			projectTree={[
				{ id: "software-factory", name: "Software Factory", kind: "parent project" },
				{
					id: "vecreal",
					name: "Vecreal",
					kind: "top-level project",
					children: [
						{ id: "construction-pm", name: "Construction PM", kind: "sub-project" },
						{ id: "corporate-intelligence", name: "Corporate Intelligence", kind: "sub-project" },
					],
				},
			]}
		/>
	);
}
