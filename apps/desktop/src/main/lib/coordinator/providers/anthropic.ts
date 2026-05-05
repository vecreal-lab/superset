import type {
	CoordinatorProvider,
	CoordinatorProviderRequest,
	CoordinatorProviderResult,
} from "../events";

export class AnthropicSdkCoordinatorProvider implements CoordinatorProvider {
	readonly id = "anthropic-sdk" as const;

	async invoke(
		_input: CoordinatorProviderRequest,
	): Promise<CoordinatorProviderResult> {
		throw new Error(
			"Anthropic SDK coordinator provider is an optional adapter stub for a later refinement. Stream B defaults to the CLI provider.",
		);
	}
}
