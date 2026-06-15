export type DesignSystemFileKind =
	| "component_spec"
	| "brand_foundation"
	| "reference_html"
	| "token_json"
	| "component_source"
	| "component_preview"
	| "component_test"
	| "other";

export interface DesignSystemFileSummary {
	id: string;
	label: string;
	path: string;
	kind: DesignSystemFileKind;
	group: "brand_atoms" | "references" | "components";
	componentName?: string;
	modifiedAt?: string;
}

export interface DesignSystemFileRead {
	path: string;
	label: string;
	kind: DesignSystemFileKind;
	content: string;
	readonly: true;
	modifiedAt?: string;
}

export type ComponentLibraryStatus =
	| "shipped"
	| "in_design"
	| "handoff_pending"
	| "needs_revision";

export interface DesignSystemComponentSummary {
	name: string;
	status: ComponentLibraryStatus;
	folderPath: string;
	sourcePath?: string;
	previewPath?: string;
	testPath?: string;
	specsCited: string[];
}

export interface ComponentAuthoringHandoffFinding {
	findingId: string;
	componentName: string;
	currentState: "missing" | "partial" | "drift";
	specsCited: string[];
	proposedDesignIntent: string;
	blockerForFeatureWo: boolean;
	surfacedAt: string;
	surfacedByWo?: string;
	sourceReceiptPath: string;
	projectId?: string;
}

export interface DesignSystemOverview {
	files: DesignSystemFileSummary[];
	components: DesignSystemComponentSummary[];
	handoffs: ComponentAuthoringHandoffFinding[];
}

export interface SpawnComponentWoRequest {
	componentName: string;
	intent: string;
	specPaths: string[];
	sourceFindingId?: string;
}

export interface SpawnComponentWoResponse {
	requiresOperatorConfirmation: true;
	pipelineVariant: "component_authoring";
	plainEnglishSummary: string;
	nextAction: string;
	request: SpawnComponentWoRequest;
}
