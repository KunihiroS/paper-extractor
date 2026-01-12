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
