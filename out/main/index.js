let path = require("path");
let electron = require("electron");
let fs = require("fs");
//#region src/main/bookmarks.ts
var file = "";
var items = [];
var SEED = [
	{
		id: "gmail",
		title: "Gmail",
		url: "https://mail.google.com"
	},
	{
		id: "youtube",
		title: "YouTube",
		url: "https://youtube.com"
	},
	{
		id: "github",
		title: "GitHub",
		url: "https://github.com"
	},
	{
		id: "figma",
		title: "Figma",
		url: "https://figma.com"
	},
	{
		id: "x",
		title: "X",
		url: "https://x.com"
	},
	{
		id: "wa",
		title: "WhatsApp",
		url: "https://web.whatsapp.com"
	}
];
function persist() {
	try {
		(0, fs.writeFileSync)(file, JSON.stringify(items, null, 2));
	} catch {}
}
function initBookmarks() {
	file = (0, path.join)(electron.app.getPath("userData"), "bookmarks.json");
	if ((0, fs.existsSync)(file)) try {
		items = JSON.parse((0, fs.readFileSync)(file, "utf-8"));
	} catch {
		items = [...SEED];
	}
	else {
		items = [...SEED];
		persist();
	}
}
function listBookmarks() {
	return items;
}
function isBookmarked(url) {
	return items.some((b) => b.url === url);
}
function addBookmark(b) {
	const existing = items.find((x) => x.url === b.url);
	if (existing) return existing;
	const bm = {
		id: Math.random().toString(36).slice(2),
		...b
	};
	items = [...items, bm];
	persist();
	return bm;
}
function removeBookmark(id) {
	items = items.filter((b) => b.id !== id);
	persist();
}
/** Alterna el bookmark de una URL; devuelve true si quedó guardada */
function toggleBookmark(url, title, favicon) {
	const existing = items.find((b) => b.url === url);
	if (existing) {
		removeBookmark(existing.id);
		return false;
	}
	addBookmark({
		url,
		title,
		favicon
	});
	return true;
}
//#endregion
//#region src/main/index.ts
var SIDEBAR_WIDTH = 240;
var TOPBAR_HEIGHT = 52;
var PARTITION = "persist:monper";
var isMac = process.platform === "darwin";
var RENDERER_URL_EARLY = process.env["ELECTRON_RENDERER_URL"];
function newtabUrl() {
	return RENDERER_URL_EARLY ? `${RENDERER_URL_EARLY}/newtab.html` : `file://${(0, path.join)(__dirname, "../renderer/newtab.html")}`;
}
function isNewtab(url) {
	return url.includes("/newtab.html");
}
/** Sólo las páginas internas pueden leer/escribir bookmarks vía IPC */
function isInternalSender(url) {
	return !!url && isNewtab(url);
}
var win = null;
var tabs = /* @__PURE__ */ new Map();
var activeId = null;
var nextId = 1;
var sidebarCollapsed = false;
var RENDERER_URL = process.env["ELECTRON_RENDERER_URL"];
function loadRenderer(target, page) {
	if (RENDERER_URL) target.loadURL(`${RENDERER_URL}/${page}.html`);
	else target.loadFile((0, path.join)(__dirname, `../renderer/${page}.html`));
}
function contentBounds() {
	const [w, h] = win.getContentSize();
	const left = sidebarCollapsed ? 0 : SIDEBAR_WIDTH;
	return {
		x: left,
		y: TOPBAR_HEIGHT,
		width: Math.max(0, w - left),
		height: Math.max(0, h - TOPBAR_HEIGHT)
	};
}
function layoutActive() {
	const t = activeId != null ? tabs.get(activeId) : null;
	if (t) t.view.setBounds(contentBounds());
}
function pushState() {
	if (!win || win.isDestroyed()) return;
	const t = activeId != null ? tabs.get(activeId) : null;
	const displayUrl = (u) => isNewtab(u) ? "" : u;
	const state = {
		activeId,
		tabs: [...tabs.entries()].map(([id, tb]) => ({
			id,
			url: displayUrl(tb.url),
			title: tb.title || "Nueva pestaña",
			favicon: tb.favicon,
			loading: tb.loading
		})),
		active: t ? {
			url: displayUrl(t.url),
			title: t.title,
			canBack: t.canBack,
			canForward: t.canForward,
			loading: t.loading,
			pageColor: t.themeColor || t.pageBg,
			bookmarked: isBookmarked(t.url)
		} : null
	};
	win.webContents.send("state:update", state);
}
function createTab(url = newtabUrl(), activate = true) {
	const id = nextId++;
	const view = new electron.WebContentsView({ webPreferences: {
		partition: PARTITION,
		contextIsolation: true,
		sandbox: true,
		preload: (0, path.join)(__dirname, "../preload/content.js")
	} });
	const t = {
		view,
		url,
		title: "",
		favicon: null,
		loading: false,
		canBack: false,
		canForward: false,
		themeColor: null,
		pageBg: null
	};
	tabs.set(id, t);
	win.contentView.addChildView(view);
	const wc = view.webContents;
	const nav = wc.navigationHistory;
	const refresh = () => {
		t.canBack = nav.canGoBack();
		t.canForward = nav.canGoForward();
		pushState();
	};
	wc.on("did-start-loading", () => {
		t.loading = true;
		pushState();
	});
	wc.on("did-stop-loading", () => {
		t.loading = false;
		wc.executeJavaScript(`(() => {
      const pick = (el) => { const c = getComputedStyle(el).backgroundColor; return c && c !== 'rgba(0, 0, 0, 0)' && c !== 'transparent' ? c : null; };
      return pick(document.body) || pick(document.documentElement) || '#ffffff';
    })()`, true).then((c) => {
			t.pageBg = c;
			pushState();
		}).catch(() => {});
		refresh();
	});
	wc.on("did-navigate", (_e, u) => {
		t.url = u;
		refresh();
	});
	wc.on("did-navigate-in-page", (_e, u) => {
		t.url = u;
		refresh();
	});
	wc.on("page-title-updated", (_e, title) => {
		t.title = title;
		pushState();
	});
	wc.on("page-favicon-updated", (_e, icons) => {
		t.favicon = icons?.[0] || null;
		pushState();
	});
	wc.on("did-change-theme-color", (_e, color) => {
		t.themeColor = color;
		pushState();
	});
	wc.setWindowOpenHandler(({ url: u }) => {
		createTab(u);
		return { action: "deny" };
	});
	wc.loadURL(url);
	if (activate) setActive(id);
	else pushState();
	return id;
}
function setActive(id) {
	if (!tabs.has(id)) return;
	activeId = id;
	for (const [tid, t] of tabs) t.view.setVisible(tid === id);
	layoutActive();
	pushState();
}
function closeTab(id) {
	const t = tabs.get(id);
	if (!t) return;
	win.contentView.removeChildView(t.view);
	t.view.webContents.close();
	tabs.delete(id);
	if (activeId === id) {
		const remaining = [...tabs.keys()];
		if (remaining.length) setActive(remaining[remaining.length - 1]);
		else createTab();
	} else pushState();
}
function normalizeUrl(raw) {
	const url = String(raw || "").trim();
	if (!url) return null;
	if (/^https?:\/\//i.test(url)) return url;
	if (/^[\w-]+(\.[\w-]+)+(\/.*)?$/.test(url) || url === "localhost" || url.startsWith("localhost:")) return "https://" + url;
	return "https://www.google.com/search?q=" + encodeURIComponent(url);
}
function createWindow() {
	win = new electron.BrowserWindow({
		width: 1680,
		height: 952,
		backgroundColor: isMac ? "#00000000" : "#111114",
		...isMac ? {
			vibrancy: "sidebar",
			visualEffectState: "active"
		} : {},
		titleBarStyle: isMac ? "hidden" : "default",
		webPreferences: {
			preload: (0, path.join)(__dirname, "../preload/index.js"),
			contextIsolation: true,
			sandbox: false
		}
	});
	if (isMac) {
		win.setWindowButtonVisibility(false);
		win.once("ready-to-show", () => win.setVibrancy("sidebar"));
		win.on("focus", () => win.webContents.send("win:focus", true));
		win.on("blur", () => win.webContents.send("win:focus", false));
	}
	loadRenderer(win, "index");
	win.on("resize", layoutActive);
	win.webContents.on("did-finish-load", () => {
		if (tabs.size === 0) createTab();
		else pushState();
	});
}
electron.ipcMain.handle("tabs:new", () => createTab());
electron.ipcMain.handle("tabs:close", (_e, id) => closeTab(id));
electron.ipcMain.handle("tabs:select", (_e, id) => setActive(id));
electron.ipcMain.handle("nav:go", (_e, raw) => {
	const url = normalizeUrl(raw);
	const t = activeId != null ? tabs.get(activeId) : null;
	if (url && t) t.view.webContents.loadURL(url);
});
electron.ipcMain.handle("nav:back", () => {
	const t = activeId != null ? tabs.get(activeId) : null;
	if (t?.view.webContents.navigationHistory.canGoBack()) t.view.webContents.navigationHistory.goBack();
});
electron.ipcMain.handle("nav:forward", () => {
	const t = activeId != null ? tabs.get(activeId) : null;
	if (t?.view.webContents.navigationHistory.canGoForward()) t.view.webContents.navigationHistory.goForward();
});
electron.ipcMain.handle("nav:reload", () => {
	(activeId != null ? tabs.get(activeId) : null)?.view.webContents.reload();
});
electron.ipcMain.handle("ui:collapse", (_e, collapsed) => {
	sidebarCollapsed = !!collapsed;
	layoutActive();
});
function broadcastBookmarks() {
	const list = listBookmarks();
	for (const t of tabs.values()) if (isNewtab(t.url)) t.view.webContents.send("bookmarks:changed", list);
	pushState();
}
function navigateActive(raw) {
	const url = normalizeUrl(raw);
	const t = activeId != null ? tabs.get(activeId) : null;
	if (url && t) t.view.webContents.loadURL(url);
}
electron.ipcMain.handle("bookmarks:list", () => listBookmarks());
electron.ipcMain.on("bookmarks:add", (e, b) => {
	if (!isInternalSender(e.senderFrame?.url)) return;
	addBookmark(b);
	broadcastBookmarks();
});
electron.ipcMain.on("bookmarks:remove", (e, id) => {
	if (!isInternalSender(e.senderFrame?.url)) return;
	removeBookmark(id);
	broadcastBookmarks();
});
electron.ipcMain.on("tab:navigate", (_e, url) => navigateActive(url));
electron.ipcMain.on("bookmarks:toggle", () => {
	const t = activeId != null ? tabs.get(activeId) : null;
	if (!t || isNewtab(t.url)) return;
	toggleBookmark(t.url, t.title || t.url, t.favicon);
	broadcastBookmarks();
});
electron.ipcMain.on("win:close", () => win?.close());
electron.ipcMain.on("win:minimize", () => win?.minimize());
electron.ipcMain.on("win:zoom", () => {
	if (win) win.isMaximized() ? win.unmaximize() : win.maximize();
});
var menuWin = null;
function openProfileMenu(anchor) {
	if (menuWin && !menuWin.isDestroyed()) {
		menuWin.close();
		return;
	}
	const cb = win.getContentBounds();
	const x = Math.round(cb.x + (anchor?.x ?? 8));
	const y = Math.round(cb.y + (anchor?.y ?? 40) + (anchor?.height ?? 24) + 6);
	menuWin = new electron.BrowserWindow({
		parent: win,
		x,
		y,
		width: 300,
		height: 508,
		frame: false,
		resizable: false,
		movable: false,
		minimizable: false,
		maximizable: false,
		fullscreenable: false,
		hasShadow: true,
		roundedCorners: true,
		show: false,
		backgroundColor: "#00000000",
		...isMac ? {
			vibrancy: "menu",
			visualEffectState: "active"
		} : {},
		webPreferences: {
			preload: (0, path.join)(__dirname, "../preload/index.js"),
			contextIsolation: true,
			sandbox: false
		}
	});
	loadRenderer(menuWin, "menu");
	menuWin.once("ready-to-show", () => {
		menuWin.show();
		if (isMac) menuWin.setVibrancy("menu");
	});
	menuWin.on("blur", () => {
		if (menuWin && !menuWin.isDestroyed()) menuWin.close();
	});
	menuWin.on("closed", () => {
		menuWin = null;
	});
}
electron.ipcMain.handle("menu:open", (_e, anchor) => openProfileMenu(anchor));
electron.ipcMain.on("menu:close", () => {
	if (menuWin && !menuWin.isDestroyed()) menuWin.close();
});
electron.ipcMain.on("menu:action", (_e, action) => {
	if (menuWin && !menuWin.isDestroyed()) menuWin.close();
	if (action === "new-tab" || action === "bookmarks") createTab();
});
electron.app.whenReady().then(() => {
	electron.session.fromPartition(PARTITION);
	initBookmarks();
	createWindow();
	electron.app.on("activate", () => {
		if (electron.BrowserWindow.getAllWindows().length === 0) createWindow();
	});
});
electron.app.on("window-all-closed", () => {
	if (!isMac) electron.app.quit();
});
//#endregion
