/**
 * @deprecated New flow does not use url_01 from note body.
 */
export function extractUrl01FromNoteBody(noteBody: string): string {
	const lines = noteBody.split(/\r?\n/);

	for (let i = 0; i < lines.length; i++) {
		const line = lines[i];
		if (typeof line !== 'string') continue;

		const m = line.match(/^######\s*url_01:\s*(\S+)?\s*$/);
		if (!m) continue;

		const inline = m[1];
		if (inline) return inline;

		for (let j = i + 1; j < lines.length; j++) {
			const nextLine = lines[j];
			if (typeof nextLine !== 'string') continue;

			const next = nextLine.trim();
			if (next.length === 0) continue;
			return next;
		}

		break;
	}

	throw new Error('url_01 not found');
}

export type TemplateLoadResult = {
	templateText: string;
	resolvedText: string;
};

type TemplateVariables = {
	url: string;
	date: string;
	time: string;
};

function formatDateParts(now: Date): {date: string; time: string} {
	const year = now.getFullYear();
	const month = String(now.getMonth() + 1).padStart(2, '0');
	const day = String(now.getDate()).padStart(2, '0');
	const hours = String(now.getHours()).padStart(2, '0');
	const minutes = String(now.getMinutes()).padStart(2, '0');
	return {
		date: `${year}-${month}-${day}`,
		time: `${hours}:${minutes}`,
	};
}

function replaceTemplateVariables(templateText: string, vars: TemplateVariables): string {
	return templateText
		.replace(/\{\{url\}\}/g, vars.url)
		.replace(/\{\{date\}\}/g, vars.date)
		.replace(/\{\{time\}\}/g, vars.time);
}

export function loadTemplateAndInjectUrl(templateText: string, url: string): TemplateLoadResult {
	if (!templateText.includes('{{url}}')) {
		throw new Error('TEMPLATE_URL_PLACEHOLDER_MISSING');
	}
	const {date, time} = formatDateParts(new Date());
	const resolvedText = replaceTemplateVariables(templateText, {url, date, time});
	return {templateText, resolvedText};
}
