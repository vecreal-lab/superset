import type { ArtifactReference } from "lib/types/factory-operator-console";
import type { CoordinatorToolResult } from "./tools";

const WINDOWS_PATH_PATTERN = /[A-Z]:\\[^\s`"'<>]+/g;
const POSIX_FACTORY_PATH_PATTERN =
	/(?:^|\s)(?:\/[^\s`"'<>]+\/)?(?:vendor|projects|runs|work-orders|tools)\/[^\s`"'<>]+/g;
const STACK_LINE_PATTERN = /^\s*at\s+.+$/gm;
const PROVIDER_LOG_PATTERN = /\b(?:ANTHROPIC|OPENAI|CLAUDE|CODEX)_[A-Z0-9_]*\b/g;

export function sanitizeForOperator(text: string): string {
	return text
		.replace(WINDOWS_PATH_PATTERN, "[technical path hidden in right rail]")
		.replace(POSIX_FACTORY_PATH_PATTERN, " [technical path hidden in right rail]")
		.replace(STACK_LINE_PATTERN, "[stack trace hidden in right rail]")
		.replace(PROVIDER_LOG_PATTERN, "[provider setting hidden]")
		.replace(/\n{3,}/g, "\n\n")
		.trim();
}

export function technicalDetailsReference(input: {
	projectId: string;
	label: string;
	summary: string;
	path?: string;
}): ArtifactReference {
	return {
		referenceId: `technical-details-${Date.now()}`,
		kind: "other",
		label: input.label,
		projectId: input.projectId,
		path: input.path,
		summary: input.summary,
	};
}

export function filterToolResultForChat(
	result: CoordinatorToolResult,
): CoordinatorToolResult {
	const summary = sanitizeForOperator(result.plainEnglishSummary);
	return {
		...result,
		plainEnglishSummary:
			summary ||
			"The coordinator handled the request. Technical details are available in the right rail.",
	};
}

export function plainEnglishError(error: unknown): string {
	const raw = error instanceof Error ? error.message : String(error);
	const sanitized = sanitizeForOperator(raw);
	return (
		sanitized ||
		"Something went wrong while the Project Coordinator was preparing that response."
	);
}
