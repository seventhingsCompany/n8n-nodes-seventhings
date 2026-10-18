import type { ICredentialDataDecryptedObject } from 'n8n-workflow';
import { sleepWithAbort } from 'n8n-workflow';

export const DEFAULT_REQUESTS_PER_MINUTE = 200;

interface Limiter {
	tail: Promise<void>;
	next: number;
	pending: number;
}

// Shared within this Node.js process, never across n8n workers. Keys contain no
// passwords or tokens. Idle entries are pruned on the next throttled request.
const limiters = new Map<string, Limiter>();

function waitForTurn(turn: Promise<void>, signal?: AbortSignal): Promise<void> {
	if (!signal) return turn;
	signal.throwIfAborted();
	return new Promise((resolve, reject) => {
		const abort = () => reject(signal.reason ?? new Error('Execution canceled'));
		signal.addEventListener('abort', abort, { once: true });
		void turn.then(() => {
			signal.removeEventListener('abort', abort);
			resolve();
		});
	});
}

/** FIFO admission, without reserving slots for canceled requests or allowing bursts. */
export async function waitForRateLimit(
	credentials: ICredentialDataDecryptedObject,
	signal?: AbortSignal,
): Promise<void> {
	const rpm = credentials.requestsPerMinute ?? DEFAULT_REQUESTS_PER_MINUTE;
	if (typeof rpm !== 'number' || !Number.isSafeInteger(rpm) || rpm < 0) {
		throw new Error('Requests Per Minute must be a non-negative integer (0 disables throttling).');
	}
	signal?.throwIfAborted();
	if (rpm === 0) return;
	const now = Date.now();
	for (const [key, entry] of limiters) {
		if (entry.pending === 0 && entry.next <= now) limiters.delete(key);
	}
	const key = JSON.stringify([
		String(credentials.subdomain ?? '').trim().toLowerCase(),
		String(credentials.username ?? '').trim(),
		String(credentials.clientId ?? ''),
	]);
	let limiter = limiters.get(key);
	if (!limiter) {
		limiter = { tail: Promise.resolve(), next: 0, pending: 0 };
		limiters.set(key, limiter);
	}
	const previous = limiter.tail;
	let release!: () => void;
	const turn = new Promise<void>((resolve) => { release = resolve; });
	limiter.tail = previous.then(() => turn);
	limiter.pending += 1;
	try {
		await waitForTurn(previous, signal);
		while (limiter.next > Date.now()) await sleepWithAbort(limiter.next - Date.now(), signal);
		signal?.throwIfAborted();
		limiter.next = Date.now() + Math.max(1, Math.ceil(60_000 / rpm));
	} finally {
		limiter.pending -= 1;
		release();
	}
}

/** Parse one Retry-After value: delta-seconds or an HTTP date, never combined values. */
export function retryAfterMilliseconds(headers: unknown, now = Date.now()): number | undefined {
	if (!headers || typeof headers !== 'object') return undefined;
	const matches = Object.entries(headers).filter(([key]) => key.toLowerCase() === 'retry-after');
	if (matches.length !== 1) return undefined;
	const raw: unknown = matches[0][1];
	if (typeof raw !== 'string') return undefined;
	const value = raw.trim();
	if (/^\d+$/.test(value)) {
		const delay = Number(value) * 1000;
		return Number.isSafeInteger(delay) && Number.isFinite(new Date(now + delay).getTime()) ? delay : undefined;
	}
	if (!/^(Mon|Tue|Wed|Thu|Fri|Sat|Sun), \d{2} [A-Z][a-z]{2} \d{4} \d{2}:\d{2}:\d{2} GMT$/.test(value)) return undefined;
	const date = Date.parse(value);
	return Number.isFinite(date) && new Date(date).toUTCString() === value ? Math.max(0, date - now) : undefined;
}
