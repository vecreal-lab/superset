import type {
	ArtifactReference,
	AuthorAttribution,
	CoordinatorSurfaceContext,
	RightRailState,
} from "lib/types/factory-operator-console";
import type { CoordinatorToolCall } from "./tools";

export interface CoordinatorDialogueTurn {
	turnId: string;
	role: "operator" | "agent" | "system";
	author: AuthorAttribution;
	agentRole?: string;
	text: string;
	references: ArtifactReference[];
	toolCalls?: CoordinatorToolCall[];
	createdAt: string;
}

export type CoordinatorStreamEvent =
	| {
			type: "turn_started";
			turnId: string;
			context: CoordinatorSurfaceContext;
	  }
	| {
			type: "chunk";
			turnId: string;
			text: string;
	  }
	| {
			type: "tool_call_proposed";
			turnId: string;
			toolCall: CoordinatorToolCall;
	  }
	| {
			type: "right_rail_updated";
			projectId: string;
			rightRail: RightRailState;
	  }
	| {
			type: "message_persisted";
			turnId: string;
			messagePath: string;
			message: CoordinatorDialogueTurn;
	  }
	| {
			type: "complete";
			turnId: string;
			context: CoordinatorSurfaceContext;
	  }
	| {
			type: "error";
			turnId: string;
			plainEnglishSummary: string;
			detailsRef?: ArtifactReference;
	  };

export interface CoordinatorProviderRequest {
	projectId: string;
	dialogueId: string;
	turnId: string;
	message: string;
	prompt: string;
	signal?: AbortSignal;
	onChunk?: (chunk: string) => void;
}

export interface CoordinatorProviderResult {
	text: string;
	provider: "cli" | "anthropic-sdk" | "mock";
	sessionId?: string;
	exitCode?: number;
}

export interface CoordinatorProvider {
	id: CoordinatorProviderResult["provider"];
	invoke(input: CoordinatorProviderRequest): Promise<CoordinatorProviderResult>;
}

export type CoordinatorStreamEmitter = (event: CoordinatorStreamEvent) => void;
