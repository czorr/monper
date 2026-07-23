let electron = require("electron");
//#region src/preload/content.ts
electron.contextBridge.exposeInMainWorld("monperTab", {
	navigate: (url) => electron.ipcRenderer.send("tab:navigate", url),
	getBookmarks: () => electron.ipcRenderer.invoke("bookmarks:list"),
	addBookmark: (b) => electron.ipcRenderer.send("bookmarks:add", b),
	removeBookmark: (id) => electron.ipcRenderer.send("bookmarks:remove", id),
	onBookmarks: (cb) => {
		const handler = (_e, list) => cb(list);
		electron.ipcRenderer.on("bookmarks:changed", handler);
		return () => {
			electron.ipcRenderer.removeListener("bookmarks:changed", handler);
		};
	}
});
//#endregion
