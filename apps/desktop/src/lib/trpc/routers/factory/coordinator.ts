import { observable } from "@trpc/server/observable";
import {
	COORDINATOR_TOOL_KINDS,
	getCoordinatorRuntime,
	type CoordinatorStreamEvent,
} from "main/lib/coordinator";
import type {
	CoordinatorMode,
	RightRailItem,
	RightRailState,
} from "lib/types/factory-operator-console";
import { z } from "zod";
import { publicProcedure, router } from "../..";

const projectIdSchema = z.string().min(1).max(160).default("software-factory");
const messageSchema = z.string().min(1).max(20_000);
const authorSchema = z.object({
	user: z.string().min(1),
	role: z.string().optional(),
	isAgent: z.boolean(),
	displayName: z.string().min(1),
});
const artifactReferenceSchema = z.object({
	referenceId: z.string().min(1),
	kind: z.enum([
		"work_order",
		"run",
		"foundation",
		"decision",
		"lesson",
		"role",
		"brand_atom",
		"feature",
		"project",
		"intake",
		"receipt",
		"other",
	]),
	label: z.string().min(1),
	projectId: z.string().optional(),
	path: z.string().optional(),
	route: z.string().optional(),
	sourceSection: z.string().optional(),
	summary: z.string().optional(),
});
const coordinatorModeSchema = z.enum([
	"general",
	"work_order_execution",
	"research_intake",
	"uiux",
	"onboarding_handoff",
	"review",
]);
const projectInputSchema = z.object({ projectId: projectIdSchema });

export const createCoordinatorRouter = () =>
	router({
		context: publicProcedure
			.input(projectInputSchema)
			.query(async ({ input }) => getCoordinatorRuntime().context(input.projectId)),
		history: publicProcedure
			.input(projectInputSchema)
			.query(async ({ input }) => getCoordinatorRuntime().history(input.projectId)),
		rightRail: publicProcedure
			.input(projectInputSchema)
			.query(async ({ input }) => getCoordinatorRuntime().rightRail(input.projectId)),
		recentActivity: publicProcedure
			.input(projectInputSchema)
			.query(async ({ input }) =>
				getCoordinatorRuntime().recentActivity(input.projectId),
			),
		sendTurn: publicProcedure
			.input(
				z.object({
					projectId: projectIdSchema,
					message: messageSchema,
					author: authorSchema.optional(),
					references: z.array(artifactReferenceSchema).default([]),
					activeMode: coordinatorModeSchema.optional(),
					mockResponse: z.string().max(20_000).optional(),
					mockToolKind: z.enum(COORDINATOR_TOOL_KINDS).optional(),
				}),
			)
			.subscription(({ input }) => {
				return observable<CoordinatorStreamEvent>((emit) => {
					const abortController = new AbortController();
					void getCoordinatorRuntime()
						.sendTurn({
							projectId: input.projectId,
							message: input.message,
							author: input.author,
							references: input.references,
							activeMode: input.activeMode as CoordinatorMode | undefined,
							mockResponse: input.mockResponse,
							mockToolKind: input.mockToolKind,
							signal: abortController.signal,
							emit: (event) => emit.next(event),
						})
						.then(() => emit.complete())
						.catch((error) => emit.error(error));

					return () => abortController.abort();
				});
			}),
		approveToolCall: publicProcedure
			.input(
				z.object({
					projectId: projectIdSchema,
					toolCallId: z.string().min(1),
					approved: z.boolean(),
					decidedBy: authorSchema.optional(),
					guidance: z.string().max(20_000).optional(),
				}),
			)
			.mutation(async ({ input }) =>
				getCoordinatorRuntime().approveToolCall(input),
			),
		updateRightRailItem: publicProcedure
			.input(
				z.object({
					projectId: projectIdSchema,
					itemId: z.string().min(1),
					patch: z.record(z.string(), z.unknown()),
				}),
			)
			.mutation(async ({ input }) =>
				getCoordinatorRuntime().updateRightRailItem({
					projectId: input.projectId,
					itemId: input.itemId,
					patch: input.patch as Partial<RightRailItem>,
				}),
			),
		subscribeRightRail: publicProcedure
			.input(projectInputSchema)
			.subscription(({ input }) => {
				return observable<RightRailState>((emit) => {
					const runtime = getCoordinatorRuntime();
					void runtime.rightRail(input.projectId).then((state) => emit.next(state));
					const unsubscribe = runtime.subscribeRightRail(input.projectId, (state) => {
						emit.next(state);
					});
					return unsubscribe;
				});
			}),
		subscribeBlockers: publicProcedure
			.input(projectInputSchema)
			.subscription(({ input }) => {
				return observable<RightRailItem[]>((emit) => {
					const runtime = getCoordinatorRuntime();
					void runtime.blockerItems(input.projectId).then((items) => emit.next(items));
					const unsubscribe = runtime.subscribeBlockers(input.projectId, (items) => {
						emit.next(items);
					});
					return unsubscribe;
				});
			}),
	});
