import { create } from "zustand";
import type { DeckCommentTarget, DeckDetail } from "lib/types/factory-operator-console";

interface DeckSurfaceStoreState {
	decksById: Record<string, DeckDetail>;
	activeSlideIdByDeck: Record<string, string | undefined>;
	selectedTargetBySlide: Record<string, DeckCommentTarget | undefined>;
	setDeckSnapshot: (deck: DeckDetail) => void;
	setActiveSlideId: (deckId: string, slideId?: string) => void;
	setSelectedTarget: (
		deckId: string,
		slideId: string,
		target?: DeckCommentTarget,
	) => void;
	clearDeck: (deckId: string) => void;
}

function slideKey(deckId: string, slideId: string): string {
	return `${deckId}:${slideId}`;
}

export const useDeckSurfaceStore = create<DeckSurfaceStoreState>()((set) => ({
	decksById: {},
	activeSlideIdByDeck: {},
	selectedTargetBySlide: {},
	setDeckSnapshot: (deck) =>
		set((state) => ({
			decksById: {
				...state.decksById,
				[deck.deckId]: deck,
			},
			activeSlideIdByDeck: {
				...state.activeSlideIdByDeck,
				[deck.deckId]:
					state.activeSlideIdByDeck[deck.deckId] ?? deck.slides[0]?.slideId,
			},
		})),
	setActiveSlideId: (deckId, slideId) =>
		set((state) => ({
			activeSlideIdByDeck: {
				...state.activeSlideIdByDeck,
				[deckId]: slideId,
			},
		})),
	setSelectedTarget: (deckId, slideId, target) =>
		set((state) => ({
			selectedTargetBySlide: {
				...state.selectedTargetBySlide,
				[slideKey(deckId, slideId)]: target,
			},
		})),
	clearDeck: (deckId) =>
		set((state) => {
			const { [deckId]: _deck, ...decksById } = state.decksById;
			const { [deckId]: _slide, ...activeSlideIdByDeck } =
				state.activeSlideIdByDeck;
			const selectedTargetBySlide = Object.fromEntries(
				Object.entries(state.selectedTargetBySlide).filter(
					([key]) => !key.startsWith(`${deckId}:`),
				),
			);
			return {
				decksById,
				activeSlideIdByDeck,
				selectedTargetBySlide,
			};
		}),
}));

export function useDeckSurfaceSelection(deckId: string, slideId?: string) {
	const deck = useDeckSurfaceStore((state) => state.decksById[deckId]);
	const activeSlideId = useDeckSurfaceStore(
		(state) => state.activeSlideIdByDeck[deckId],
	);
	const selectedTarget = useDeckSurfaceStore((state) =>
		slideId ? state.selectedTargetBySlide[slideKey(deckId, slideId)] : undefined,
	);
	const setDeckSnapshot = useDeckSurfaceStore((state) => state.setDeckSnapshot);
	const setActiveSlideId = useDeckSurfaceStore((state) => state.setActiveSlideId);
	const setSelectedTarget = useDeckSurfaceStore(
		(state) => state.setSelectedTarget,
	);

	return {
		deck,
		activeSlideId,
		selectedTarget,
		setDeckSnapshot,
		setActiveSlideId,
		setSelectedTarget,
	};
}
