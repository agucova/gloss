import { env } from "@gloss/env/server";
import OpenAI from "openai";

/**
 * Embedding dimension for text-embedding-3-small.
 */
export const EMBEDDING_DIMENSION = 1536;

/**
 * OpenAI client (lazily initialized).
 */
let openaiClient: OpenAI | null = null;

/**
 * Get or create the OpenAI client.
 * Returns null if no API key is configured.
 */
function getOpenAI(): OpenAI | null {
	if (!env.OPENAI_API_KEY) {
		return null;
	}
	if (!openaiClient) {
		openaiClient = new OpenAI({ apiKey: env.OPENAI_API_KEY });
	}
	return openaiClient;
}

/**
 * Generate an embedding for a single text.
 * Returns null if OpenAI is not configured or on failure.
 */
export async function generateEmbedding(
	text: string
): Promise<number[] | null> {
	const openai = getOpenAI();
	if (!openai) {
		return null;
	}

	try {
		const response = await openai.embeddings.create({
			model: "text-embedding-3-small",
			input: text,
		});
		return response.data[0]?.embedding ?? null;
	} catch (error) {
		console.error("Failed to generate embedding:", error);
		return null;
	}
}

/**
 * Generate embeddings for multiple texts in a batch.
 * Returns null for each text that failed.
 * More efficient than calling generateEmbedding multiple times.
 */
export async function generateEmbeddings(
	texts: string[]
): Promise<(number[] | null)[]> {
	if (texts.length === 0) {
		return [];
	}

	const openai = getOpenAI();
	if (!openai) {
		return texts.map(() => null);
	}

	try {
		const response = await openai.embeddings.create({
			model: "text-embedding-3-small",
			input: texts,
		});

		// Map embeddings back to their original positions
		const embeddings: (number[] | null)[] = new Array(texts.length).fill(null);
		for (const item of response.data) {
			embeddings[item.index] = item.embedding;
		}
		return embeddings;
	} catch (error) {
		console.error("Failed to generate embeddings:", error);
		return texts.map(() => null);
	}
}

/**
 * Check if semantic search is available (OpenAI is configured).
 */
export function isSemanticSearchAvailable(): boolean {
	return !!env.OPENAI_API_KEY;
}
