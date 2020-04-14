'use strict';
const path = require('path');
const {app, BrowserWindow, shell, dialog, remote, ipcRenderer} = require('electron');
const unusedFilename = require('unused-filename');
const pupa = require('pupa');
const extName = require('ext-name');

const getFilenameFromMime = (name, mime) => {
	const extensions = extName.mime(mime);

	if (extensions.length !== 1) {
		return name;
	}

	return `${name}.${extensions[0].ext}`;
};

const registerListener = (session, options, callback = () => {}) => {
	const downloadItems = new Set();
	let receivedBytes = 0;
	let completedBytes = 0;
	let totalBytes = 0;
	const activeDownloadItems = () => downloadItems.size;
	const progressDownloadItems = () => receivedBytes / totalBytes;

	options = {
		showBadge: true,
		...options
	};

	const listener = (event, item, webContents) => {
		downloadItems.add(item);
		totalBytes += item.getTotalBytes();

		let hostWebContents = webContents;
		if (webContents.getType() === 'webview') {
			({hostWebContents} = webContents);
		}

		const window_ = BrowserWindow.fromWebContents(hostWebContents);

		const directory = options.directory || app.getPath('downloads');
		let filePath;
		if (options.filename) {
			filePath = path.join(directory, options.filename);
		} else {
			const filename = item.getFilename();
			const name = path.extname(filename) ? filename : getFilenameFromMime(filename, item.getMimeType());
			filePath = unusedFilename.sync(path.join(directory, name));
		}

		const errorMessage = options.errorMessage || 'The download of {filename} was interrupted';
		const errorTitle = options.errorTitle || 'Download Error';

		if (!options.saveAs) {
			item.setSavePath(filePath);
		}

		if (typeof options.onStarted === 'function') {
			options.onStarted(item);
		}

		item.on('updated', () => {
			receivedBytes = [...downloadItems].reduce((receivedBytes, item) => {
				receivedBytes += item.getReceivedBytes();
				return receivedBytes;
			}, completedBytes);

			if (options.showBadge && ['darwin', 'linux'].includes(process.platform)) {
				app.badgeCount = activeDownloadItems();
			}

			if (!window_.isDestroyed()) {
				window_.setProgressBar(progressDownloadItems());
			}

			if (typeof options.onProgress === 'function') {
				const itemTransferredBytes = item.getReceivedBytes();
				const itemTotalBytes = item.getTotalBytes();

				options.onProgress({
					percent: itemTotalBytes ? itemTransferredBytes / itemTotalBytes : 0,
					transferredBytes: itemTransferredBytes,
					totalBytes: itemTotalBytes
				});
			}
		});

		item.on('done', (event, state) => {
			completedBytes += item.getTotalBytes();
			downloadItems.delete(item);

			if (options.showBadge && ['darwin', 'linux'].includes(process.platform)) {
				app.badgeCount = activeDownloadItems();
			}

			if (!window_.isDestroyed() && !activeDownloadItems()) {
				window_.setProgressBar(-1);
				receivedBytes = 0;
				completedBytes = 0;
				totalBytes = 0;
			}

			if (options.unregisterWhenDone && !options.webview) {
				session.removeListener('will-download', listener);
			}

			if (state === 'cancelled') {
				if (typeof options.onCancel === 'function') {
					options.onCancel(item);
				}
			} else if (state === 'interrupted') {
				const message = pupa(errorMessage, {filename: item.getFilename()});
				dialog.showErrorBox(errorTitle, message);
				callback(new Error(message));
			} else if (state === 'completed') {
				if (process.platform === 'darwin') {
					app.dock.downloadFinished(filePath);
				}

				if (options.openFolderWhenDone) {
					shell.showItemInFolder(path.join(directory, item.getFilename()));
				}

				callback(null, item);
			}
		});
	};

	if (options.webview) {
		const {event, item, webContents} = options.webview;
		listener(event, item, webContents);
		return;
	}

	session.on('will-download', listener);
};

module.exports = (options = {}) => {
	app.on('session-created', session => {
		registerListener(session, options);
	});
};

module.exports.registerListener = registerListener;

module.exports.download = (window_, url, options) => new Promise((resolve, reject) => {
	options = {
		...options,
		unregisterWhenDone: true
	};

	if (window_.webContents) {
		registerListener(window_.webContents.session, options, (error, item) => {
			if (error) {
				reject(error);
			} else {
				resolve(item);
			}
		});

		window_.webContents.downloadURL(url);
		return;
	}

	if (window_.localName === 'webview') {
		const partition = window_.getAttribute('partition');

		if (remote.session.fromPartition(partition)) {
			ipcRenderer.send('electron-dl:download', {options, url, partition});
			ipcRenderer.on('electron-dl:saved', (event, {error, item}) => {
				if (error) {
					reject(error);
				} else {
					resolve(item);
				}
			});
		} else {
			reject(new Error('Can\'t find partition attribute for webview. More details: https://www.electronjs.org/docs/api/webview-tag#partition'));
		}
	} else {
		reject(new Error('Can\'t find webContents for selected window'));
	}
});
