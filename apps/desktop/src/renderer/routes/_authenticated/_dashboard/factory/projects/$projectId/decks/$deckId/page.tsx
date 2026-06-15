import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect } from "react";
import { DeckDetailView } from "renderer/components/deck-cockpit";
import {
	chatWithProjectCoordinator,
	type FactoryCoordinatorNavigate,
} from "renderer/lib/factory-coordinator/chat-with-pc";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { useSetActiveProjectId } from "renderer/stores/active-project";
import { useDeckSurfaceStore } from "lib/stores/deck-surface";
import { useFactoryWorkspaceStore } from "lib/stores/workspace";
import type {
	ArtifactReference,
	DeckExportFormat,
	DeckRevisionComment,
} from "lib/types/factory-operator-console";

export const Route = createFileRoute(
	"/_authenticated/_dashboard/factory/projects/$projectId/decks/$deckId/",
)({
	component: ProjectDeckDetailPage,
});

function ProjectDeckDetailPage() {
	const { projectId, deckId } = Route.useParams();
	const navigate = useNavigate();
	const setActiveProjectId = useSetActiveProjectId();
	const setActiveDeckId = useFactoryWorkspaceStore(
		(state) => state.setActiveDeckId,
	);
	const setDeckSnapshot = useDeckSurfaceStore((state) => state.setDeckSnapshot);
	const utils = electronTrpc.useUtils();
	const deckQuery = electronTrpc.factory.decks.get.useQuery({ projectId, deckId });

	const handleDeckUpdated = useCallback(
		async (deck: NonNullable<typeof deckQuery.data>) => {
			setDeckSnapshot(deck);
			await utils.factory.decks.get.invalidate({ projectId, deckId });
			await utils.factory.decks.list.invalidate({ projectId });
		},
		[deckId, projectId, setDeckSnapshot, utils.factory.decks.get, utils.factory.decks.list],
	);

	const requestRevision = electronTrpc.factory.decks.requestRevision.useMutation({
		onSuccess: handleDeckUpdated,
	});
	const approveSlide = electronTrpc.factory.decks.approveSlide.useMutation({
		onSuccess: handleDeckUpdated,
	});
	const approveDeck = electronTrpc.factory.decks.approveDeck.useMutation({
		onSuccess: handleDeckUpdated,
	});
	const exportDeck = electronTrpc.factory.decks.export.useMutation({
		onSuccess: handleDeckUpdated,
	});

	useEffect(() => {
		setActiveProjectId(projectId);
		setActiveDeckId(projectId, deckId);
	}, [deckId, projectId, setActiveDeckId, setActiveProjectId]);

	useEffect(() => {
		if (deckQuery.data) setDeckSnapshot(deckQuery.data);
	}, [deckQuery.data, setDeckSnapshot]);

	electronTrpc.factory.decks.subscribeProgress.useSubscription(
		{ projectId, deckId },
		{
			onData: (event) => {
				if (event.deck) {
					setDeckSnapshot(event.deck);
					utils.factory.decks.get.setData({ projectId, deckId }, event.deck);
				}
				if (event.event) {
					void utils.factory.decks.get.invalidate({ projectId, deckId });
					void utils.factory.decks.list.invalidate({ projectId });
				}
			},
		},
	);

	const navigateToCoordinator = useCallback<FactoryCoordinatorNavigate>(
		(input) => {
			void navigate(input);
		},
		[navigate],
	);

	const handleChatWithSlide = useCallback(
		(reference: ArtifactReference) => {
			chatWithProjectCoordinator(
				{
					projectId,
					reference,
					suggestedPrompt: `Let's look at ${reference.label}.`,
					sourceRoute:
						typeof window !== "undefined" ? window.location.pathname : undefined,
				},
				navigateToCoordinator,
			);
		},
		[navigateToCoordinator, projectId],
	);

	if (!deckQuery.data) {
		return (
			<div className="flex min-h-0 flex-1 items-center justify-center p-8 text-sm text-muted-foreground">
				{deckQuery.isLoading ? "Loading deck..." : "Deck surface not found."}
			</div>
		);
	}

	const isMutating =
		requestRevision.isPending ||
		approveSlide.isPending ||
		approveDeck.isPending ||
		exportDeck.isPending;

	return (
		<DeckDetailView
			projectId={projectId}
			deck={deckQuery.data}
			isRefreshing={deckQuery.isFetching}
			isMutating={isMutating}
			onBack={() =>
				void navigate({
					to: "/factory/projects/$projectId/decks",
					params: { projectId },
				})
			}
			onRefresh={() => void deckQuery.refetch()}
			onRequestRevision={(slideId: string, comment: DeckRevisionComment) =>
				requestRevision.mutate({
					projectId,
					deckId,
					slideId,
					comments: [comment],
				})
			}
			onApproveSlide={(slideId: string) =>
				approveSlide.mutate({ projectId, deckId, slideId })
			}
			onApproveDeck={() => approveDeck.mutate({ projectId, deckId })}
			onExport={(format: DeckExportFormat) =>
				exportDeck.mutate({ projectId, deckId, format })
			}
			onChatWithSlide={handleChatWithSlide}
		/>
	);
}
