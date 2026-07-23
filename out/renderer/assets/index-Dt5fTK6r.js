import { n as require_client, r as require_react, t as require_jsx_runtime } from "./styles-nKTw0Nbg.js";
import { a as Avatar, i as SectionLabel, o as IconButton } from "./ui-CrT337bW.js";
import { n as luminance, t as domainOf } from "./util-BvXAB4lq.js";
//#region src/renderer/src/components/TrafficLights.tsx
var import_react = require_react();
var import_client = require_client();
var import_jsx_runtime = require_jsx_runtime();
function TrafficLights() {
	const { monper } = window;
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		id: "traffic",
		children: [
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
				className: "light close",
				onClick: () => monper.winClose(),
				children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("svg", {
					viewBox: "0 0 10 10",
					children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("path", {
						d: "M2.6 2.6l4.8 4.8M7.4 2.6l-4.8 4.8",
						stroke: "currentColor",
						strokeWidth: "1.1",
						strokeLinecap: "round"
					})
				})
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
				className: "light min",
				onClick: () => monper.winMinimize(),
				children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("svg", {
					viewBox: "0 0 10 10",
					children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("path", {
						d: "M2.3 5h5.4",
						stroke: "currentColor",
						strokeWidth: "1.1",
						strokeLinecap: "round"
					})
				})
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
				className: "light zoom",
				onClick: () => monper.winZoom(),
				children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("svg", {
					viewBox: "0 0 10 10",
					children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("path", {
						d: "M2.3 5h5.4M5 2.3v5.4",
						stroke: "currentColor",
						strokeWidth: "1.1",
						strokeLinecap: "round"
					})
				})
			})
		]
	});
}
//#endregion
//#region src/renderer/src/components/Icons.tsx
var PlusIcon = ({ className }) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("svg", {
	className,
	width: "14",
	height: "14",
	viewBox: "0 0 14 14",
	children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("path", {
		d: "M7 2v10M2 7h10",
		stroke: "currentColor",
		strokeWidth: "1.5",
		strokeLinecap: "round"
	})
});
var SidebarIcon = ({ className }) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("svg", {
	className,
	width: "15",
	height: "15",
	viewBox: "0 0 15 15",
	children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("rect", {
		x: "1.5",
		y: "2.5",
		width: "12",
		height: "10",
		rx: "2",
		fill: "none",
		stroke: "currentColor",
		strokeWidth: "1.3"
	}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("line", {
		x1: "5.5",
		y1: "2.5",
		x2: "5.5",
		y2: "12.5",
		stroke: "currentColor",
		strokeWidth: "1.3"
	})]
});
var ChevronDown = ({ className }) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("svg", {
	className,
	width: "13",
	height: "13",
	viewBox: "0 0 13 13",
	children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("path", {
		d: "M3.5 5l3 3 3-3",
		fill: "none",
		stroke: "currentColor",
		strokeWidth: "1.4",
		strokeLinecap: "round",
		strokeLinejoin: "round"
	})
});
var BackIcon = ({ className }) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("svg", {
	className,
	width: "15",
	height: "15",
	viewBox: "0 0 15 15",
	children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("path", {
		d: "M9.5 3 5 7.5 9.5 12",
		fill: "none",
		stroke: "currentColor",
		strokeWidth: "1.5",
		strokeLinecap: "round",
		strokeLinejoin: "round"
	})
});
var ForwardIcon = ({ className }) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("svg", {
	className,
	width: "15",
	height: "15",
	viewBox: "0 0 15 15",
	children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("path", {
		d: "M5.5 3 10 7.5 5.5 12",
		fill: "none",
		stroke: "currentColor",
		strokeWidth: "1.5",
		strokeLinecap: "round",
		strokeLinejoin: "round"
	})
});
var ReloadIcon = ({ className }) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("svg", {
	className,
	width: "14",
	height: "14",
	viewBox: "0 0 14 14",
	children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("path", {
		d: "M12 7a5 5 0 1 1-1.7-3.75M12 1.5V4h-2.5",
		fill: "none",
		stroke: "currentColor",
		strokeWidth: "1.4",
		strokeLinecap: "round",
		strokeLinejoin: "round"
	})
});
var CloseIcon = ({ className }) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("svg", {
	className,
	width: "9",
	height: "9",
	viewBox: "0 0 10 10",
	children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("path", {
		d: "M1.5 1.5l7 7m0-7l-7 7",
		stroke: "currentColor",
		strokeWidth: "1.4",
		strokeLinecap: "round"
	})
});
var StarIcon = ({ className, filled }) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("svg", {
	className,
	width: "15",
	height: "15",
	viewBox: "0 0 15 15",
	children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("path", {
		d: "M7.5 1.8l1.65 3.35 3.7.54-2.68 2.6.63 3.68L7.5 10.72 4.2 12.45l.63-3.68L2.15 6.17l3.7-.54z",
		fill: filled ? "currentColor" : "none",
		stroke: "currentColor",
		strokeWidth: "1.2",
		strokeLinejoin: "round"
	})
});
//#endregion
//#region src/renderer/src/components/AccountPill.tsx
function AccountPill({ initials, name, onOpen }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", {
		id: "profile-btn",
		onClick: (e) => onOpen(e.currentTarget.getBoundingClientRect()),
		children: [
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Avatar, { initials }),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
				className: "account-name",
				children: name
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)(ChevronDown, { className: "acc-chev" })
		]
	});
}
//#endregion
//#region src/renderer/src/components/TabRow.tsx
function TabRow({ tab, active, onSelect, onClose }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		className: "tab" + (active ? " active" : ""),
		onClick: () => onSelect(tab.id),
		onAuxClick: (e) => e.button === 1 && onClose(tab.id),
		children: [
			tab.loading ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "spinner" }) : tab.favicon ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("img", {
				className: "favicon",
				src: tab.favicon,
				onError: (e) => e.currentTarget.style.visibility = "hidden"
			}) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "favicon placeholder" }),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
				className: "title",
				children: tab.title || domainOf(tab.url) || "New tab"
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
				className: "close",
				title: "Cerrar",
				onClick: (e) => {
					e.stopPropagation();
					onClose(tab.id);
				},
				children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(CloseIcon, {})
			})
		]
	});
}
//#endregion
//#region src/renderer/src/components/TabList.tsx
function TabList({ tabs, activeId, onSelect, onClose }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
		id: "tab-list",
		children: tabs.map((t) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)(TabRow, {
			tab: t,
			active: t.id === activeId,
			onSelect,
			onClose
		}, t.id))
	});
}
//#endregion
//#region src/renderer/src/components/Sidebar.tsx
function Sidebar({ state, onOpenMenu, onCollapse, onNewTab, onSelectTab, onCloseTab }) {
	const closeOthers = () => state.tabs.forEach((t) => t.id !== state.activeId && onCloseTab(t.id));
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("aside", {
		id: "sidebar",
		children: [
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
				className: "drag-region",
				children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(TrafficLights, {})
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "account",
				children: [
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)(AccountPill, {
						initials: "LC",
						name: "Luis Carlos",
						onOpen: onOpenMenu
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)(IconButton, {
						variant: "subtle",
						title: "Colapsar sidebar (⌘S)",
						onClick: onCollapse,
						children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(SidebarIcon, {})
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)(IconButton, {
						variant: "subtle",
						title: "Nueva pestaña (⌘T)",
						onClick: onNewTab,
						children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(PlusIcon, {})
					})
				]
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)(SectionLabel, {
				label: "Tabs",
				action: {
					label: "Clear",
					title: "Cerrar todas menos la activa",
					onClick: closeOthers
				}
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", {
				className: "row new-row",
				onClick: onNewTab,
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(PlusIcon, {}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: "New tab" })]
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)(TabList, {
				tabs: state.tabs,
				activeId: state.activeId,
				onSelect: onSelectTab,
				onClose: onCloseTab
			})
		]
	});
}
//#endregion
//#region src/renderer/src/components/UrlBar.tsx
function UrlBar({ active, editRequest, onGo }) {
	const [editing, setEditing] = (0, import_react.useState)(false);
	const [value, setValue] = (0, import_react.useState)("");
	const inputRef = (0, import_react.useRef)(null);
	const startEditing = () => {
		setValue(active && active.url !== "about:blank" ? active.url : "");
		setEditing(true);
	};
	(0, import_react.useEffect)(() => {
		if (editRequest > 0) startEditing();
	}, [editRequest]);
	(0, import_react.useEffect)(() => {
		if (editing) {
			inputRef.current?.focus();
			inputRef.current?.select();
		}
	}, [editing]);
	const domain = active ? domainOf(active.url) || "New tab" : "";
	const title = active && active.title && active.title !== domain ? active.title : "";
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
		id: "url-area",
		children: editing ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", {
			id: "omnibox",
			ref: inputRef,
			type: "text",
			spellCheck: false,
			autoComplete: "off",
			placeholder: "Search Google or type a URL",
			value,
			onChange: (e) => setValue(e.target.value),
			onBlur: () => setEditing(false),
			onKeyDown: (e) => {
				if (e.key === "Enter") {
					onGo(value);
					setEditing(false);
				}
				if (e.key === "Escape") setEditing(false);
			}
		}) : /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", {
			id: "url-display",
			onClick: startEditing,
			children: [
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
					id: "url-domain",
					children: domain
				}),
				title && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "sep" }),
				title && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
					id: "url-title",
					children: title
				})
			]
		})
	});
}
//#endregion
//#region src/renderer/src/components/Topbar.tsx
function Topbar({ active, collapsed, editRequest, onExpand, onBack, onForward, onReload, onGo, onToggleBookmark }) {
	const pageColor = active?.pageColor || "#111114";
	const onLight = luminance(pageColor) > .5;
	const canBookmark = !!active?.url;
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("header", {
		id: "topbar",
		className: onLight ? "on-light" : void 0,
		style: { background: pageColor },
		children: [
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "nav-btns",
				children: [
					collapsed && /* @__PURE__ */ (0, import_jsx_runtime.jsx)(IconButton, {
						title: "Mostrar sidebar (⌘S)",
						onClick: onExpand,
						children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(SidebarIcon, {})
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)(IconButton, {
						title: "Atrás",
						disabled: !active?.canBack,
						onClick: onBack,
						children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(BackIcon, {})
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)(IconButton, {
						title: "Adelante",
						disabled: !active?.canForward,
						onClick: onForward,
						children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ForwardIcon, {})
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)(IconButton, {
						title: "Recargar",
						onClick: onReload,
						children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ReloadIcon, {})
					})
				]
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)(UrlBar, {
				active,
				editRequest,
				onGo
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
				className: "nav-btns",
				children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(IconButton, {
					title: active?.bookmarked ? "Quitar bookmark" : "Guardar bookmark",
					disabled: !canBookmark,
					onClick: onToggleBookmark,
					children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(StarIcon, { filled: active?.bookmarked })
				})
			})
		]
	});
}
//#endregion
//#region src/renderer/src/App.tsx
var EMPTY = {
	activeId: null,
	tabs: [],
	active: null
};
var { monper } = window;
function App() {
	const [state, setState] = (0, import_react.useState)(EMPTY);
	const [collapsed, setCollapsed] = (0, import_react.useState)(false);
	const [editRequest, setEditRequest] = (0, import_react.useState)(0);
	(0, import_react.useEffect)(() => {
		const off = monper.onState(setState);
		monper.onWinFocus((f) => document.body.classList.toggle("win-blurred", !f));
		if (monper.platform === "darwin") document.body.classList.add("mac");
		return off;
	}, []);
	(0, import_react.useEffect)(() => {
		document.body.classList.toggle("collapsed", collapsed);
		monper.setCollapsed(collapsed);
	}, [collapsed]);
	(0, import_react.useEffect)(() => {
		const onKey = (e) => {
			if (!(e.metaKey || e.ctrlKey)) return;
			if (e.key === "s") {
				e.preventDefault();
				setCollapsed((c) => !c);
			} else if (e.key === "t") {
				e.preventDefault();
				monper.newTab();
			} else if (e.key === "w") {
				e.preventDefault();
				if (state.activeId != null) monper.closeTab(state.activeId);
			} else if (e.key === "l") {
				e.preventDefault();
				setEditRequest((n) => n + 1);
			} else if (e.key === "r") {
				e.preventDefault();
				monper.reload();
			}
		};
		window.addEventListener("keydown", onKey);
		return () => window.removeEventListener("keydown", onKey);
	}, [state.activeId]);
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Sidebar, {
		state,
		onOpenMenu: (r) => monper.openMenu({
			x: r.left,
			y: r.top,
			width: r.width,
			height: r.height
		}),
		onCollapse: () => setCollapsed(true),
		onNewTab: () => monper.newTab(),
		onSelectTab: (id) => monper.selectTab(id),
		onCloseTab: (id) => monper.closeTab(id)
	}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Topbar, {
		active: state.active,
		collapsed,
		editRequest,
		onExpand: () => setCollapsed(false),
		onBack: () => monper.back(),
		onForward: () => monper.forward(),
		onReload: () => monper.reload(),
		onGo: (url) => monper.go(url),
		onToggleBookmark: () => monper.toggleBookmark()
	})] });
}
//#endregion
//#region src/renderer/src/main.tsx
(0, import_client.createRoot)(document.getElementById("root")).render(/* @__PURE__ */ (0, import_jsx_runtime.jsx)(App, {}));
//#endregion
