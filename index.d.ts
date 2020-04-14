import {BrowserWindow, session, webContents, DownloadItem} from 'electron';

declare namespace electronDl {
	interface Progress {
		percent: number;
		transferredBytes: number;
		totalBytes: number;
	}

	interface Webview {
		event: Event,
		item: DownloadItem,
		webContents: webContents
	}

	interface Options {
		/**
		Show a `Save As…` dialog instead of downloading immediately.

		Note: Only use this option when strictly necessary. Downloading directly without a prompt is a much better user experience.

		@default false
		*/
		readonly saveAs?: boolean;

		/**
		Directory to save the file in.

		Default: [User's downloads directory](https://electronjs.org/docs/api/app/#appgetpathname)
		*/
		readonly directory?: string;

		/**
		Name of the saved file.
		This option only makes sense for `electronDl.download()`.

		Default: [`downloadItem.getFilename()`](https://electronjs.org/docs/api/download-item/#downloaditemgetfilename)
		*/
		readonly filename?: string;

		/**
		Title of the error dialog. Can be customized for localization.

		@default 'Download Error'
		*/
		readonly errorTitle?: string;

		/**
		Message of the error dialog. `{filename}` is replaced with the name of the actual file. Can be customized for localization.

		@default 'The download of {filename} was interrupted'
		*/
		readonly errorMessage?: string;

		/**
		Optional callback that receives the [download item](https://electronjs.org/docs/api/download-item).
		You can use this for advanced handling such as canceling the item like `item.cancel()`.
		*/
		readonly onStarted?: (item: DownloadItem) => void;

		/**
		Optional callback that receives an object containing information about the progress of the current download item.
		*/
		readonly onProgress?: (progress: Progress) => void;

		/**
		Optional callback that receives the [download item](https://electronjs.org/docs/api/download-item) for which the download has been cancelled.
		*/
		readonly onCancel?: (item: DownloadItem) => void;

		/**
		Reveal the downloaded file in the system file manager, and if possible, select the file.

		@default false
		*/
		readonly openFolderWhenDone?: boolean;

		/**
		Shows the file count badge on macOS/Linux dock icons when download is in progress.

		@default true
		*/
		readonly showBadge?: boolean;

		/**
		Optional parameters for webview.
		*/
		readonly webview?: Webview;
	}
}

declare const electronDl: {
	/**
	Register the helper for all windows.

	@example
	```
	import {app, BrowserWindow} from 'electron';
	import electronDl = require('electron-dl');

	electronDl();

	let win;
	(async () => {
		await app.whenReady();
		win = new BrowserWindow();
	})();
	```
	*/
	(options?: electronDl.Options): void;

	/**
	This can be useful if you need download functionality in a reusable module.

	@param session - Window to register the behavior on.
	@param url - URL to download.
	@returns A promise for the downloaded file.

	@example
	```
	import {BrowserWindow, ipcMain} from 'electron';
	import electronDl = require('electron-dl');

	ipcMain.on('download-button', async (event, {url}) => {
		const win = BrowserWindow.getFocusedWindow();
		console.log(await electronDl.download(win, url));
	});
	```
	*/
	download(
		window: BrowserWindow,
		url: string,
		options?: electronDl.Options
	): Promise<DownloadItem>;

	/**
	This can be useful if you are using webview and want to handle will-download event listener in main process.

	@param session - Session to register the behavior on.

	@example
	```
	import {ipcMain, session} from 'electron';
	import {registerListener} 'electron-dl';

	const mainWindow = new BrowserWindow();

	ipcMain.on('electron-dl:download', (event, { options, url, partition }) => {
		const webviewSession = session.fromPartition(partition)

		webviewSession.downloadURL(url)

		const listener = (e, item) => {
			registerListener(
				webviewSession,
				{
					...options,
					webview: {
						event: e,
						item,
						webContents: mainWindow.webContents,
					},
				},
				(error, i) => {
					if (options.unregisterWhenDone) {
						webviewSession.removeListener('will-download', listener)
					}
					event.reply('electron-context-menu:saved', { error, item: i })
				},
			)
		}

		webviewSession.on('will-download', listener)

		event.reply('receivedDownloadOptions')
	})
	```
	*/

	registerListener(
		session: session,
		options?: electronDl.Options,
		callback?: (error: typeof Error, item: DownloadItem) => void
	);
};

export = electronDl;
