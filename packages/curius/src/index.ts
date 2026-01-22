// Client
export { CuriusClient, createCuriusClient } from "./client";
// Errors
export {
	CuriusAuthError,
	CuriusError,
	CuriusNotFoundError,
	CuriusRateLimitError,
	CuriusValidationError,
} from "./errors";

// Schemas (for validation in other packages)
export {
	addHighlightInputSchema,
	addLinkInputSchema,
	connectCuriusInputSchema,
	curiusHighlightSchema,
	curiusLinkSchema,
	curiusUserSchema,
	deleteHighlightInputSchema,
	getLinkByUrlInputSchema,
	getNetworkHighlightsInputSchema,
	highlightPositionSchema,
	networkHighlightSchema,
	networkLinkSchema,
} from "./schemas";
// Types
export type {
	CuriusClientOptions,
	CuriusHighlight,
	CuriusLink,
	CuriusUser,
	HighlightPosition,
	NetworkLink,
} from "./types";
