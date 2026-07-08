import type { Subscription, ShareImageOptions, ShareLayout } from '../types';

// ============================================================================
// 定数(ライトテーマ1種で開始。ダークは V1.1 候補)
// ============================================================================

const WIDTH = 1200;
const FONT_STACK =
  'system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, ' +
  '"Noto Sans JP", "Hiragino Kaku Gothic ProN", Meiryo, sans-serif';

const COLOR = {
  bg: '#ffffff',
  fg: '#0f0f0f',
  sub: '#606060',
  cardBg: '#f7f7f7',
  watermark: '#b0b0b0',
} as const;

const FOOTER_H = 70; // 透かし用の下部余白
const WATERMARK_TEXT = 'channelist.pages.dev';

const ICON_TIMEOUT_MS = 5000;
const CONCURRENCY = 8;

/** レイアウトごとの推奨件数上限(数値ボタンのグレーアウト判定に使用。仕様書 8)。 */
export const LAYOUT_MAX_COUNT: Record<ShareLayout, number> = {
  list: 30,
  'card-grid': 50,
  'icon-grid': 100,
};

/**
 * 「すべて」選択時のハード上限。Canvas の高さ制限(多くのブラウザで ~32767px)を
 * 超えて描画が破綻しないための安全弁。list(rowH=64)でも 300 件 ≒ 19,000px で収まる。
 */
export const HARD_MAX_COUNT = 300;

/** 件数選択肢。 */
export const COUNT_OPTIONS = [10, 30, 50, 100] as const;

export interface ShareRenderResult {
  blob: Blob;
  /** プレビュー用オブジェクト URL(呼び出し側で revoke すること)。 */
  previewUrl: string;
  width: number;
  height: number;
}

// ============================================================================
// アイコン取得(メモリキャッシュ + 並列制限 + タイムアウト + フォールバック)
// ============================================================================

// 取得済み画像はメモリ内でキャッシュし、レイアウト切替時に再取得しない。
// 値: 読み込めた HTMLImageElement、失敗なら null(→ プレースホルダ)。
const iconCache = new Map<string, Promise<HTMLImageElement | null>>();

function loadImage(src: string, timeoutMs: number): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    let settled = false;
    const finish = (result: HTMLImageElement | null) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(result);
    };
    const timer = setTimeout(() => finish(null), timeoutMs);
    img.onload = () => finish(img);
    img.onerror = () => finish(null);
    img.src = src;
  });
}

/**
 * アイコン取得戦略(仕様書 8):
 *  1. crossOrigin=anonymous で直接ロード
 *  2. 失敗したら /api/thumbnail 経由で再ロード
 *  3. それも失敗したら null(呼び出し側でプレースホルダ描画)
 */
function getIcon(url: string): Promise<HTMLImageElement | null> {
  if (!url) return Promise.resolve(null);
  const cached = iconCache.get(url);
  if (cached) return cached;

  const p = (async () => {
    const direct = await loadImage(url, ICON_TIMEOUT_MS);
    if (direct) return direct;
    const proxied = await loadImage(
      `/api/thumbnail?url=${encodeURIComponent(url)}`,
      ICON_TIMEOUT_MS,
    );
    return proxied;
  })();

  iconCache.set(url, p);
  return p;
}

/** 並列数を制限して各要素に非同期処理を適用する。 */
async function mapLimit<T, R>(
  items: readonly T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let cursor = 0;
  const runners = Array.from(
    { length: Math.min(limit, items.length) },
    async () => {
      while (cursor < items.length) {
        const idx = cursor++;
        results[idx] = await fn(items[idx], idx);
      }
    },
  );
  await Promise.all(runners);
  return results;
}

// ============================================================================
// 描画ユーティリティ
// ============================================================================

/** channelId から決定的な背景色(プレースホルダ用)。 */
function placeholderColor(seed: string): string {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  }
  return `hsl(${hash % 360}, 55%, 55%)`;
}

/** タイトルの先頭 1 文字(絵文字/サロゲート対応)。 */
function initial(title: string): string {
  const first = Array.from(title.trim())[0];
  return first ?? '?';
}

/** 1 行に収まるよう末尾を省略(…)する。 */
function fitText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string {
  if (ctx.measureText(text).width <= maxWidth) return text;
  const chars = Array.from(text);
  const ellipsis = '…';
  let result = ellipsis;
  for (let i = 1; i <= chars.length; i++) {
    const candidate = chars.slice(0, i).join('') + ellipsis;
    if (ctx.measureText(candidate).width > maxWidth) break;
    result = candidate;
  }
  return result;
}

/** 最大 2 行に折り返し(2 行目は末尾省略)。 */
function wrapTwoLines(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
): string[] {
  const chars = Array.from(text);
  let line1 = '';
  let i = 0;
  for (; i < chars.length; i++) {
    const candidate = line1 + chars[i];
    if (ctx.measureText(candidate).width > maxWidth) break;
    line1 = candidate;
  }
  if (i >= chars.length) return [line1];
  const rest = chars.slice(i).join('');
  return [line1, fitText(ctx, rest, maxWidth)];
}

function roundRectPath(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

/** 画像を対象矩形いっぱいに object-fit: cover で描画。 */
function drawCover(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  dx: number,
  dy: number,
  dw: number,
  dh: number,
): void {
  const iw = img.naturalWidth || img.width;
  const ih = img.naturalHeight || img.height;
  if (!iw || !ih) return;
  const dr = dw / dh;
  const ir = iw / ih;
  let sx = 0;
  let sy = 0;
  let sw = iw;
  let sh = ih;
  if (ir > dr) {
    sw = ih * dr;
    sx = (iw - sw) / 2;
  } else {
    sh = iw / dr;
    sy = (ih - sh) / 2;
  }
  ctx.drawImage(img, sx, sy, sw, sh, dx, dy, dw, dh);
}

interface IconCell {
  img: HTMLImageElement | null;
  sub: Subscription;
}

/** アイコン or プレースホルダを描画(shape: 'rounded' | 'circle')。 */
function drawIconCell(
  ctx: CanvasRenderingContext2D,
  cell: IconCell,
  x: number,
  y: number,
  size: number,
  shape: 'rounded' | 'circle',
): void {
  ctx.save();
  if (shape === 'circle') {
    ctx.beginPath();
    ctx.arc(x + size / 2, y + size / 2, size / 2, 0, Math.PI * 2);
    ctx.closePath();
  } else {
    roundRectPath(ctx, x, y, size, size, size * 0.18);
  }
  ctx.clip();

  if (cell.img) {
    drawCover(ctx, cell.img, x, y, size, size);
  } else {
    // プレースホルダ: 背景色 + 頭文字
    ctx.fillStyle = placeholderColor(cell.sub.channelId || cell.sub.title);
    ctx.fillRect(x, y, size, size);
    ctx.fillStyle = '#ffffff';
    ctx.font = `600 ${Math.round(size * 0.45)}px ${FONT_STACK}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(initial(cell.sub.title), x + size / 2, y + size / 2);
  }
  ctx.restore();
}

function drawWatermark(ctx: CanvasRenderingContext2D, height: number): void {
  ctx.fillStyle = COLOR.watermark;
  ctx.font = `400 22px ${FONT_STACK}`;
  ctx.textAlign = 'right';
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(WATERMARK_TEXT, WIDTH - 40, height - 26);
}

// ============================================================================
// レイアウト別描画
// ============================================================================

function renderList(subs: Subscription[]): HTMLCanvasElement {
  const padX = 60;
  const top = 60;
  const rowH = 64;
  const fontSize = 30;
  const height = top + subs.length * rowH + FOOTER_H;

  const canvas = createCanvas(height);
  const ctx = get2d(canvas);
  paintBackground(ctx, height);

  ctx.font = `400 ${fontSize}px ${FONT_STACK}`;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  const maxTextWidth = WIDTH - padX * 2;

  subs.forEach((s, i) => {
    const y = top + i * rowH + rowH / 2;
    ctx.fillStyle = COLOR.fg;
    ctx.fillText(fitText(ctx, s.title, maxTextWidth), padX, y);
  });

  drawWatermark(ctx, height);
  return canvas;
}

function renderIconGrid(cells: IconCell[]): HTMLCanvasElement {
  const cols = 10;
  const cell = 110;
  const iconSize = 96;
  const padX = (WIDTH - cols * cell) / 2; // = 50
  const top = 50;
  const rows = Math.ceil(cells.length / cols);
  const height = top + rows * cell + FOOTER_H;

  const canvas = createCanvas(height);
  const ctx = get2d(canvas);
  paintBackground(ctx, height);

  cells.forEach((c, i) => {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const x = padX + col * cell + (cell - iconSize) / 2;
    const y = top + row * cell + (cell - iconSize) / 2;
    drawIconCell(ctx, c, x, y, iconSize, 'rounded');
  });

  drawWatermark(ctx, height);
  return canvas;
}

function renderCardGrid(cells: IconCell[]): HTMLCanvasElement {
  const cols = 5;
  const padX = 50;
  const top = 50;
  const cellW = (WIDTH - padX * 2) / cols; // = 220
  const iconSize = 120;
  const lineH = 28;
  const rowH = iconSize + 16 + lineH * 2 + 24; // icon + gap + 2 lines + spacing
  const rows = Math.ceil(cells.length / cols);
  const height = top + rows * rowH + FOOTER_H;

  const canvas = createCanvas(height);
  const ctx = get2d(canvas);
  paintBackground(ctx, height);

  const nameFont = `400 24px ${FONT_STACK}`;

  cells.forEach((c, i) => {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const cx = padX + col * cellW + cellW / 2;
    const cellTop = top + row * rowH;
    const iconX = cx - iconSize / 2;
    const iconY = cellTop;

    drawIconCell(ctx, c, iconX, iconY, iconSize, 'circle');

    ctx.font = nameFont;
    ctx.fillStyle = COLOR.fg;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    const lines = wrapTwoLines(ctx, c.sub.title, cellW - 20);
    lines.forEach((line, li) => {
      ctx.fillText(line, cx, iconY + iconSize + 12 + li * lineH);
    });
  });

  drawWatermark(ctx, height);
  return canvas;
}

// ============================================================================
// 共通ヘルパー
// ============================================================================

function createCanvas(height: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = WIDTH;
  canvas.height = Math.max(1, Math.round(height));
  return canvas;
}

function get2d(canvas: HTMLCanvasElement): CanvasRenderingContext2D {
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D context unavailable');
  return ctx;
}

function paintBackground(ctx: CanvasRenderingContext2D, height: number): void {
  ctx.fillStyle = COLOR.bg;
  ctx.fillRect(0, 0, WIDTH, height);
}

function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    try {
      canvas.toBlob((blob) => {
        if (blob) resolve(blob);
        else reject(new Error('toBlob returned null'));
      }, 'image/png');
    } catch (e) {
      // tainted canvas 等
      reject(e instanceof Error ? e : new Error('toBlob failed'));
    }
  });
}

// ============================================================================
// エントリポイント
// ============================================================================

/**
 * 共有画像を生成する。対象は渡された subs の先頭 count 件(呼び出し側で
 * 現在のソート順に並べ替え済みであること)。
 */
export async function renderShareImage(
  subs: Subscription[],
  options: ShareImageOptions,
): Promise<ShareRenderResult> {
  // 呼び出し側で件数は決定済み。ここでは Canvas 破綻防止のハード上限のみ適用。
  const target = subs.slice(0, Math.min(options.count, HARD_MAX_COUNT));

  let canvas: HTMLCanvasElement;

  if (options.layout === 'list') {
    // テキストのみの list は同期生成
    canvas = renderList(target);
  } else {
    // アイコン系はアイコン取得完了後に描画
    const imgs = await mapLimit(target, CONCURRENCY, (s) => getIcon(s.thumbnailUrl));
    const cells: IconCell[] = target.map((sub, i) => ({ sub, img: imgs[i] }));
    canvas =
      options.layout === 'icon-grid' ? renderIconGrid(cells) : renderCardGrid(cells);
  }

  const blob = await canvasToBlob(canvas);
  const previewUrl = URL.createObjectURL(blob);
  return { blob, previewUrl, width: canvas.width, height: canvas.height };
}

/** テスト・デバッグ用にアイコンキャッシュをクリアする。 */
export function clearIconCache(): void {
  iconCache.clear();
}
