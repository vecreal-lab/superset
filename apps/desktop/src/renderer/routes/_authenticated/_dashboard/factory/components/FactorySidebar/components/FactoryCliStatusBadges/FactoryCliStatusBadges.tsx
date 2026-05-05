import { Badge } from "@superset/ui/badge";
import { Button } from "@superset/ui/button";
import { RotateCcw } from "lucide-react";
import { useState } from "react";
import { electronTrpc } from "renderer/lib/electron-trpc";

type Provider = "claude" | "codex";

function providerLabel(provider: Provider): string {
	return provider === "claude" ? "Claude CLI" : "Codex CLI";
}

export function FactoryCliStatusBadges() {
	const [openProvider, setOpenProvider] = useState<Provider | null>(null);
	const utils = electronTrpc.useUtils();
	const statusQuery = electronTrpc.factory.cli.status.useQuery(undefined, {
		refetchInterval: 120_000,
	});
	const reconnect = electronTrpc.factory.cli.reconnect.useMutation({
		onSuccess: async () => {
			await utils.factory.cli.status.invalidate();
		},
	});
	const statuses = statusQuery.data || [];

	return (
		<div className="mt-3 space-y-1.5">
			{(["claude", "codex"] as Provider[]).map((provider) => {
				const status = statuses.find((item) => item.provider === provider);
				const connected = Boolean(status?.connected);
				const isOpen = openProvider === provider;
				return (
					<div key={provider}>
						<button
							type="button"
							className="flex w-full items-center justify-between gap-2 rounded-md text-left text-xs text-muted-foreground hover:text-foreground"
							onClick={() => setOpenProvider(isOpen ? null : provider)}
						>
							<span>{providerLabel(provider)}</span>
							<Badge
								variant="outline"
								className="h-5 gap-1 px-1.5 text-[10px]"
								style={{
									background: "var(--bg-soft)",
									borderColor: connected ? "var(--success)" : "var(--error)",
									color: connected ? "var(--success)" : "var(--error)",
								}}
							>
								<span
									className="size-1.5 rounded-full"
									style={{ background: connected ? "var(--success)" : "var(--error)" }}
								/>
								{connected ? "Connected" : "Disconnected"}
							</Badge>
						</button>
						{isOpen && (
							<div className="mt-1 rounded-md border bg-background p-2 text-xs">
								<div className="font-medium text-foreground">
									{status?.message || "Checking CLI status..."}
								</div>
								{status?.version && (
									<div className="mt-1 text-muted-foreground">{status.version}</div>
								)}
								{status?.details && !status.connected && (
									<pre className="mt-2 max-h-24 overflow-auto whitespace-pre-wrap rounded bg-muted p-2 text-[10px]">
										{status.details}
									</pre>
								)}
								{!status?.connected && (
									<p className="mt-2 text-muted-foreground">
										Re-authenticate in a terminal if needed, then reconnect here.
									</p>
								)}
								<Button
									type="button"
									size="xs"
									variant="outline"
									className="mt-2 w-full"
									disabled={reconnect.isPending}
									onClick={() => reconnect.mutate({ force: true })}
								>
									<RotateCcw className="size-3.5" />
									Reconnect
								</Button>
							</div>
						)}
					</div>
				);
			})}
		</div>
	);
}
