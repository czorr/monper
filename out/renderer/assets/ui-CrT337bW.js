import { t as require_jsx_runtime } from "./styles-nKTw0Nbg.js";
//#region src/renderer/src/components/ui/IconButton.tsx
var import_jsx_runtime = require_jsx_runtime();
function IconButton({ children, variant = "default", className = "", ...rest }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
		className: [
			"icon-btn",
			variant === "subtle" ? "subtle" : "",
			className
		].filter(Boolean).join(" "),
		...rest,
		children
	});
}
//#endregion
//#region src/renderer/src/components/ui/Avatar.tsx
function Avatar({ initials, size = "md" }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
		className: size === "sm" ? "avatar-sm" : "avatar",
		children: initials
	});
}
//#endregion
//#region src/renderer/src/components/ui/SectionLabel.tsx
function SectionLabel({ label, action }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		className: "section-label",
		children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: label }), action && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
			className: "text-btn",
			title: action.title,
			onClick: action.onClick,
			children: action.label
		})]
	});
}
//#endregion
//#region src/renderer/src/components/ui/Menu.tsx
function MenuLabel({ children }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
		className: "m-label",
		children
	});
}
function MenuDivider() {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "m-divider" });
}
function MenuItem({ icon, name, meta, onClick }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", {
		className: "m-item",
		onClick,
		children: [
			icon && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
				className: "ico",
				children: icon
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
				className: "name",
				children: name
			}),
			meta && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
				className: "meta",
				children: meta
			})
		]
	});
}
//#endregion
export { Avatar as a, SectionLabel as i, MenuItem as n, IconButton as o, MenuLabel as r, MenuDivider as t };
