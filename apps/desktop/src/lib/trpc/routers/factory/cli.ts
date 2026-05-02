import { checkFactoryCliStatuses } from "main/lib/factory-cli";
import { z } from "zod";
import { publicProcedure, router } from "../..";

export const createFactoryCliRouter = () =>
	router({
		status: publicProcedure.query(async () => {
			return checkFactoryCliStatuses(false);
		}),
		reconnect: publicProcedure
			.input(z.object({ force: z.boolean().optional() }).optional())
			.mutation(async ({ input }) => {
				return checkFactoryCliStatuses(input?.force ?? true);
			}),
	});
