import { z } from "zod";

import { getFactoryBrandAtomsStore } from "main/lib/factory-brand-atoms";
import { publicProcedure, router } from "lib/trpc";

const atomPathSchema = z.object({
	atomPath: z.string().min(1),
});

const tokenNameSchema = z.object({
	tokenName: z.string().min(1),
});

export const createFactoryBrandAtomsRouter = () =>
	router({
		scanAtomConsumption: publicProcedure.query(async () => {
			return getFactoryBrandAtomsStore().scanAtomConsumption();
		}),

		listAtoms: publicProcedure.query(async () => {
			return getFactoryBrandAtomsStore().listAtoms();
		}),

		getAtomConsumers: publicProcedure.input(atomPathSchema).query(async ({ input }) => {
			return getFactoryBrandAtomsStore().getAtomConsumers(input.atomPath);
		}),

		getAtomCoverage: publicProcedure.query(async () => {
			return getFactoryBrandAtomsStore().getAtomCoverage();
		}),

		getAtomGapFindings: publicProcedure.query(async () => {
			return getFactoryBrandAtomsStore().getAtomGapFindings();
		}),

		getCssVariableUsage: publicProcedure
			.input(tokenNameSchema)
			.query(async ({ input }) => {
				return getFactoryBrandAtomsStore().getCssVariableUsage(input.tokenName);
			}),
	});
