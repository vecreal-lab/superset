import { z } from "zod";

import { getFactoryLessonsStore } from "main/lib/factory-lessons";
import { publicProcedure, router } from "lib/trpc";

const tierSchema = z.union([z.literal(1), z.literal(2), z.literal(3)]);

export const createFactoryLessonsRouter = () =>
	router({
		listIntakeCandidates: publicProcedure
			.input(
				z
					.object({
						status: z
							.union([
								z.enum(["pending_review", "promoted", "declined", "reverted"]),
								z.literal("all"),
							])
							.optional(),
					})
					.optional(),
			)
			.query(async ({ input }) => {
				return getFactoryLessonsStore().listIntakeCandidates(input ?? {});
			}),

		getCandidate: publicProcedure
			.input(z.object({ candidate_id: z.string().min(1) }))
			.query(async ({ input }) => {
				return getFactoryLessonsStore().getCandidate(input.candidate_id);
			}),

		promotionPreview: publicProcedure
			.input(
				z.object({
					candidate_id: z.string().min(1),
					target_tier: tierSchema,
					target_role: z.string().optional(),
					target_project: z.string().optional(),
					edited_body: z.string().optional(),
					operator_reason: z.string().optional(),
					last_operator_message: z.string().optional(),
				}),
			)
			.query(async ({ input }) => {
				return getFactoryLessonsStore().buildPromotionPreview(input);
			}),

		promoteCandidate: publicProcedure
			.input(
				z.object({
					candidate_id: z.string().min(1),
					target_tier: tierSchema,
					target_role: z.string().optional(),
					target_project: z.string().optional(),
					edited_body: z.string().optional(),
					operator_reason: z.string().optional(),
					last_operator_message: z.string().optional(),
				}),
			)
			.mutation(async ({ input }) => {
				return getFactoryLessonsStore().promoteCandidate(input);
			}),

		declineCandidate: publicProcedure
			.input(
				z.object({
					candidate_id: z.string().min(1),
					rationale: z.string().optional(),
				}),
			)
			.mutation(async ({ input }) => {
				return getFactoryLessonsStore().declineCandidate(input);
			}),
	});
