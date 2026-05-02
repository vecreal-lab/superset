import {
	DIALOGUE_STATES,
	getFactoryDialogueStore,
	type DialogueState,
	type DialogueMessage,
	type DialogueRecord,
} from "main/lib/factory-dialogues";
import {
	checkFactoryCliStatuses,
	classifyCliError,
	invokeFactoryCliRole,
	providerForRole,
	type FactoryCliProvider,
	type FactoryCliStatus,
} from "main/lib/factory-cli";
import { existsSync } from "node:fs";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { observable } from "@trpc/server/observable";
import { z } from "zod";
import { publicProcedure, router } from "../..";

const surfaceSchema = z.string().min(1).max(200);
const projectSchema = z.string().min(1).max(120).default("software-factory");
const dialogueIdSchema = z.string().min(1).max(120);
const messageSchema = z.string().min(1).max(20_000);
const dialogueStateSchema = z.enum(DIALOGUE_STATES);

const dialogueIdentitySchema = z.object({
	project: projectSchema,
	surface: surfaceSchema,
	dialogueId: dialogueIdSchema,
});

type DialogueStreamEvent =
	| {
			type: "dialogue";
			dialogue: DialogueRecord;
			messages: DialogueMessage[];
	  }
	| {
			type: "status";
			roleId: string;
			phase: "thinking" | "streaming" | "complete";
			message: string;
	  }
	| {
			type: "chunk";
			roleId: string;
			speaker: string;
			kind: "agent" | "specialist";
			content: string;
	  }
	| {
			type: "message";
			message: DialogueMessage;
			dialogue: DialogueRecord;
			messages: DialogueMessage[];
	  }
	| {
			type: "connection";
			provider: FactoryCliProvider;
			status: FactoryCliStatus;
	  }
	| {
			type: "error";
			provider?: FactoryCliProvider;
			roleId?: string;
			message: string;
	  }
	| {
			type: "complete";
			dialogue: DialogueRecord;
			messages: DialogueMessage[];
	  };

function isChangeProposal(message: string): boolean {
	return /\b(change|edit|update|rewrite|replace|revise|strengthen\w*|weaken\w*|remove|add)\b/i.test(
		message,
	);
}

function isConcreteCommit(message: string): boolean {
	return /\b(approved|approve|confirm|confirmed|ship it|do it|go|commit)\b/i.test(
		message,
	);
}

function truncateForPrompt(content: string, max = 80_000): string {
	if (content.length <= max) return content;
	return `${content.slice(0, max)}\n\n[truncated at ${max} characters]`;
}

async function readOptionalFile(root: string, relativePath: string): Promise<string> {
	const resolved = path.resolve(root, relativePath);
	if (!resolved.startsWith(root) || !existsSync(resolved)) return "";
	return readFile(resolved, "utf8");
}

async function readProjectFoundations(root: string, project: string): Promise<string> {
	const foundationsDir = path.join(root, "projects", project, "foundations");
	if (!existsSync(foundationsDir)) return "";
	const entries = await readdir(foundationsDir, { withFileTypes: true });
	const markdownFiles = entries
		.filter((entry) => entry.isFile() && entry.name.endsWith(".md"))
		.map((entry) => entry.name)
		.sort();
	const chunks: string[] = [];
	for (const fileName of markdownFiles) {
		const relativePath = `projects/${project}/foundations/${fileName}`;
		const content = await readOptionalFile(root, relativePath);
		chunks.push(`--- ${relativePath} ---\n${truncateForPrompt(content, 35_000)}`);
	}
	return chunks.join("\n\n");
}

function formatHistory(messages: DialogueMessage[]): string {
	return messages
		.slice(-12)
		.map((message) => {
			const role = message.role_id ? `${message.speaker} (${message.role_id})` : message.speaker;
			return `[${message.kind}] ${role}: ${message.content}`;
		})
		.join("\n\n");
}

async function buildRolePrompt(input: {
	root: string;
	project: string;
	surface: string;
	roleId: string;
	operatorMessage: string;
	messages: DialogueMessage[];
	state: DialogueState;
	documentPath?: string;
	mode: "primary" | "impact";
	primaryResponse?: string;
}): Promise<string> {
	const rolePrompt = await readOptionalFile(
		input.root,
		`templates/role-prompts/${input.roleId}.md`,
	);
	const lessons = await readOptionalFile(
		input.root,
		`templates/role-prompts/${input.roleId}-lessons.md`,
	);
	const documentContent = input.documentPath
		? await readOptionalFile(input.root, input.documentPath)
		: "";
	const projectFoundations = await readProjectFoundations(input.root, input.project);
	const ldpExcerpt = await readOptionalFile(
		input.root,
		"projects/software-factory/foundations/living-document-pattern.md",
	);

	return [
		`You are ${input.roleId} answering inside the Software Factory Living Document Pattern cockpit.`,
		"Respond directly to Yuriy in concise, useful markdown. Do not emit JSON, tool receipts, or factory receipt blocks.",
		"Use the cited source paths in your answer when you rely on a file. If the prompt is ambiguous, restate what you think Yuriy means and ask one clear follow-up.",
		"Subscription-auth only: you are running through the local CLI subprocess; do not ask for API keys.",
		input.mode === "impact"
			? "This is the STRATEGY_STEWARD impact pass. Focus on strategic/product impact, drift risk, and downstream propagation. Do not repeat the primary answer."
			: "This is the primary surface-specialist pass. Answer the operator's prompt from the living document and active-project foundations.",
		"",
		"## Role Prompt",
		truncateForPrompt(rolePrompt || `${input.roleId} prompt missing.`, 45_000),
		lessons ? `\n## Role Lessons\n${truncateForPrompt(lessons, 20_000)}` : "",
		"",
		"## LDP Source Of Truth Excerpt",
		truncateForPrompt(ldpExcerpt, 30_000),
		"",
		"## Active Project",
		input.project,
		"",
		"## Surface",
		input.surface,
		"",
		"## Dialogue State",
		input.state,
		"",
		input.documentPath
			? `## Current Surface Document\nSource: ${input.documentPath}\n\n${truncateForPrompt(documentContent, 70_000)}`
			: "",
		"",
		"## Active Project Foundations",
		truncateForPrompt(projectFoundations || "No project foundations found.", 120_000),
		"",
		"## Recent Dialogue History",
		formatHistory(input.messages),
		"",
		input.primaryResponse
			? `## Primary Specialist Response To Analyze\n${input.primaryResponse}`
			: "",
		"",
		"## Yuriy's Latest Message",
		input.operatorMessage,
	].join("\n");
}

function statusFromError(
	provider: FactoryCliProvider,
	error: unknown,
): FactoryCliStatus {
	const failureKind = classifyCliError(error);
	const message = error instanceof Error ? error.message : String(error);
	return {
		provider,
		label: provider === "claude" ? "Claude CLI" : "Codex CLI",
		connected: false,
		binaryOk: failureKind !== "binary_missing",
		roundTripOk: false,
		checkedAt: new Date().toISOString(),
		message:
			failureKind === "auth"
				? `Run ${provider === "claude" ? "claude" : "codex"} login in a terminal, then click Reconnect.`
				: failureKind === "network"
					? "Check network/service status, then click Reconnect."
					: message,
		details: message,
		failureKind,
	};
}

export const createDialogueRouter = () =>
	router({
		startTurn: publicProcedure
			.input(
				z.object({
					project: projectSchema,
					surface: surfaceSchema,
					message: messageSchema,
					title: z.string().max(240).optional(),
				}),
			)
			.mutation(async ({ input }) => {
				return getFactoryDialogueStore().startTurn(input);
			}),
		continueTurn: publicProcedure
			.input(
				z.object({
					project: projectSchema,
					surface: surfaceSchema,
					dialogueId: dialogueIdSchema,
					message: messageSchema,
				}),
			)
			.mutation(async ({ input }) => {
				return getFactoryDialogueStore().continueTurn(input);
			}),
		sendTurn: publicProcedure
			.input(
				z.object({
					project: projectSchema,
					surface: surfaceSchema,
					dialogueId: dialogueIdSchema.optional(),
					message: messageSchema,
					title: z.string().max(240).optional(),
					documentPath: z.string().min(1).max(1_000).optional(),
				}),
			)
			.subscription(({ input }) => {
				return observable<DialogueStreamEvent>((emit) => {
					const abortController = new AbortController();
					void (async () => {
						const store = getFactoryDialogueStore();
						const root = store.getFactoryRoot();
						const begin = await store.beginTurn(input);
						emit.next({
							type: "dialogue",
							dialogue: begin.dialogue,
							messages: begin.messages,
						});

						const primaryRole = store.getPrimaryAgent(input.surface);
						const primaryProvider = providerForRole(primaryRole);
						const primaryPrompt = await buildRolePrompt({
							root,
							project: input.project,
							surface: input.surface,
							roleId: primaryRole,
							operatorMessage: input.message,
							messages: begin.messages,
							state: begin.state,
							documentPath: input.documentPath,
							mode: "primary",
						});
						emit.next({
							type: "status",
							roleId: primaryRole,
							phase: "thinking",
							message: `${primaryRole} is thinking...`,
						});
						const primaryResult = await invokeFactoryCliRole({
							provider: primaryProvider,
							roleId: primaryRole,
							prompt: primaryPrompt,
							dialogueId: begin.dialogue.id,
							signal: abortController.signal,
							onChunk: (chunk) => {
								emit.next({
									type: "chunk",
									roleId: primaryRole,
									speaker: primaryRole,
									kind: "agent",
									content: chunk,
								});
							},
						});
						const primaryMessage = await store.appendRoleMessage({
							project: input.project,
							surface: input.surface,
							dialogueId: begin.dialogue.id,
							kind: "agent",
							speaker: primaryRole,
							roleId: primaryRole,
							content: primaryResult.text,
							provider: primaryProvider,
							sessionId: primaryResult.sessionId,
						});
						emit.next({
							type: "message",
							message: primaryMessage.message,
							dialogue: primaryMessage.dialogue,
							messages: primaryMessage.messages,
						});
						emit.next({
							type: "status",
							roleId: primaryRole,
							phase: "complete",
							message: `${primaryRole} completed.`,
						});

						const impactRole = store.getImpactSpecialist(input.surface);
						const shouldRunImpact =
							Boolean(impactRole) &&
							isChangeProposal(input.message) &&
							!isConcreteCommit(input.message);
						if (impactRole && shouldRunImpact) {
							const impactProvider = providerForRole(impactRole);
							const impactPrompt = await buildRolePrompt({
								root,
								project: input.project,
								surface: input.surface,
								roleId: impactRole,
								operatorMessage: input.message,
								messages: primaryMessage.messages,
								state: begin.state,
								documentPath: input.documentPath,
								mode: "impact",
								primaryResponse: primaryResult.text,
							});
							emit.next({
								type: "status",
								roleId: impactRole,
								phase: "thinking",
								message: `${impactRole} is checking impact...`,
							});
							const impactResult = await invokeFactoryCliRole({
								provider: impactProvider,
								roleId: impactRole,
								prompt: impactPrompt,
								dialogueId: begin.dialogue.id,
								signal: abortController.signal,
								onChunk: (chunk) => {
									emit.next({
										type: "chunk",
										roleId: impactRole,
										speaker: impactRole,
										kind: "specialist",
										content: chunk,
									});
								},
							});
							const impactMessage = await store.appendRoleMessage({
								project: input.project,
								surface: input.surface,
								dialogueId: begin.dialogue.id,
								kind: "specialist",
								speaker: impactRole,
								roleId: impactRole,
								content: impactResult.text,
								provider: impactProvider,
								sessionId: impactResult.sessionId,
							});
							emit.next({
								type: "message",
								message: impactMessage.message,
								dialogue: impactMessage.dialogue,
								messages: impactMessage.messages,
							});
							emit.next({
								type: "status",
								roleId: impactRole,
								phase: "complete",
								message: `${impactRole} completed.`,
							});
						}

						const finalRead = await store.get({
							project: input.project,
							surface: input.surface,
							dialogueId: begin.dialogue.id,
						});
						emit.next({
							type: "complete",
							dialogue: finalRead.dialogue,
							messages: finalRead.messages,
						});
						emit.complete();
					})().catch(async (error) => {
						const message = error instanceof Error ? error.message : String(error);
						const provider: FactoryCliProvider = /codex/i.test(message)
							? "codex"
							: "claude";
						emit.next({
							type: "connection",
							provider,
							status: statusFromError(provider, error),
						});
						emit.next({ type: "error", provider, message });
						await checkFactoryCliStatuses(true).catch(() => undefined);
						emit.complete();
					});
					return () => {
						abortController.abort();
					};
				});
			}),
		commit: publicProcedure
			.input(
				dialogueIdentitySchema.extend({
					notes: z.string().max(20_000).optional(),
					documentPath: z.string().min(1).max(1_000).optional(),
					documentBefore: z.string().max(2_000_000).optional(),
					documentAfter: z.string().max(2_000_000).optional(),
				}),
			)
			.mutation(async ({ input }) => {
				return getFactoryDialogueStore().commit(input);
			}),
		get: publicProcedure
			.input(dialogueIdentitySchema)
			.query(async ({ input }) => {
				return getFactoryDialogueStore().get(input);
			}),
		abandon: publicProcedure
			.input(dialogueIdentitySchema)
			.mutation(async ({ input }) => {
				return getFactoryDialogueStore().abandon(
					input.project,
					input.surface,
					input.dialogueId,
				);
			}),
		shelve: publicProcedure
			.input(dialogueIdentitySchema)
			.mutation(async ({ input }) => {
				return getFactoryDialogueStore().shelve(
					input.project,
					input.surface,
					input.dialogueId,
				);
			}),
		unshelve: publicProcedure
			.input(dialogueIdentitySchema)
			.mutation(async ({ input }) => {
				return getFactoryDialogueStore().unshelve(
					input.project,
					input.surface,
					input.dialogueId,
				);
			}),
		archive: publicProcedure
			.input(dialogueIdentitySchema)
			.mutation(async ({ input }) => {
				return getFactoryDialogueStore().archive(
					input.project,
					input.surface,
					input.dialogueId,
				);
			}),
		resume: publicProcedure
			.input(dialogueIdentitySchema)
			.mutation(async ({ input }) => {
				return getFactoryDialogueStore().resume(
					input.project,
					input.surface,
					input.dialogueId,
				);
			}),
		list: publicProcedure
			.input(
				z
					.object({
						project: projectSchema,
						surface: surfaceSchema.optional(),
						states: z.array(dialogueStateSchema).optional(),
						includeArchived: z.boolean().optional(),
					})
					.optional(),
			)
			.query(async ({ input }) => {
				return getFactoryDialogueStore().list({
					project: input?.project,
					surface: input?.surface,
					states: input?.states as DialogueState[] | undefined,
					includeArchived: input?.includeArchived,
				});
			}),
		attentionCounts: publicProcedure
			.input(
				z
					.object({
						project: projectSchema,
						surface: surfaceSchema.optional(),
					})
					.optional(),
			)
			.query(async ({ input }) => {
				return getFactoryDialogueStore().attentionCounts({
					project: input?.project,
					surface: input?.surface,
				});
			}),
	});
