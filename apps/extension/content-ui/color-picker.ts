/**
 * Color picker component for highlight colors.
 * Creates an inline row of color swatches.
 */

export interface HighlightColor {
	name: string;
	value: string;
}

/**
 * Preset highlight colors - warm pastels that work in both light and dark mode.
 */
export const HIGHLIGHT_COLORS: HighlightColor[] = [
	{ name: "Yellow", value: "rgba(254, 240, 138, 0.5)" },
	{ name: "Peach", value: "rgba(254, 202, 202, 0.5)" },
	{ name: "Green", value: "rgba(187, 247, 208, 0.5)" },
	{ name: "Blue", value: "rgba(191, 219, 254, 0.5)" },
	{ name: "Purple", value: "rgba(221, 214, 254, 0.5)" },
	{ name: "Orange", value: "rgba(254, 215, 170, 0.5)" },
];

/**
 * Default highlight color.
 */
export const DEFAULT_HIGHLIGHT_COLOR = HIGHLIGHT_COLORS[0].value;

export interface ColorPickerOptions {
	/** Currently selected color */
	selected?: string;
	/** Callback when color is selected */
	onChange: (color: string) => void;
	/** Optional preview callback (on hover) */
	onPreview?: (color: string | null) => void;
}

/**
 * Create a color picker element.
 */
export function createColorPicker(options: ColorPickerOptions): HTMLElement {
	const { selected = DEFAULT_HIGHLIGHT_COLOR, onChange, onPreview } = options;

	const container = document.createElement("div");
	container.className = "gloss-color-picker";
	container.setAttribute("role", "radiogroup");
	container.setAttribute("aria-label", "Highlight color");

	for (const color of HIGHLIGHT_COLORS) {
		const swatch = document.createElement("button");
		swatch.className = "gloss-color-swatch";
		swatch.style.backgroundColor = color.value;
		swatch.setAttribute("role", "radio");
		swatch.setAttribute("aria-label", color.name);
		swatch.setAttribute(
			"aria-checked",
			selected === color.value ? "true" : "false"
		);
		swatch.title = color.name;

		if (selected === color.value) {
			swatch.classList.add("selected");
		}

		// Click handler
		swatch.addEventListener("click", (e) => {
			e.preventDefault();
			e.stopPropagation();

			// Update selection state
			const allSwatches = container.querySelectorAll(".gloss-color-swatch");
			for (const s of allSwatches) {
				s.classList.remove("selected");
				s.setAttribute("aria-checked", "false");
			}
			swatch.classList.add("selected");
			swatch.setAttribute("aria-checked", "true");

			onChange(color.value);
		});

		// Hover preview
		if (onPreview) {
			swatch.addEventListener("mouseenter", () => {
				onPreview(color.value);
			});

			swatch.addEventListener("mouseleave", () => {
				onPreview(null);
			});
		}

		container.appendChild(swatch);
	}

	return container;
}

/**
 * Update the selected color in an existing color picker.
 */
export function updateColorPickerSelection(
	container: HTMLElement,
	color: string
): void {
	const swatches = container.querySelectorAll(".gloss-color-swatch");
	for (const swatch of swatches) {
		const swatchColor = (swatch as HTMLElement).style.backgroundColor;
		// Normalize both colors for comparison
		const isSelected = normalizeColor(swatchColor) === normalizeColor(color);
		swatch.classList.toggle("selected", isSelected);
		swatch.setAttribute("aria-checked", isSelected ? "true" : "false");
	}
}

/**
 * Normalize a color string for comparison.
 */
function normalizeColor(color: string): string {
	// Create a temporary element to let the browser normalize the color
	const temp = document.createElement("div");
	temp.style.color = color;
	document.body.appendChild(temp);
	const computed = getComputedStyle(temp).color;
	temp.remove();
	return computed;
}
