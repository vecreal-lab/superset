import { observable } from "@trpc/server/observable";
import { getFactoryDecksRuntime } from "main/lib/decks";
import type { DeckProgressEvent } from "lib/types/factory-operator-console";
import { z } from "zod";
import { publicProcedure, router } from "../..";

const projectIdSchema = z.string().min(1).max(200).default("software-factory");
const deckIdSchema = z.string().min(1).max(160);
const slideIdSchema = z.string().min(1).max(160);
const commentSchema = z.object({
	commentId: z.string().min(1).max(160).optional(),
	text: z.string().min(1).max(4_000),
	line: z.number().int().positive(),
	column: z.number().int().positive(),
	targetLabel: z.string().max(240).optional(),
	hint: z.string().max(500).optional(),
});

export const createFactoryDecksRouter = () =>
	router({
		list: publicProcedure
			.input(z.object({ projectId: projectIdSchema }))
			.query(async ({ input }) => {
				return getFactoryDecksRuntime().list(input);
			}),
		get: publicProcedure
			.input(z.object({ projectId: projectIdSchema, deckId: deckIdSchema }))
			.query(async ({ input }) => {
				return getFactoryDecksRuntime().get(input);
			}),
		spawn: publicProcedure
			.input(
				z.object({
					projectId: projectIdSchema,
					scope: z.string().min(1).max(20_000),
					audience: z.string().max(2_000).optional(),
					title: z.string().max(240).optional(),
				}),
			)
			.mutation(async ({ input }) => {
				return getFactoryDecksRuntime().spawn(input);
			}),
		requestRevision: publicProcedure
			.input(
				z.object({
					projectId: projectIdSchema,
					deckId: deckIdSchema,
					slideId: slideIdSchema,
					comments: z.array(commentSchema).min(1).max(20),
				}),
			)
			.mutation(async ({ input }) => {
				return getFactoryDecksRuntime().requestRevision(input);
			}),
		approveSlide: publicProcedure
			.input(
				z.object({
					projectId: projectIdSchema,
					deckId: deckIdSchema,
					slideId: slideIdSchema,
				}),
			)
			.mutation(async ({ input }) => {
				return getFactoryDecksRuntime().approveSlide(input);
			}),
		approveDeck: publicProcedure
			.input(z.object({ projectId: projectIdSchema, deckId: deckIdSchema }))
			.mutation(async ({ input }) => {
				return getFactoryDecksRuntime().approveDeck(input);
			}),
		export: publicProcedure
			.input(
				z.object({
					projectId: projectIdSchema,
					deckId: deckIdSchema,
					format: z.enum(["html", "pdf"]),
				}),
			)
			.mutation(async ({ input }) => {
				return getFactoryDecksRuntime().export(input);
			}),
		subscribeProgress: publicProcedure
			.input(z.object({ projectId: projectIdSchema, deckId: deckIdSchema }))
			.subscription(({ input }) => {
				return observable<DeckProgressEvent>((emit) => {
					const runtime = getFactoryDecksRuntime();
					void runtime
						.get(input)
						.then((deck) => emit.next({ type: "snapshot", deck }))
						.catch((error) => emit.error(error));
					const unsubscribe = runtime.subscribeProgress(
						input.projectId,
						input.deckId,
						(event) => emit.next(event),
					);
					return unsubscribe;
				});
			}),
	});
