import { describe, it, expect } from 'vitest';
import type { Subscription } from '../types';
import {
  toText,
  toCsv,
  toMarkdown,
  toJson,
  toOpml,
  formatSubscriptions,
  FORMATTERS,
} from './formatters';

/** テスト用に Subscription を組み立てるヘルパー。 */
function sub(partial: Partial<Subscription>): Subscription {
  return {
    title: 'Title',
    channelId: 'UC0000000000000000000000',
    url: 'https://www.youtube.com/channel/UC0000000000000000000000',
    description: '',
    publishedAt: '2024-01-01T00:00:00Z',
    thumbnailUrl: 'https://yt3.ggpht.com/abc=s88',
    ...partial,
  };
}

// 仕様書セクション7の必須テストケース群。
// 特殊値: `"`, `,`, `&`, `<`, 改行, 絵文字, 0件。
const simple: Subscription[] = [
  sub({ title: 'Alpha Channel', channelId: 'UCaaaaaaaaaaaaaaaaaaaaaaa', url: 'https://www.youtube.com/channel/UCaaaaaaaaaaaaaaaaaaaaaaa' }),
  sub({ title: 'Beta 放送局 📺', channelId: 'UCbbbbbbbbbbbbbbbbbbbbbbb', url: 'https://www.youtube.com/channel/UCbbbbbbbbbbbbbbbbbbbbbbb' }),
];

const tricky: Subscription[] = [
  sub({
    title: 'Rock, Paper & "Scissors"',
    channelId: 'UCccccccccccccccccccccccc',
    url: 'https://www.youtube.com/channel/UCccccccccccccccccccccccc',
  }),
  sub({
    title: 'Line1\nLine2 <tag> 🎬 [wrap] (paren)',
    channelId: 'UCddddddddddddddddddddddd',
    url: 'https://www.youtube.com/channel/UCddddddddddddddddddddddd',
  }),
];

describe('toText', () => {
  it('チャンネル名のみを1行1件、\\n 区切りで出力する', () => {
    expect(toText(simple)).toBe('Alpha Channel\nBeta 放送局 📺');
  });

  it('0件は空文字列', () => {
    expect(toText([])).toBe('');
  });

  it('改行を含む名前もそのまま(Text は生値)', () => {
    expect(toText([tricky[1]])).toBe('Line1\nLine2 <tag> 🎬 [wrap] (paren)');
  });
});

describe('toCsv', () => {
  it('BOM 付き、ヘッダ行、CRLF 区切り', () => {
    const out = toCsv(simple);
    expect(out.charCodeAt(0)).toBe(0xfeff); // BOM
    const body = out.slice(1);
    expect(body.split('\r\n')[0]).toBe('title,channelId,url');
    expect(body.split('\r\n').length).toBe(3); // header + 2 rows
  });

  it('RFC 4180: カンマ・引用符・改行を含む値をクォート、" は "" に', () => {
    const out = toCsv(tricky).slice(1); // BOM 除去
    const lines = out.split('\r\n');
    // "Rock, Paper & ""Scissors""" のようにクォート & エスケープされる
    expect(lines[1]).toContain('"Rock, Paper & ""Scissors"""');
    // 改行を含む値はクォートで囲まれ、値の中に生の改行(\n)を保持
    expect(lines[2]).toContain('"Line1\nLine2 <tag> 🎬 [wrap] (paren)"');
  });

  it('& や絵文字はエスケープ対象外(そのまま)', () => {
    const out = toCsv([sub({ title: 'A & B 🎉' })]).slice(1);
    const dataLine = out.split('\r\n')[1];
    expect(dataLine.startsWith('A & B 🎉,')).toBe(true);
  });

  it('0件でも BOM とヘッダ行は出る', () => {
    const out = toCsv([]);
    expect(out.charCodeAt(0)).toBe(0xfeff);
    expect(out.slice(1)).toBe('title,channelId,url');
  });
});

describe('toMarkdown', () => {
  it('- [name](url) 形式', () => {
    expect(toMarkdown([simple[0]])).toBe(
      '- [Alpha Channel](https://www.youtube.com/channel/UCaaaaaaaaaaaaaaaaaaaaaaa)',
    );
  });

  it('名前中の [ ] ( ) をエスケープ', () => {
    const out = toMarkdown([sub({ title: '[Live] (2024)' })]);
    expect(out).toContain('- [\\[Live\\] \\(2024\\)](');
  });

  it('0件は空文字列', () => {
    expect(toMarkdown([])).toBe('');
  });
});

describe('toJson', () => {
  it('Subscription[] を 2 スペース整形でそのまま出力', () => {
    const out = toJson(simple);
    expect(out).toBe(JSON.stringify(simple, null, 2));
    expect(JSON.parse(out)).toEqual(simple);
  });

  it('0件は []', () => {
    expect(toJson([])).toBe('[]');
  });
});

describe('toOpml', () => {
  it('ルート構造と outline を含む', () => {
    const out = toOpml(simple);
    expect(out).toContain('<?xml version="1.0" encoding="UTF-8"?>');
    expect(out).toContain('<opml version="1.0">');
    expect(out).toContain('<head><title>channelist export</title></head>');
    expect(out).toContain(
      'xmlUrl="https://www.youtube.com/feeds/videos.xml?channel_id=UCaaaaaaaaaaaaaaaaaaaaaaa"',
    );
  });

  it('XML 特殊文字 & < > " \' をエスケープ', () => {
    const out = toOpml([
      sub({ title: `A & B <c> "d" 'e'`, channelId: 'UCeeeeeeeeeeeeeeeeeeeeeee' }),
    ]);
    expect(out).toContain('text="A &amp; B &lt;c&gt; &quot;d&quot; &apos;e&apos;"');
    // 生の特殊文字が属性値に残っていないこと(壊れた XML を防ぐ)
    expect(out).not.toContain('text="A & B');
  });

  it('絵文字はそのまま保持', () => {
    const out = toOpml([sub({ title: 'Emoji 📺' })]);
    expect(out).toContain('text="Emoji 📺"');
  });

  it('0件でも valid な空 OPML を返す', () => {
    const out = toOpml([]);
    expect(out).toContain('<opml version="1.0">');
    expect(out).toContain('<body>');
    expect(out).toContain('</body>');
    expect(out).not.toContain('<outline');
  });
});

describe('formatSubscriptions / FORMATTERS', () => {
  it('各フォーマットにディスパッチする', () => {
    expect(formatSubscriptions(simple, 'text')).toBe(toText(simple));
    expect(formatSubscriptions(simple, 'csv')).toBe(toCsv(simple));
    expect(formatSubscriptions(simple, 'markdown')).toBe(toMarkdown(simple));
    expect(formatSubscriptions(simple, 'json')).toBe(toJson(simple));
    expect(formatSubscriptions(simple, 'opml')).toBe(toOpml(simple));
  });

  it('拡張子メタが正しい', () => {
    expect(FORMATTERS.text.extension).toBe('txt');
    expect(FORMATTERS.csv.extension).toBe('csv');
    expect(FORMATTERS.markdown.extension).toBe('md');
    expect(FORMATTERS.json.extension).toBe('json');
    expect(FORMATTERS.opml.extension).toBe('opml');
  });
});
