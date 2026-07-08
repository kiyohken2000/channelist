/** ローカル日付を YYYYMMDD 形式で返す(ファイル名用)。 */
export function todayStamp(date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}${m}${d}`;
}

/** Blob をファイルとしてダウンロードさせる。 */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // 次のティックで解放
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

/** テキストを指定 MIME でダウンロードさせる。 */
export function downloadText(text: string, filename: string, mimeType: string): void {
  downloadBlob(new Blob([text], { type: mimeType }), filename);
}
