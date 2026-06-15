import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { DeckListView } from "renderer/components/deck-cockpit";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { useActiveProjectId } from "renderer/stores/active-project";
import { useFactoryWorkspaceStore } from "lib/stores/workspace";

export const Route = createFileRoute(
	"/_authenticated/_dashboard/factory/decks/",
)({
	component: DecksPage,
});

function DecksPage() {
	const projectId = useActiveProjectId();
	const navigate = useNavigate();
	const setActiveDeckId = useFactoryWorkspaceStore(
		(state) => state.setActiveDeckId,
	);
	const utils = electronTrpc.useUtils();
	const decksQuery = electronTrpc.factory.decks.list.useQuery({ projectId });
	const spawnDeck = electronTrpc.factory.decks.spawn.useMutation({
		onSuccess: async (deck) => {
			setActiveDeckId(projectId, deck.deckId);
			await utils.factory.decks.list.invalidate({ projectId });
			void navigate({
				to: "/factory/projects/$projectId/decks/$deckId",
				params: { projectId, deckId: deck.deckId },
			});
		},
	});

	return (
		<DeckListView
			projectId={projectId}
			decks={decksQuery.data ?? []}
			isLoading={decksQuery.isLoading}
			isSpawning={spawnDeck.isPending}
			onOpenDeck={(deckId) => {
				setActiveDeckId(projectId, deckId);
				void navigate({
					to: "/factory/projects/$projectId/decks/$deckId",
					params: { projectId, deckId },
				});
			}}
			onSpawnDeck={(input) => spawnDeck.mutate({ projectId, ...input })}
			onRefresh={() => void decksQuery.refetch()}
		/>
	);
}
