import type { SubscriptionsResponse, ApiError, ApiErrorResponse } from '../types';

export class SubscriptionsError extends Error {
  code: ApiError;
  constructor(code: ApiError) {
    super(code);
    this.name = 'SubscriptionsError';
    this.code = code;
  }
}

function isApiErrorResponse(v: unknown): v is ApiErrorResponse {
  return typeof v === 'object' && v !== null && 'error' in v;
}

/**
 * /api/subscriptions を叩き、SubscriptionsResponse を返す。
 * 失敗時は SubscriptionsError(code: ApiError)を throw する。
 */
export async function fetchSubscriptions(handle: string): Promise<SubscriptionsResponse> {
  let res: Response;
  try {
    res = await fetch(`/api/subscriptions?handle=${encodeURIComponent(handle)}`, {
      headers: { Accept: 'application/json' },
    });
  } catch {
    throw new SubscriptionsError('UNKNOWN');
  }

  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    body = null;
  }

  if (!res.ok) {
    if (isApiErrorResponse(body)) {
      throw new SubscriptionsError(body.error);
    }
    // ステータスから最善の推定
    if (res.status === 429) throw new SubscriptionsError('RATE_LIMITED');
    if (res.status === 404) throw new SubscriptionsError('HANDLE_NOT_FOUND');
    throw new SubscriptionsError('UNKNOWN');
  }

  return body as SubscriptionsResponse;
}
