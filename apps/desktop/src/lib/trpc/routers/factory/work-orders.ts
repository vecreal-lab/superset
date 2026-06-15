import { z } from "zod";
import { observable } from "@trpc/server/observable";

import {
	activeRunsDeltaEvent,
	activeRunsSignature,
	getFactoryWorkOrdersStore,
	type ActiveRunsSnapshot,
	type ActiveRunsStreamEvent,
	type WorkOrderDraftProposal,
	type WorkOrderRunStreamEvent,
} from "main/lib/factory-work-orders";
import { publicProcedure, router } from "lib/trpc";

const scopeSchema = z.enum([
	"infrastructure",
	"product",
	"brand",
	"docs",
	"cleanup",
	"dashboard",
	"other",
]);

const stateSchema = z.enum([
	"queued",
	"ready",
	"blocked",
	"running",
	"awaiting_approval",
	"completed",
	"failed",
	"canceled",
]);

const listInputSchema = z
	.object({
		projectId: z.string().min(1).optional(),
		scope: z.union([scopeSchema, z.literal("all")]).optional(),
		state: z.union([stateSchema, z.literal("all")]).optional(),
		assignedToMe: z.boolean().optional(),
		search: z.string().optional(),
		historyLimit: z.number().int().positive().max(250).optional(),
	})
	.optional();

const authorSchema = z.object({
	user: z.string().min(1),
	role: z.string().optional(),
	isAgent: z.boolean(),
	displayName: z.string().min(1),
});

const gateDecisionSchema = z.enum([
	"approved",
	"revision_requested",
	"escalated",
]);

const respondGateInputSchema = z.object({
	runRelativePath: z.string().min(1),
	gate: z.string().min(1),
	gateId: z.string().min(1),
	decision: gateDecisionSchema,
	notes: z.string(),
	decidedBy: authorSchema,
	awaitingPacketPath: z.string().optional(),
	expectedPacketModifiedAt: z.string().nullable().optional(),
});

const runActionInputSchema = z.object({
	runRelativePath: z.string().min(1),
	reason: z.string().optional(),
});

const activeRunsInputSchema = z
	.object({
		projectId: z.string().min(1).optional(),
		assignedToMe: z.boolean().optional(),
	})
	.optional();

const workOrderIdInputSchema = z.object({
	workOrderId: z.string().min(1),
});

const runWorkOrderInputSchema = workOrderIdInputSchema.extend({
	provider: z.enum(["dry-run", "claude-cli", "codex-cli", "openai-image"]).optional(),
	simulate: z.string().optional(),
});

const resumeWorkOrderInputSchema = runWorkOrderInputSchema.extend({
	runId: z.string().min(1),
});

const cancelRunInputSchema = z.object({
	runId: z.string().min(1),
	canceledBy: authorSchema.optional(),
});

const runEventsInputSchema = workOrderIdInputSchema.extend({
	runId: z.string().min(1).optional(),
});

const composerReferenceSchema = z.object({
	kind: z.enum(["file", "url", "text"]),
	value: z.string().min(1),
	label: z.string().optional(),
});

const composerActorSchema = z.object({
	user: z.string().min(1),
	displayName: z.string().min(1),
	role: z.string().optional(),
	isAgent: z.boolean().optional(),
});

const draftWorkOrdersInputSchema = z.object({
	mode: z.enum(["single", "project-launch"]),
	intent: z.string().min(8),
	projectId: z.string().min(1),
	references: z.array(composerReferenceSchema).default([]),
	author: composerActorSchema,
	assignedTo: composerActorSchema.optional(),
	operatorMessage: z.string().optional(),
	provider: z.enum(["dry-run", "claude", "codex"]).optional(),
	priorDraft: z.custom<WorkOrderDraftProposal>().optional(),
});

const saveComposedWorkOrdersInputSchema = z.object({
	proposal: z.custom<WorkOrderDraftProposal>(),
	selectedIds: z.array(z.string().min(1)).optional(),
});

export const createFactoryWorkOrdersRouter = () =>
	router({
		list: publicProcedure.input(listInputSchema).query(async ({ input }) => {
			return getFactoryWorkOrdersStore().list(input ?? {});
		}),
		detail: publicProcedure.input(workOrderIdInputSchema).query(async ({ input }) => {
			return getFactoryWorkOrdersStore().detail(input.workOrderId);
		}),
		capacity: publicProcedure.query(() => {
			return getFactoryWorkOrdersStore().capacity();
		}),
		run: publicProcedure.input(runWorkOrderInputSchema).mutation(async ({ input }) => {
			return getFactoryWorkOrdersStore().runWorkOrder(input);
		}),
		resume: publicProcedure
			.input(resumeWorkOrderInputSchema)
			.mutation(async ({ input }) => {
				return getFactoryWorkOrdersStore().resumeRun(input);
			}),
		cancel: publicProcedure.input(cancelRunInputSchema).mutation(async ({ input }) => {
			return getFactoryWorkOrdersStore().cancelRun(input);
		}),
		draftWorkOrders: publicProcedure
			.input(draftWorkOrdersInputSchema)
			.mutation(async ({ input }) => {
				return getFactoryWorkOrdersStore().draftWorkOrders(input);
			}),
		saveComposedWorkOrders: publicProcedure
			.input(saveComposedWorkOrdersInputSchema)
			.mutation(async ({ input }) => {
				return getFactoryWorkOrdersStore().saveComposedWorkOrders(input);
			}),
		runEvents: publicProcedure.input(runEventsInputSchema).subscription(({ input }) => {
			return observable<WorkOrderRunStreamEvent>((emit) => {
				let active = true;
				const publishSnapshot = async () => {
					if (!active) return;
					const detail = await getFactoryWorkOrdersStore().detail(input.workOrderId);
					emit.next({ kind: "snapshot", detail });
				};
				void publishSnapshot().catch((error) => emit.error(error));
				const unsubscribe = getFactoryWorkOrdersStore().subscribeRunnerEvents((event) => {
					if (!active) return;
					if (
						event.kind === "capacity_changed"
					) {
						emit.next({ kind: "capacity_changed", capacity: event.capacity });
						return;
					}
					if ("workOrderId" in event && event.workOrderId !== input.workOrderId) return;
					if ("runId" in event && input.runId && event.runId !== input.runId) return;
					if (event.kind === "runner_log") {
						emit.next({
							kind: "runner_log",
							runId: event.runId,
							stream: event.stream,
							line: event.line,
						});
						return;
					}
					if (event.kind === "run_state") {
						void getFactoryWorkOrdersStore()
							.detail(input.workOrderId)
							.then((detail) =>
								emit.next({
									kind: "run_state",
									event: event.event,
									detail,
								}),
							)
							.catch((error) => emit.error(error));
					}
				});
				const interval = setInterval(() => {
					void publishSnapshot().catch((error) => emit.error(error));
				}, 4_000);
				return () => {
					active = false;
					clearInterval(interval);
					unsubscribe();
				};
			});
		}),
		activeRuns: publicProcedure
			.input(activeRunsInputSchema)
			.query(async ({ input }) => {
				return getFactoryWorkOrdersStore().activeRuns(input ?? {});
			}),
		activeRunsStream: publicProcedure
			.input(activeRunsInputSchema)
			.subscription(({ input }) => {
				return observable<ActiveRunsStreamEvent>((emit) => {
					let active = true;
					let lastSignature = "";
					let lastSnapshot: ActiveRunsSnapshot | null = null;
					const publish = async () => {
						if (!active) return;
						const snapshot = await getFactoryWorkOrdersStore().activeRuns(input ?? {});
						const nextSignature = activeRunsSignature(snapshot);
						if (nextSignature !== lastSignature) {
							const event = activeRunsDeltaEvent(lastSnapshot, snapshot);
							lastSignature = nextSignature;
							lastSnapshot = snapshot;
							emit.next(event ? { kind: "run_state", event, snapshot } : { kind: "snapshot", snapshot });
						}
					};
					void publish().catch((error) => emit.error(error));
					const interval = setInterval(() => {
						void publish().catch((error) => emit.error(error));
					}, 4_000);
					return () => {
						active = false;
						clearInterval(interval);
					};
				});
			}),
		respondGate: publicProcedure
			.input(respondGateInputSchema)
			.mutation(async ({ input }) => {
				return getFactoryWorkOrdersStore().respondGate(input);
			}),
		approveMockupBundle: publicProcedure
			.input(
				z.object({
					runRelativePath: z.string().min(1),
					guidance: z.string().optional(),
				}),
			)
			.mutation(async ({ input }) => {
				return getFactoryWorkOrdersStore().respondGate({
					runRelativePath: input.runRelativePath,
					gate: "mockup-approval",
					gateId: `${input.runRelativePath}:mockup-approval`,
					decision: "approved",
					notes: input.guidance || "Mockup bundle approved in cockpit.",
					decidedBy: {
						user: "yuriy",
						role: "operator",
						isAgent: false,
						displayName: "Yuriy",
					},
				});
			}),
		requestMockupRevision: publicProcedure
			.input(
				z.object({
					runRelativePath: z.string().min(1),
					mockupIndex: z.number().int().nonnegative(),
					guidance: z.string().min(1),
				}),
			)
			.mutation(async ({ input }) => {
				return getFactoryWorkOrdersStore().respondGate({
					runRelativePath: input.runRelativePath,
					gate: "mockup-approval",
					gateId: `${input.runRelativePath}:mockup-${input.mockupIndex}`,
					decision: "revision_requested",
					notes: input.guidance,
					decidedBy: {
						user: "yuriy",
						role: "operator",
						isAgent: false,
						displayName: "Yuriy",
					},
				});
			}),
		retryRun: publicProcedure.input(runActionInputSchema).mutation(async ({ input }) => {
			return getFactoryWorkOrdersStore().markRunForRetry(
				input.runRelativePath,
				input.reason || "Retry requested from cockpit.",
			);
		}),
		abandonRun: publicProcedure
			.input(runActionInputSchema)
			.mutation(async ({ input }) => {
				return getFactoryWorkOrdersStore().abandonRun(
					input.runRelativePath,
					input.reason || "Abandoned from cockpit.",
				);
			}),
		merge: publicProcedure
			.input(
				z.object({
					workOrderId: z.string().min(1),
					branchName: z.string().min(1).optional(),
					dryRun: z.boolean().optional(),
				}),
			)
			.mutation(async ({ input }) => {
				return getFactoryWorkOrdersStore().merge(input);
			}),
	});
