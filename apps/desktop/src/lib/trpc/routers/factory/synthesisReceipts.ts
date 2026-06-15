import { z } from "zod";

import { getFactorySynthesisRuntime } from "main/lib/factory-synthesis";
import { publicProcedure, router } from "lib/trpc";

export const createFactorySynthesisReceiptsRouter = () =>
	router({
		listSyntheses: publicProcedure.query(async () => {
			return getFactorySynthesisRuntime().listSyntheses();
		}),
		getSynthesis: publicProcedure
			.input(z.object({ path: z.string().min(1) }))
			.query(async ({ input }) => {
				return getFactorySynthesisRuntime().getSynthesis(input);
			}),
	});
