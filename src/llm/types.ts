export type SummarizeParams = {
	systemPrompt: string;
	userContent: string;
};

export interface LlmProvider {
	summarize(params: SummarizeParams): Promise<string>;
}
