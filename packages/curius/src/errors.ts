/**
 * Base error class for Curius API errors
 */
export class CuriusError extends Error {
	readonly statusCode?: number;
	readonly code?: string;

	constructor(message: string, statusCode?: number, code?: string) {
		super(message);
		this.name = "CuriusError";
		this.statusCode = statusCode;
		this.code = code;
	}
}

/**
 * Thrown when authentication fails (401)
 */
export class CuriusAuthError extends CuriusError {
	constructor(message = "Authentication failed") {
		super(message, 401, "AUTH_ERROR");
		this.name = "CuriusAuthError";
	}
}

/**
 * Thrown when rate limited (429)
 */
export class CuriusRateLimitError extends CuriusError {
	readonly retryAfter?: number;

	constructor(message = "Rate limit exceeded", retryAfter?: number) {
		super(message, 429, "RATE_LIMIT");
		this.name = "CuriusRateLimitError";
		this.retryAfter = retryAfter;
	}
}

/**
 * Thrown when resource not found (404)
 */
export class CuriusNotFoundError extends CuriusError {
	constructor(message = "Resource not found") {
		super(message, 404, "NOT_FOUND");
		this.name = "CuriusNotFoundError";
	}
}

/**
 * Thrown when response validation fails
 */
export class CuriusValidationError extends CuriusError {
	constructor(message: string) {
		super(message, undefined, "VALIDATION_ERROR");
		this.name = "CuriusValidationError";
	}
}
