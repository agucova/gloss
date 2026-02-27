/** Font injection — called once by content.ts to load Satoshi globally */
let fontInjected = false;
export function ensureFontLoaded(): void {
	if (fontInjected) return;
	fontInjected = true;
	const link = document.createElement("link");
	link.rel = "stylesheet";
	link.href =
		"https://api.fontshare.com/v2/css?f[]=satoshi@400,500,600,700&display=swap";
	document.head.appendChild(link);
}
