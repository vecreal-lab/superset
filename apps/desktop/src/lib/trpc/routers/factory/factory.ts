import {
	FACTORY_DATASETS,
	getFactoryReadModel,
	type FactoryDataset,
} from "main/lib/factory-read-model";
import { z } from "zod";
import { publicProcedure, router } from "../..";
import { createFactoryCliRouter } from "./cli";
import { createDialogueRouter } from "./dialogue";
import { createFactoryDomainKnowledgeRouter } from "./domain-knowledge";
import { createFactoryIntakeRouter } from "./intake";
import { createFactoryLessonsRouter } from "./lessons";
import { createFactoryStrategyPulseRouter } from "./strategy-pulse";

const datasetSchema = z.enum(FACTORY_DATASETS);

export const createFactoryRouter = () =>
	router({
		cli: createFactoryCliRouter(),
		dialogue: createDialogueRouter(),
		domainKnowledge: createFactoryDomainKnowledgeRouter(),
		factoryIntake: createFactoryIntakeRouter(),
		intake: createFactoryIntakeRouter(),
		lessons: createFactoryLessonsRouter(),
		strategyPulse: createFactoryStrategyPulseRouter(),
		summary: publicProcedure.query(async () => {
			return getFactoryReadModel().summary();
		}),
		dataset: publicProcedure
			.input(z.object({ dataset: datasetSchema }))
			.query(async ({ input }) => {
				return getFactoryReadModel().getDataset(input.dataset as FactoryDataset);
			}),
		refresh: publicProcedure.mutation(async () => {
			await getFactoryReadModel().refresh();
			return getFactoryReadModel().summary();
		}),
		document: publicProcedure
			.input(
				z.object({
					path: z.string().min(1),
					maxBytes: z.number().int().positive().max(2_000_000).optional(),
				}),
			)
			.query(async ({ input }) => {
				return getFactoryReadModel().readDocument(input.path, input.maxBytes);
			}),
		pendingApprovals: publicProcedure.query(async () => {
			return getFactoryReadModel().listPendingApprovals();
		}),
		runEvidence: publicProcedure
			.input(z.object({ runRelativePath: z.string().min(1) }))
			.query(async ({ input }) => {
				return getFactoryReadModel().listRunEvidence(input.runRelativePath);
			}),
		writeApproval: publicProcedure
			.input(
				z.object({
					runRelativePath: z.string().min(1),
					gate: z.string().min(1),
					status: z.enum(["approved", "revision_requested"]),
					notes: z.string(),
				}),
			)
			.mutation(async ({ input }) => {
				return getFactoryReadModel().writeApproval(input);
			}),
		manualMockupManifests: publicProcedure
			.input(z.object({ workOrderId: z.string().optional() }).optional())
			.query(async ({ input }) => {
				return getFactoryReadModel().listManualMockupManifests(input?.workOrderId);
			}),
		saveManualMockupAttachment: publicProcedure
			.input(
				z.object({
					runId: z.string().min(1),
					viewId: z.string().min(1),
					pngBase64: z.string().min(1),
					fileName: z.string().min(1),
					comments: z.string(),
					sourceText: z.string().optional(),
				}),
			)
			.mutation(async ({ input }) => {
				return getFactoryReadModel().saveManualMockupAttachment(input);
			}),
		workOrder: publicProcedure
			.input(z.object({ id: z.string().min(1) }))
			.query(async ({ input }) => {
				const rows = await getFactoryReadModel().getDataset("work_orders");
				return (
					rows.find(
						(row) =>
							row.id === input.id ||
							row.source_relative_path.endsWith(`${input.id}.yml`) ||
							row.source_relative_path.endsWith(`${input.id}.yaml`),
					) ?? null
				);
			}),
	});
