import { electronTrpc } from "renderer/lib/electron-trpc";
import { useActiveProjectId } from "renderer/stores/active-project";

export function useIntakeAttentionCount() {
	const activeProjectId = useActiveProjectId();
	const intakes = electronTrpc.factory.intake.list.useQuery(
		{
			project_id: activeProjectId,
			status: "digested",
			include_propagated: true,
		},
		{ refetchInterval: 5000 },
	);

	return {
		count: intakes.data?.length || 0,
		isLoading: intakes.isLoading,
	};
}
