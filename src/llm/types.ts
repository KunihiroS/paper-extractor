export type SummarizeParams = {
	systemPrompt: string;
	userContent: string;
	// PageIndex 用（オプション）- pdfUrl があれば PageIndex として処理
	pdfUrl?: string;
	arxivId?: string;
	// ログ出力用コールバック（オプション）
	log?: (message: string) => void;
};

export interface LlmProvider {
	summarize(params: SummarizeParams): Promise<string>;
}
