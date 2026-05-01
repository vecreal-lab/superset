import {
	FACTORY_DATASETS,
	getFactoryReadModel,
	type FactoryDataset,
} from "main/lib/factory-read-model";
import { z } from "zod";
import { publicProcedure, router } from "../..";

const datasetSchema = z.enum(FACTORY_DATASETS);

export const createFactoryRouter = () =>
	router({
		summary: publicProcedure.query(async () => {
			return getFactoryReadModel().summary();
		}),
		dataset: publicProcedure
			.input(z.object({ dataset: datasetSchema }))
			.query(async ({ input }) => {
				return getFactoryReadModel().getDataset(input.dataset as FactoryDataset);
			}),
		refresh: publicProcedure.mutation(async () => {
			await getFactoryReadModel().refresh();
			return getFactoryReadModel().summary();
		}),
		workOrder: publicProcedure
			.input(z.object({ id: z.string().min(1) }))
			.query(async ({ input }) => {
				const rows = await getFactoryReadModel().getDataset("work_orders");
				return (
					rows.find(
						(row) =>
							row.id === input.id ||
							row.source_relative_path.endsWith(`${input.id}.yml`) ||
							row.source_relative_path.endsWith(`${input.id}.yaml`),
					) ?? null
				);
			}),
	});
