const {
  joinVoiceChannel,
  createAudioPlayer,
  createAudioResource,
  AudioPlayerStatus,
  getVoiceConnection,
  demuxProbe,
} = require('@discordjs/voice');

const ytdl = require('ytdl-core'); // install as: ytdl-core@npm:@distube/ytdl-core
const yts = require('yt-search');

// If you later switch to yt-dlp, uncomment these and see the pipeline in playNext (below):
// const ytdlp = require('yt-dlp-exec');
// const prism = require('prism-media');

const queues = require('./queues')

/* ------------- queue helpers ------------- */
function getQueue(guildId) {
  return queues.get(guildId);
}

function ensureQueue(guildId) {
  if (!queues.has(guildId)) {
    queues.set(guildId, {
      songs: [],
      player: createAudioPlayer(),
      connection: null,
      textChannelId: null,
      idleTimer: null,
      _wired: false,
      _subscribed: false,
    });
  }
  return queues.get(guildId);
}

/* ------------- utils ------------- */
function isUrl(text) {
  try {
    const u = new URL(text);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}

async function resolveInputToTrack(input) {
  // Try direct URL
  if (isUrl(input)) {
    try {
      const info = await ytdl.getInfo(input);
      const url = info?.videoDetails?.video_url;
      const title = info?.videoDetails?.title;
      if (!url || typeof url !== 'string') throw new Error('Invalid URL from getInfo');
      return { url, title: title || url };
    } catch {
      // fall through to search
    }
  }

  // Search query
  const res = await yts(input);
  const vid = res && Array.isArray(res.videos) ? res.videos[0] : null;
  if (!vid || !vid.url) throw new Error('No playable search result');
  return { url: vid.url, title: vid.title || vid.url };
}

async function awaitSafeFetchChannel(client, id) {
  try {
    return await client.channels.fetch(id);
  } catch {
    return null;
  }
}

/* ------------- playback core ------------- */
async function playNext(client, guildId) {
  const q = getQueue(guildId);
  if (!q) return;

  // Clear idle timer
  if (q.idleTimer) {
    clearTimeout(q.idleTimer);
    q.idleTimer = null;
  }

  const next = q.songs;
  if (!next) {
    // Leave after 5 minutes idle to free resources
    q.idleTimer = setTimeout(() => {
      getVoiceConnection(guildId)?.destroy();
      queues.delete(guildId);
    }, 5 * 60 * 1000);
    return;
  }

  // Validate URL
  if (!next.url || typeof next.url !== 'string' || !/^https?:\/\//i.test(next.url)) {
    const ch = q.textChannelId ? await awaitSafeFetchChannel(client, q.textChannelId) : null;
    ch?.send(`Invalid track URL. Skipping: ${next.title ?? '(unknown)'}`);
    q.songs.shift();
    return playNext(client, guildId);
  }

  try {
    // ---------------- ytdl path (simple, no FFmpeg needed if Opus is served) ----------------
    const stream = ytdl(next.url, {
      filter: 'audioonly',
      quality: 'highestaudio',
      highWaterMark: 1 << 25,
      dlChunkSize: 0,
    });
    stream.on('error', e => console.error('ytdl stream error:', e));

    const { stream: probed, type } = await demuxProbe(stream);
    const resource = createAudioResource(probed, { inputType: type, inlineVolume: true });
    resource.volume?.setVolume(0.9);

    // Wire events once per queue
    if (!q._wired) {
      q.player.on(AudioPlayerStatus.Idle, async () => {
        if (q.songs.length) q.songs.shift();
        await playNext(client, guildId);
      });
      q.player.on('error', async (e) => {
        console.error('Player error:', e);
        if (q.songs.length) q.songs.shift();
        await playNext(client, guildId);
      });
      q._wired = true;
    }

    q.player.play(resource);

    if (q.textChannelId) {
      const ch = await awaitSafeFetchChannel(client, q.textChannelId);
      ch?.send(`Now playing: ${next.title || next.url}`);
    }

    return;

    // ---------------- yt-dlp + FFmpeg pipeline (more robust) ----------------
    // If ytdl fails with 403/decipher issues, replace the block above with the following:

    /*
    const { stream: opusStream, cleanup } = await makeAudioStream(next.url);
    const resource = createAudioResource(opusStream, { inlineVolume: true });
    resource.volume?.setVolume(0.9);

    if (!q._wired) {
      q.player.on(AudioPlayerStatus.Idle, async () => {
        cleanup();
        if (q.songs.length) q.songs.shift();
        await playNext(client, guildId);
      });
      q.player.on('error', async (e) => {
        console.error('Player error:', e);
        cleanup();
        if (q.songs.length) q.songs.shift();
        await playNext(client, guildId);
      });
      q._wired = true;
    }

    q.player.play(resource);

    if (q.textChannelId) {
      const ch = await awaitSafeFetchChannel(client, q.textChannelId);
      ch?.send(`Now playing: ${next.title || next.url}`);
    }
    */

  } catch (e) {
    console.error('Stream start error:', e);
    q.songs.shift();
    const ch = q.textChannelId ? await awaitSafeFetchChannel(client, q.textChannelId) : null;
    ch?.send(`Failed to play: ${next.title || next.url}. Skipping.`);
    return playNext(client, guildId);
  }
}

/* If you switch to yt-dlp, include this helper and uncomment the imports above.
async function makeAudioStream(url) {
  const proc = ytdlp.raw(
    [url, '-f', 'bestaudio/best', '-o', '-', '--quiet', '--no-warnings', '--no-call-home'],
    { shell: true }
  );

  const ffmpeg = new prism.FFmpeg({
    args: [
      '-analyzeduration','0',
      '-loglevel','0',
      '-i','pipe:0',
      '-f','s16le','-ar','48000','-ac','2'
    ],
  });

  const opus = new prism.opus.Encoder({ rate: 48000, channels: 2, frameSize: 960 });

  proc.stdout.pipe(ffmpeg).pipe(opus);

  proc.stderr?.on('data', d => console.error('yt-dlp:', d.toString()));
  for (const s of [proc.stdout, ffmpeg, opus]) {
    s.on('error', e => console.error('audio pipe error:', e));
  }

  const cleanup = () => {
    try { proc.kill?.(); } catch {}
    try { ffmpeg.destroy?.(); } catch {}
    try { opus.destroy?.(); } catch {}
  };

  return { stream: opus, cleanup };
}
*/

module.exports = {
  queues,
  getQueue,
  ensureQueue,
  resolveInputToTrack,
  awaitSafeFetchChannel,
  playNext,
  isUrl,
};
