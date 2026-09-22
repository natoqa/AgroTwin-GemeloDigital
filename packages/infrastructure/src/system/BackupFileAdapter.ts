/**
 * Moves a backup between the app and the phone's file system.
 *
 * Deliberately the plainest mechanism there is: an anchor with `download` and
 * an `<input type="file">` on the way back. The File System Access API would
 * be nicer on desktop and is not available for saving on Android Chrome, and
 * this path also happens to be the one that works when the file is handed over
 * by cable or memory card — which, with no cloud anywhere, is how a backup
 * actually reaches a second device.
 */
export class BackupFileAdapter {
  /** Hands the file to the browser's downloader under the given name. */
  download(contents: string, filename: string): void {
    const blob = new Blob([contents], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    anchor.rel = 'noopener';
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    // Revoked on the next tick: revoking synchronously can cancel the download
    // before the browser has read the blob.
    setTimeout(() => {
      URL.revokeObjectURL(url);
    }, 0);
  }

  /** Reads a file the farmer picked. */
  async read(file: Blob): Promise<string> {
    return file.text();
  }
}
