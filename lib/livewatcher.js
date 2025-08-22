const cheerio = require('cheerio');
const fetch = (...args) => import('node-fetch').then(({ default: f }) => f(...args));

const ALERT_CHANNEL_ID = process.env.ALERT_CHANNEL_ID;
const ALERT_ROLE_ID = process.env.ALERT_ROLE_ID;
const YOUTUBE_CHANNEL_URL = process.env.YOUTUBE_CHANNEL_URL;
const POLL_INTERVAL_MS = Number(process.env.POLL_INTERVAL_MS || 90000);

let lastLiveVideoId = null;
let lastAlertMessageId = null;
let lastSeenLive = false;

function normalizeChannelUrl(url) {
  return (url || '').replace(/\/+$/, '');
}

async function safeGetHtml(url) {
  try {
    const res = await fetch(url, {
      headers: {
        'user-agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36',
        'accept-language': 'en',
      },
    });
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  }
}

function parseLiveFromStreamsTab(html) {
  if (!html) return null;
  const $ = cheerio.load(html);

  let liveVideo = null;
  $('a[href^="/watch"]').each((_, el) => {
    const link = $(el).attr('href') || '';
    const container = $(el).closest('ytd-grid-video-renderer, ytd-rich-item-renderer, ytd-video-renderer');
    const badgeText = container.text().toLowerCase();
    if (badgeText.includes('live')) {
      const params = new URLSearchParams(link.split('?')[1] || '');
      const videoId = params.get('v');
      const title =
        $(el).attr('title') ||
        container.find('#video-title').text()?.trim() ||
        'Live stream';
      if (videoId) {
        liveVideo = { videoId, title, url: `https://www.youtube.com/watch?v=${videoId}` };
        return false;
      }
    }
  });

  return liveVideo;
}

function parseLiveFromHome(html) {
  if (!html) return null;
  const $ = cheerio.load(html);

  // og:video:url sometimes points at the current watch page
  const ogVideo = $('meta[property="og:video:url"]').attr('content') || '';
  if (ogVideo.includes('/watch')) {
    try {
      const u = new URL(ogVideo);
      const videoId = u.searchParams.get('v');
      const lower = $.root().text().toLowerCase();
      if (videoId && lower.includes('live')) {
        const title = $('meta[property="og:title"]').attr('content') || 'Live stream';
        return { videoId, title, url: `https://www.youtube.com/watch?v=${videoId}` };
      }
    } catch {}
  }

  // Fallback scan for watch links near "live" context
  let candidate = null;
  $('a[href^="/watch"]').each((_, el) => {
    const link = $(el).attr('href') || '';
    const params = new URLSearchParams(link.split('?')[1] || '');
    const videoId = params.get('v');
    const container = $(el).closest('ytd-rich-item-renderer, ytd-video-renderer, ytd-grid-video-renderer');
    const text = container.text().toLowerCase();
    if (videoId && text.includes('live')) {
      const title =
        $(el).attr('title') ||
        container.find('#video-title').text()?.trim() ||
        'Live stream';
      candidate = { videoId, title, url: `https://www.youtube.com/watch?v=${videoId}` };
      return false;
    }
  });

  return candidate;
}

async function fetchChannelLive() {
  if (!YOUTUBE_CHANNEL_URL) return null;
  const base = normalizeChannelUrl(YOUTUBE_CHANNEL_URL);

  const streamsHtml = await safeGetHtml(`${base}/streams`);
  const liveA = parseLiveFromStreamsTab(streamsHtml);
  if (liveA) return liveA;

  const homeHtml = await safeGetHtml(base);
  return parseLiveFromHome(homeHtml);
}

async function postOrUpdateAlert(client, liveInfo) {
  const channel = await client.channels.fetch(ALERT_CHANNEL_ID).catch(() => null);
  if (!channel || !channel.isTextBased()) return;

  const content = `<@&${ALERT_ROLE_ID}> is live now: ${liveInfo.title}\n${liveInfo.url}`;
  if (lastAlertMessageId) {
    const msg = await channel.messages.fetch(lastAlertMessageId).catch(() => null);
    if (msg) {
      await msg.edit({ content, allowedMentions: { roles: [ALERT_ROLE_ID], parse: [] } });
      return;
    }
  }
  const sent = await channel.send({ content, allowedMentions: { roles: [ALERT_ROLE_ID], parse: [] } });
  lastAlertMessageId = sent.id;
}

async function clearAlertIfAny(client) {
  if (!lastSeenLive) return;
  const channel = await client.channels.fetch(ALERT_CHANNEL_ID).catch(() => null);
  if (!channel || !channel.isTextBased()) return;

  // Option A: post an ended notice
  await channel.send('Stream ended.');
  // Option B: delete the alert instead:
  // if (lastAlertMessageId) await channel.messages.delete(lastAlertMessageId).catch(() => {});

  lastAlertMessageId = null;
}

async function tick(client) {
  try {
    const live = await fetchChannelLive();
    if (live) {
      if (live.videoId !== lastLiveVideoId) {
        await postOrUpdateAlert(client, live);
        lastLiveVideoId = live.videoId;
      }
      lastSeenLive = true;
    } else {
      if (lastSeenLive) await clearAlertIfAny(client);
      lastSeenLive = false;
      lastLiveVideoId = null;
    }
  } catch (e) {
    console.error('Livestream poll error:', e?.message || e);
  }
}

function startLiveWatcher(client) {
  if (!ALERT_CHANNEL_ID || !ALERT_ROLE_ID || !YOUTUBE_CHANNEL_URL) {
    console.log('Livestream watcher not started (missing env vars).');
    return;
  }
  // Immediate run, then interval
  tick(client);
  setInterval(() => tick(client), POLL_INTERVAL_MS);
  console.log('Livestream watcher started.');
}

module.exports = { startLiveWatcher };
