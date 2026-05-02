import { observable } from "@trpc/server/observable";
import { z } from "zod";

import {
	getFactoryIntakeStore,
	type IntakeStreamEvent,
} from "main/lib/factory-intake";
import { publicProcedure, router } from "lib/trpc";

const intakeStatusSchema = z.enum([
	"pending",
	"digesting",
	"digested",
	"propagated",
	"shelved",
	"declined",
]);

const listInputSchema = z
	.object({
		project_id: z.string().optional(),
		status: z.union([intakeStatusSchema, z.literal("all")]).optional(),
		type: z.string().optional(),
		search: z.string().optional(),
		include_propagated: z.boolean().optional(),
	})
	.optional();

const intakeIdSchema = z.object({
	intake_id: z.string().min(1),
});

export const createFactoryIntakeRouter = () =>
	router({
		list: publicProcedure.input(listInputSchema).query(async ({ input }) => {
			return getFactoryIntakeStore().list(input ?? {});
		}),

		get: publicProcedure.input(intakeIdSchema).query(async ({ input }) => {
			return getFactoryIntakeStore().get(input.intake_id);
		}),

		createDraft: publicProcedure
			.input(
				z.object({
					project_id: z.string().min(1),
					type: z.string().optional(),
					title: z.string().optional(),
					slug: z.string().optional(),
					operator_text: z.string().optional(),
					source_urls: z.array(z.string()).optional(),
					attachment_paths: z.array(z.string()).optional(),
				}),
			)
			.mutation(async ({ input }) => {
				return getFactoryIntakeStore().createDraft(input);
			}),

		classify: publicProcedure.input(intakeIdSchema).mutation(async ({ input }) => {
			return getFactoryIntakeStore().classify(input.intake_id);
		}),

		confirmClassification: publicProcedure
			.input(
				z.object({
					intake_id: z.string().min(1),
					project_id: z.string().min(1),
					type: z.string().min(1),
					title: z.string().min(1),
					slug: z.string().min(1),
				}),
			)
			.mutation(async ({ input }) => {
				return getFactoryIntakeStore().confirmClassification(input);
			}),

		runDigest: publicProcedure.input(intakeIdSchema).subscription(({ input }) => {
			return observable<IntakeStreamEvent>((emit) => {
				const abortController = new AbortController();
				getFactoryIntakeStore()
					.runDigest(
						input.intake_id,
						(event) => emit.next(event),
						abortController.signal,
					)
					.then((bundle) => {
						emit.next({ type: "complete", bundle });
						emit.complete();
					})
					.catch((error: unknown) => {
						const message = error instanceof Error ? error.message : String(error);
						emit.next({ type: "error", error: message });
						emit.error(error);
					});

				return () => abortController.abort();
			});
		}),

		submitDialogueTurn: publicProcedure
			.input(
				z.object({
					intake_id: z.string().min(1),
					message: z.string().min(1),
				}),
			)
			.subscription(({ input }) => {
				return observable<IntakeStreamEvent>((emit) => {
					const abortController = new AbortController();
					getFactoryIntakeStore()
						.submitDialogueTurn(
							input,
							(event) => emit.next(event),
							abortController.signal,
						)
						.then((message) => {
							emit.next({
								type: "complete",
								message: "Dialogue turn complete",
								chunk: message.content,
							});
							emit.complete();
						})
						.catch((error: unknown) => {
							const message = error instanceof Error ? error.message : String(error);
							emit.next({ type: "error", error: message });
							emit.error(error);
						});

					return () => abortController.abort();
				});
			}),

		revisePlan: publicProcedure
			.input(
				z.object({
					intake_id: z.string().min(1),
					revision: z.string().min(1),
				}),
			)
			.mutation(async ({ input }) => {
				return getFactoryIntakeStore().revisePlan(input);
			}),

		commitPropagation: publicProcedure
			.input(
				z.object({
					intake_id: z.string().min(1),
					operator_reason: z.string().optional(),
				}),
			)
			.mutation(async ({ input }) => {
				return getFactoryIntakeStore().commitPropagation(input);
			}),

		getDialogue: publicProcedure.input(intakeIdSchema).query(async ({ input }) => {
			return getFactoryIntakeStore().getDialogue(input.intake_id);
		}),
	});
