export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export const classifyProviderError = (status, message = '') => {
	const normalized = String(message || '').toLowerCase();

	if (
		status === 401 ||
		status === 403 ||
		normalized.includes('unauthorized') ||
		normalized.includes('forbidden')
	) {
		return 'auth';
	}

	if (
		normalized.includes('invalid api credit') ||
		normalized.includes('invalid credit') ||
		normalized.includes('credit exhausted')
	) {
		return 'credit';
	}

	if (
		status === 429 ||
		normalized.includes('rate limit') ||
		normalized.includes('too many requests') ||
		normalized.includes('quota') ||
		normalized.includes('limit exceeded')
	) {
		return 'rate_limit';
	}

	if (status >= 500 || normalized.includes('timeout') || normalized.includes('temporarily')) {
		return 'transient';
	}

	return 'other';
};

export const getBackoffDelayMs = (attempt, category = 'other', retryAfterHeader = null) => {
	if (retryAfterHeader) {
		const parsed = Number(retryAfterHeader);
		if (Number.isFinite(parsed) && parsed > 0) {
			return parsed * 1000;
		}
	}

	const base = category === 'rate_limit' ? 1500 : category === 'transient' ? 900 : 400;
	const jitter = Math.floor(Math.random() * 250);
	return Math.min(base * (2 ** Math.max(0, attempt - 1)) + jitter, 10000);
};
