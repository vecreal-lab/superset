import { observable } from "@trpc/server/observable";
import { z } from "zod";

import {
	getFactoryDomainKnowledgeStore,
	type DomainKnowledgeStreamEvent,
} from "main/lib/factory-domain-knowledge";
import { publicProcedure, router } from "lib/trpc";

const projectSchema = z.string().min(1).max(200);
const areaSchema = z.string().min(1).max(120);
const curationTriggerSchema = z.enum([
	"three_snippets",
	"fourteen_day_cadence",
	"operator_requested",
	"cross_input_synthesis",
]);

export const createFactoryDomainKnowledgeRouter = () =>
	router({
		list: publicProcedure
			.input(z.object({ project_id: projectSchema }))
			.query(async ({ input }) => {
				return getFactoryDomainKnowledgeStore().listAreas(input);
			}),

		get: publicProcedure
			.input(z.object({ project_id: projectSchema, area: areaSchema }))
			.query(async ({ input }) => {
				return getFactoryDomainKnowledgeStore().getArea(input);
			}),

		runCuration: publicProcedure
			.input(
				z.object({
					project_id: projectSchema,
					area: areaSchema,
					trigger: curationTriggerSchema.optional(),
					operator_reason: z.string().max(20_000).optional(),
				}),
			)
			.mutation(async ({ input }) => {
				return getFactoryDomainKnowledgeStore().runCuration(input);
			}),

		commitCuration: publicProcedure
			.input(
				z.object({
					project_id: projectSchema,
					area: areaSchema,
					curation_id: z.string().min(1).max(160),
					operator_reason: z.string().max(20_000).optional(),
					edited_targets: z
						.array(
							z.object({
								path: z.string().min(1),
								content: z.string(),
							}),
						)
						.optional(),
					simulate_failure_at: z.number().int().positive().optional(),
				}),
			)
			.mutation(async ({ input }) => {
				return getFactoryDomainKnowledgeStore().commitCuration(input);
			}),

		submitDialogueTurn: publicProcedure
			.input(
				z.object({
					project_id: projectSchema,
					area: areaSchema,
					message: z.string().min(1).max(20_000),
				}),
			)
			.subscription(({ input }) => {
				return observable<DomainKnowledgeStreamEvent>((emit) => {
					void getFactoryDomainKnowledgeStore()
						.submitDialogueTurn(input, (event) => emit.next(event))
						.then((message) => {
							emit.next({ type: "complete", message });
							emit.complete();
						})
						.catch((error: unknown) => {
							const message = error instanceof Error ? error.message : String(error);
							emit.next({ type: "error", error: message });
							emit.error(error);
						});

					return () => undefined;
				});
			}),
	});

