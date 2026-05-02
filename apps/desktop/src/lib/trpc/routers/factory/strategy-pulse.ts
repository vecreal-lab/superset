import { z } from "zod";

import { getFactoryStrategyPulseStore } from "main/lib/factory-strategy-pulse";
import { publicProcedure, router } from "lib/trpc";

export const createFactoryStrategyPulseRouter = () =>
	router({
		listLedgerCandidates: publicProcedure
			.input(
				z
					.object({
						project_id: z.string().optional(),
						include_resolved: z.boolean().optional(),
					})
					.optional(),
			)
			.query(async ({ input }) => {
				return getFactoryStrategyPulseStore().listLedgerCandidates(input ?? {});
			}),

		promotionPreview: publicProcedure
			.input(
				z.object({
					candidate_id: z.string().min(1),
					last_operator_message: z.string().optional(),
				}),
			)
			.query(async ({ input }) => {
				return getFactoryStrategyPulseStore().buildPromotionPreview(input);
			}),

		promoteCandidate: publicProcedure
			.input(
				z.object({
					candidate_id: z.string().min(1),
					operator_reason: z.string().optional(),
					last_operator_message: z.string().optional(),
				}),
			)
			.mutation(async ({ input }) => {
				return getFactoryStrategyPulseStore().promoteCandidate(input);
			}),

		declineCandidate: publicProcedure
			.input(
				z.object({
					candidate_id: z.string().min(1),
					rationale: z.string().optional(),
				}),
			)
			.mutation(async ({ input }) => {
				return getFactoryStrategyPulseStore().declineCandidate(input);
			}),
	});
