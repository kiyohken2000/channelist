import type { SubscriptionsResponse } from '../types';

/**
 * ランディングの「サンプルを見る」で使う架空の登録チャンネル。
 * - 外部リクエストを発生させないよう thumbnailUrl は空(画像共有では頭文字プレースホルダで描画)。
 * - publishedAt は名前順と登録順で並びが変わるようバラつかせている。
 * - 実在チャンネル/個人情報は含まない。
 */
export const SAMPLE_DATA: SubscriptionsResponse = {
  channelTitle: 'sample',
  totalResults: 6,
  subscriptions: [
    {
      title: 'Cosmic Cooking',
      channelId: 'UC0000000000000000sample1',
      url: 'https://www.youtube.com/channel/UC0000000000000000sample1',
      description: '宇宙一ゆるい料理チャンネル。週末は簡単レシピを配信します。',
      publishedAt: '2021-04-12T09:30:00Z',
      thumbnailUrl: '',
    },
    {
      title: 'ゲーム実況アオイ',
      channelId: 'UC0000000000000000sample2',
      url: 'https://www.youtube.com/channel/UC0000000000000000sample2',
      description: 'レトロから最新までまったり実況。',
      publishedAt: '2023-11-02T14:05:00Z',
      thumbnailUrl: '',
    },
    {
      title: 'Daily Dev Notes',
      channelId: 'UC0000000000000000sample3',
      url: 'https://www.youtube.com/channel/UC0000000000000000sample3',
      description: 'Web開発の小ネタを毎日ひとつ。',
      publishedAt: '2020-01-20T18:45:00Z',
      thumbnailUrl: '',
    },
    {
      title: '旅する猫と珈琲',
      channelId: 'UC0000000000000000sample4',
      url: 'https://www.youtube.com/channel/UC0000000000000000sample4',
      description: '猫と一緒に喫茶店を巡る癒し系Vlog。',
      publishedAt: '2024-06-18T07:10:00Z',
      thumbnailUrl: '',
    },
    {
      title: 'Nightside Music',
      channelId: 'UC0000000000000000sample5',
      url: 'https://www.youtube.com/channel/UC0000000000000000sample5',
      description: '作業用・睡眠用のローファイBGM。',
      publishedAt: '2022-08-30T22:00:00Z',
      thumbnailUrl: '',
    },
    {
      title: 'ものづくりラボ',
      channelId: 'UC0000000000000000sample6',
      url: 'https://www.youtube.com/channel/UC0000000000000000sample6',
      description: '電子工作と3Dプリンタで何かを作る記録。',
      publishedAt: '2019-05-05T12:00:00Z',
      thumbnailUrl: '',
    },
  ],
};
