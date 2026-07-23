import { n as require_client, r as require_react, t as require_jsx_runtime } from "./styles-nKTw0Nbg.js";
import { t as domainOf } from "./util-BvXAB4lq.js";
//#region src/renderer/src/components/BookmarkCard.tsx
var import_react = require_react();
var import_client = require_client();
var import_jsx_runtime = require_jsx_runtime();
function faviconFor(url) {
	return `https://www.google.com/s2/favicons?domain=${domainOf(url)}&sz=64`;
}
function BookmarkCard({ bookmark, onOpen, onRemove }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", {
		onClick: () => onOpen(bookmark.url),
		className: "group relative flex flex-col items-center gap-2.5 p-3 rounded-2xl transition-colors hover:bg-white/[0.06]",
		children: [
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
				onClick: (e) => {
					e.stopPropagation();
					onRemove(bookmark.id);
				},
				className: "absolute top-1.5 right-1.5 w-5 h-5 grid place-items-center rounded-full bg-black/40 text-white/60 opacity-0 group-hover:opacity-100 transition-opacity hover:text-white",
				children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("svg", {
					width: "9",
					height: "9",
					viewBox: "0 0 10 10",
					children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("path", {
						d: "M1.5 1.5l7 7m0-7l-7 7",
						stroke: "currentColor",
						strokeWidth: "1.4",
						strokeLinecap: "round"
					})
				})
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
				className: "w-14 h-14 rounded-2xl bg-white/[0.06] grid place-items-center overflow-hidden",
				children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("img", {
					src: faviconFor(bookmark.url),
					width: 28,
					height: 28,
					alt: "",
					className: "rounded"
				})
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
				className: "text-[12px] text-text-dim max-w-[76px] truncate",
				children: bookmark.title
			})
		]
	});
}
//#endregion
//#region src/renderer/src/NewTabPage.tsx
var { monperTab } = window;
function greeting() {
	const h = (/* @__PURE__ */ new Date()).getHours();
	if (h < 6) return "Buenas noches";
	if (h < 12) return "Buenos días";
	if (h < 19) return "Buenas tardes";
	return "Buenas noches";
}
function NewTabPage() {
	const [bookmarks, setBookmarks] = (0, import_react.useState)([]);
	const [query, setQuery] = (0, import_react.useState)("");
	(0, import_react.useEffect)(() => {
		monperTab.getBookmarks().then(setBookmarks);
		return monperTab.onBookmarks(setBookmarks);
	}, []);
	const submit = (e) => {
		e.preventDefault();
		if (query.trim()) monperTab.navigate(query.trim());
	};
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		className: "min-h-full bg-bg text-text flex flex-col items-center pt-[16vh] px-6 select-none",
		children: [
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h1", {
				className: "text-[26px] font-semibold tracking-tight mb-7",
				children: greeting()
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("form", {
				onSubmit: submit,
				className: "w-full max-w-[560px] mb-14",
				children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "flex items-center gap-3 h-12 px-5 rounded-2xl bg-white/[0.06] border border-white/10 focus-within:border-white/25 transition-colors",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("svg", {
						width: "17",
						height: "17",
						viewBox: "0 0 17 17",
						className: "text-text-faint shrink-0",
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("circle", {
							cx: "7.5",
							cy: "7.5",
							r: "5",
							fill: "none",
							stroke: "currentColor",
							strokeWidth: "1.4"
						}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("path", {
							d: "M11.5 11.5 15 15",
							stroke: "currentColor",
							strokeWidth: "1.4",
							strokeLinecap: "round"
						})]
					}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", {
						autoFocus: true,
						value: query,
						onChange: (e) => setQuery(e.target.value),
						placeholder: "Busca en Google o escribe una URL",
						className: "flex-1 bg-transparent outline-none text-[14px] placeholder:text-text-faint select-text"
					})]
				})
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
				className: "w-full max-w-[640px]",
				children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
					className: "grid grid-cols-6 gap-1",
					children: bookmarks.map((b) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)(BookmarkCard, {
						bookmark: b,
						onOpen: (url) => monperTab.navigate(url),
						onRemove: (id) => monperTab.removeBookmark(id)
					}, b.id))
				})
			})
		]
	});
}
//#endregion
//#region src/renderer/src/newtab.tsx
(0, import_client.createRoot)(document.getElementById("root")).render(/* @__PURE__ */ (0, import_jsx_runtime.jsx)(NewTabPage, {}));
//#endregion
