let electron = require("electron");
//#region src/preload/index.ts
var api = {
	platform: process.platform,
	newTab: () => electron.ipcRenderer.invoke("tabs:new"),
	closeTab: (id) => electron.ipcRenderer.invoke("tabs:close", id),
	selectTab: (id) => electron.ipcRenderer.invoke("tabs:select", id),
	go: (url) => electron.ipcRenderer.invoke("nav:go", url),
	back: () => electron.ipcRenderer.invoke("nav:back"),
	forward: () => electron.ipcRenderer.invoke("nav:forward"),
	reload: () => electron.ipcRenderer.invoke("nav:reload"),
	setCollapsed: (v) => electron.ipcRenderer.invoke("ui:collapse", v),
	winClose: () => electron.ipcRenderer.send("win:close"),
	winMinimize: () => electron.ipcRenderer.send("win:minimize"),
	winZoom: () => electron.ipcRenderer.send("win:zoom"),
	onWinFocus: (cb) => {
		electron.ipcRenderer.on("win:focus", (_e, f) => cb(f));
	},
	onState: (cb) => {
		const handler = (_e, state) => cb(state);
		electron.ipcRenderer.on("state:update", handler);
		return () => {
			electron.ipcRenderer.removeListener("state:update", handler);
		};
	},
	openMenu: (anchor) => electron.ipcRenderer.invoke("menu:open", anchor),
	menuAction: (action) => electron.ipcRenderer.send("menu:action", action),
	closeMenu: () => electron.ipcRenderer.send("menu:close"),
	toggleBookmark: () => electron.ipcRenderer.send("bookmarks:toggle")
};
electron.contextBridge.exposeInMainWorld("monper", api);
//#endregion
