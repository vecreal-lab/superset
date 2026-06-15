import { z } from "zod";

import { getFactoryDesignRuntime } from "main/lib/factory-design";
import { publicProcedure, router } from "lib/trpc";

export const createFactoryDesignRouter = () =>
	router({
		listBrandAtoms: publicProcedure.query(async () => {
			return getFactoryDesignRuntime().listBrandAtoms();
		}),
		readBrandAtom: publicProcedure
			.input(z.object({ path: z.string().min(1) }))
			.query(async ({ input }) => {
				return getFactoryDesignRuntime().readBrandAtom(input);
			}),
		listKnownGaps: publicProcedure.query(async () => {
			return getFactoryDesignRuntime().listKnownGaps();
		}),
	});
