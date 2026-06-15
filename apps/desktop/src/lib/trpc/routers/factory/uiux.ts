import { z } from "zod";

import { getFactoryUiuxRuntime } from "main/lib/factory-uiux";
import { publicProcedure, router } from "lib/trpc";

export const createFactoryUiuxRouter = () =>
	router({
		listScreensProposal: publicProcedure.query(async () => {
			return getFactoryUiuxRuntime().listScreensProposal();
		}),
		listStageCBriefs: publicProcedure.query(async () => {
			return getFactoryUiuxRuntime().listStageCBriefs();
		}),
		listUIUXValidationFindings: publicProcedure.query(async () => {
			return getFactoryUiuxRuntime().listUIUXValidationFindings();
		}),
		readBrief: publicProcedure
			.input(z.object({ path: z.string().min(1) }))
			.query(async ({ input }) => {
				return getFactoryUiuxRuntime().readBrief(input);
			}),
	});
