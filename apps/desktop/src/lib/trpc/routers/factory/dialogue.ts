import {
	DIALOGUE_STATES,
	getFactoryDialogueStore,
	type DialogueState,
} from "main/lib/factory-dialogues";
import { z } from "zod";
import { publicProcedure, router } from "../..";

const surfaceSchema = z.string().min(1).max(200);
const projectSchema = z.string().min(1).max(120).default("software-factory");
const dialogueIdSchema = z.string().min(1).max(120);
const messageSchema = z.string().min(1).max(20_000);
const dialogueStateSchema = z.enum(DIALOGUE_STATES);

const dialogueIdentitySchema = z.object({
	project: projectSchema,
	surface: surfaceSchema,
	dialogueId: dialogueIdSchema,
});

export const createDialogueRouter = () =>
	router({
		startTurn: publicProcedure
			.input(
				z.object({
					project: projectSchema,
					surface: surfaceSchema,
					message: messageSchema,
					title: z.string().max(240).optional(),
				}),
			)
			.mutation(async ({ input }) => {
				return getFactoryDialogueStore().startTurn(input);
			}),
		continueTurn: publicProcedure
			.input(
				z.object({
					project: projectSchema,
					surface: surfaceSchema,
					dialogueId: dialogueIdSchema,
					message: messageSchema,
				}),
			)
			.mutation(async ({ input }) => {
				return getFactoryDialogueStore().continueTurn(input);
			}),
		commit: publicProcedure
			.input(
				dialogueIdentitySchema.extend({
					notes: z.string().max(20_000).optional(),
					documentPath: z.string().min(1).max(1_000).optional(),
					documentBefore: z.string().max(2_000_000).optional(),
					documentAfter: z.string().max(2_000_000).optional(),
				}),
			)
			.mutation(async ({ input }) => {
				return getFactoryDialogueStore().commit(input);
			}),
		get: publicProcedure
			.input(dialogueIdentitySchema)
			.query(async ({ input }) => {
				return getFactoryDialogueStore().get(input);
			}),
		abandon: publicProcedure
			.input(dialogueIdentitySchema)
			.mutation(async ({ input }) => {
				return getFactoryDialogueStore().abandon(
					input.project,
					input.surface,
					input.dialogueId,
				);
			}),
		shelve: publicProcedure
			.input(dialogueIdentitySchema)
			.mutation(async ({ input }) => {
				return getFactoryDialogueStore().shelve(
					input.project,
					input.surface,
					input.dialogueId,
				);
			}),
		unshelve: publicProcedure
			.input(dialogueIdentitySchema)
			.mutation(async ({ input }) => {
				return getFactoryDialogueStore().unshelve(
					input.project,
					input.surface,
					input.dialogueId,
				);
			}),
		archive: publicProcedure
			.input(dialogueIdentitySchema)
			.mutation(async ({ input }) => {
				return getFactoryDialogueStore().archive(
					input.project,
					input.surface,
					input.dialogueId,
				);
			}),
		resume: publicProcedure
			.input(dialogueIdentitySchema)
			.mutation(async ({ input }) => {
				return getFactoryDialogueStore().resume(
					input.project,
					input.surface,
					input.dialogueId,
				);
			}),
		list: publicProcedure
			.input(
				z
					.object({
						project: projectSchema,
						surface: surfaceSchema.optional(),
						states: z.array(dialogueStateSchema).optional(),
						includeArchived: z.boolean().optional(),
					})
					.optional(),
			)
			.query(async ({ input }) => {
				return getFactoryDialogueStore().list({
					project: input?.project,
					surface: input?.surface,
					states: input?.states as DialogueState[] | undefined,
					includeArchived: input?.includeArchived,
				});
			}),
		attentionCounts: publicProcedure
			.input(
				z
					.object({
						project: projectSchema,
						surface: surfaceSchema.optional(),
					})
					.optional(),
			)
			.query(async ({ input }) => {
				return getFactoryDialogueStore().attentionCounts({
					project: input?.project,
					surface: input?.surface,
				});
			}),
	});
