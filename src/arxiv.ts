export function extractArxivIdFromUrl(inputUrl: string): string {
	let url: URL;
	try {
		url = new URL(inputUrl);
	} catch {
		throw new Error('Invalid URL');
	}

	if (url.hostname !== 'arxiv.org' && url.hostname !== 'www.arxiv.org') {
		throw new Error('Not an arXiv URL');
	}

	const path = url.pathname.replace(/\/+$/, '');
	const match = path.match(/^\/(abs|pdf|html)\/(.+)$/);
	if (!match) {
		throw new Error('Unsupported arXiv URL format');
	}

	const rawId = match[2];
	if (!rawId) {
		throw new Error('Unsupported arXiv URL format');
	}

	let id = rawId;
	id = id.replace(/\.(pdf|html)$/i, '');

	if (!/^\d{4}\.\d{5}(v\d+)?$/.test(id)) {
		throw new Error('Unsupported arXiv id format');
	}

	return id;
}

export function getArxivHtmlUrl(id: string): string {
	return `https://arxiv.org/html/${id}`;
}

export function getArxivAbsUrl(id: string): string {
	return `https://arxiv.org/abs/${id}`;
}

export function getArxivPdfUrl(id: string): string {
	return `https://arxiv.org/pdf/${id}`;
}
