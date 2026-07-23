//#region src/renderer/src/util.ts
function domainOf(url) {
	try {
		return new URL(url).hostname.replace(/^www\./, "");
	} catch {
		return "";
	}
}
function luminance(color) {
	let r = 255, g = 255, b = 255;
	let m = color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/);
	if (m) {
		if (m[4] !== void 0 && parseFloat(m[4]) === 0) return 0;
		[r, g, b] = [
			+m[1],
			+m[2],
			+m[3]
		];
	} else if (m = color.match(/^#([0-9a-f]{6})$/i)) {
		r = parseInt(m[1].slice(0, 2), 16);
		g = parseInt(m[1].slice(2, 4), 16);
		b = parseInt(m[1].slice(4, 6), 16);
	}
	return (.2126 * r + .7152 * g + .0722 * b) / 255;
}
//#endregion
export { luminance as n, domainOf as t };
