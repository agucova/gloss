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
	activityResponseSchema,
	addHighlightInputSchema,
	addLinkInputSchema,
	allUsersResponseSchema,
	connectCuriusInputSchema,
	curiusHighlightSchema,
	curiusLinkSchema,
	curiusUserSchema,
	deleteHighlightInputSchema,
	getLinkByUrlInputSchema,
	getNetworkHighlightsInputSchema,
	highlightPositionSchema,
	libraryEntrySchema,
	libraryHighlightSchema,
	libraryResponseSchema,
	networkHighlightSchema,
	networkInfoSchema,
	networkLinkSchema,
} from "./schemas";
// Types
export type {
	CuriusClientOptions,
	CuriusHighlight,
	CuriusLink,
	CuriusUser,
	HighlightPosition,
	NetworkInfo,
	NetworkLink,
} from "./types";
