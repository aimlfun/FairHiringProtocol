/**
 * FHP API Error Types
 *
 * All errors the API returns to clients are instances of FHPApiError.
 * Fastify's error handler maps these to the correct HTTP status codes.
 *
 * In C# terms: these are the equivalent of custom exception types that
 * middleware maps to ProblemDetails responses.
 */

export class FHPApiError extends Error {
  readonly statusCode: number;
  readonly code:       string;
  readonly detail:    string | undefined;

  constructor(statusCode: number, code: string, message: string, detail?: string) {
    super(message);
    this.name       = 'FHPApiError';
    this.statusCode = statusCode;
    this.code       = code;
    this.detail     = detail;
  }

  toJSON() {
    return {
      error:   this.code,
      message: this.message,
      ...(this.detail ? { detail: this.detail } : {}),
    };
  }
}

// ── 400 Bad Request ───────────────────────────────────────────────────────────

export class ValidationError extends FHPApiError {
  constructor(message: string, detail?: string) {
    super(400, 'VALIDATION_ERROR', message, detail);
    this.name = 'ValidationError';
  }
}

// ── 401 Unauthorised ─────────────────────────────────────────────────────────

export class UnauthorisedError extends FHPApiError {
  constructor(message = 'Authentication required') {
    super(401, 'UNAUTHORISED', message);
    this.name = 'UnauthorisedError';
  }
}

// ── 403 Forbidden ────────────────────────────────────────────────────────────

export class ForbiddenError extends FHPApiError {
  constructor(message = 'You do not have permission to perform this action') {
    super(403, 'FORBIDDEN', message);
    this.name = 'ForbiddenError';
  }
}

// ── 404 Not Found ────────────────────────────────────────────────────────────

export class NotFoundError extends FHPApiError {
  constructor(resource: string, id?: string) {
    super(404, 'NOT_FOUND', id ? `${resource} not found: ${id}` : `${resource} not found`);
    this.name = 'NotFoundError';
  }
}

// ── 409 Conflict ─────────────────────────────────────────────────────────────

export class ConflictError extends FHPApiError {
  constructor(message: string) {
    super(409, 'CONFLICT', message);
    this.name = 'ConflictError';
  }
}

// ── 422 Unprocessable ────────────────────────────────────────────────────────

export class UnprocessableError extends FHPApiError {
  constructor(message: string, detail?: string) {
    super(422, 'UNPROCESSABLE', message, detail);
    this.name = 'UnprocessableError';
  }
}

// ── 429 Rate Limited ─────────────────────────────────────────────────────────

export class RateLimitError extends FHPApiError {
  constructor() {
    super(429, 'RATE_LIMITED', 'Too many requests. Please slow down.');
    this.name = 'RateLimitError';
  }
}

// ── 500 Internal ─────────────────────────────────────────────────────────────

export class InternalError extends FHPApiError {
  constructor(message = 'An unexpected error occurred') {
    super(500, 'INTERNAL_ERROR', message);
    this.name = 'InternalError';
  }
}

// ── FHP-specific errors ───────────────────────────────────────────────────────

export class AppealWindowExpiredError extends FHPApiError {
  constructor() {
    super(422, 'APPEAL_WINDOW_EXPIRED',
      'The 30-day appeal window for this match outcome has expired.');
    this.name = 'AppealWindowExpiredError';
  }
}

export class DuplicateAppealError extends FHPApiError {
  constructor() {
    super(409, 'DUPLICATE_APPEAL',
      'An appeal already exists for this match and has not been withdrawn.');
    this.name = 'DuplicateAppealError';
  }
}

export class MatchingIneligibleError extends FHPApiError {
  constructor(reason: string) {
    super(422, 'MATCHING_INELIGIBLE',
      `Your profile is not currently eligible for matching: ${reason}`);
    this.name = 'MatchingIneligibleError';
  }
}

export class JobBriefNotActiveError extends FHPApiError {
  constructor() {
    super(422, 'JOB_NOT_ACTIVE',
      'This job brief is not currently active and cannot accept matches.');
    this.name = 'JobBriefNotActiveError';
  }
}

export class CompanyNotActiveError extends FHPApiError {
  constructor(status: string) {
    super(403, 'COMPANY_NOT_ACTIVE',
      `Company account is ${status}. Contact governance to resolve.`);
    this.name = 'CompanyNotActiveError';
  }
}
