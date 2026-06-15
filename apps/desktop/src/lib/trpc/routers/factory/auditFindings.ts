import { z } from "zod";

import { getFactoryAuditRuntime } from "main/lib/factory-audit";
import { publicProcedure, router } from "lib/trpc";

export const createFactoryAuditFindingsRouter = () =>
	router({
		listAudits: publicProcedure.query(async () => {
			return getFactoryAuditRuntime().listAudits();
		}),
		getAudit: publicProcedure
			.input(z.object({ path: z.string().min(1) }))
			.query(async ({ input }) => {
				return getFactoryAuditRuntime().getAudit(input);
			}),
		detectRecurringPatterns: publicProcedure.query(async () => {
			return getFactoryAuditRuntime().detectRecurringPatterns();
		}),
	});
