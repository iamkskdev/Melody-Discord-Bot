const { SlashCommandBuilder } = require('discord.js');
const {
  joinVoiceChannel,
  getVoiceConnection,
  createAudioResource,
  AudioPlayerStatus,
  demuxProbe,
} = require('@discordjs/voice');
const ytdl = require('ytdl-core'); // install as: ytdl-core@npm:@distube/ytdl-core
const yts = require('yt-search');

// If you already have these helpers in ./lib/music.js, you can import from there instead.
// For convenience, this file includes its own small helpers and uses a simple per-guild queue Map.
const queues = require('../lib/queues'); // optional: if you centralize queues, otherwise use local map

// Fallback local queue if you don't have ../lib/queues.
// Comment this out if you provide queues from lib.
// const queues = new Map(); // guildId -> { songs: [], player, connection, textChannelId, idleTimer, _wired }

function getQueue(guildId) {
  return queues.get(guildId);
}
function ensureQueue(guildId, createAudioPlayer) {
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

function isUrl(text) {
  try {
    const u = new URL(text);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}

async function resolveInputToTrack(input) {
  // Try direct URL first
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

async function playNext(client, guildId) {
  const q = getQueue(guildId);
  if (!q) return;

  // Clear idle timer
  if (q.idleTimer) {
    clearTimeout(q.idleTimer);
    q.idleTimer = null;
  }

  const next = q.songs[0];
  if (!next) {
    // Leave after 5 minutes idle
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
    // Build stream with ytdl (switch to yt-dlp pipeline if ytdl fails in your environment)
    const stream = ytdl(next.url, {
      filter: 'audioonly',
      quality: 'highestaudio',
      highWaterMark: 1 << 25,
      dlChunkSize: 0,
    });
    stream.on('error', e => console.error('ytdl stream error:', e));

    // Probe to set correct inputType
    const { stream: probed, type } = await demuxProbe(stream);
    const resource = createAudioResource(probed, { inputType: type, inlineVolume: true });
    resource.volume?.setVolume(0.9);

    q.player.play(resource);

    if (q.textChannelId) {
      const ch = await awaitSafeFetchChannel(client, q.textChannelId);
      ch?.send(`Now playing: ${next.title || next.url}`);
    }
  } catch (e) {
    console.error('Stream start error:', e);
    q.songs.shift();
    const ch = q.textChannelId ? await awaitSafeFetchChannel(client, q.textChannelId) : null;
    ch?.send(`Failed to play: ${next.title || next.url}. Skipping.`);
    return playNext(client, guildId);
  }
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('play')
    .setDescription('Play audio from a YouTube URL or a search query')
    .addStringOption(o =>
      o.setName('input').setDescription('YouTube URL or search query').setRequired(true)
    ),
  async execute(interaction) {
    const { client } = interaction;
    // Lazily require here to avoid circular require if you centralize createAudioPlayer elsewhere
    const { createAudioPlayer } = require('@discordjs/voice');

    await interaction.deferReply();

    const vc = interaction.member?.voice?.channel;
    if (!vc) {
      return interaction.editReply('Join a voice channel first.');
    }

    const input = interaction.options.getString('input', true);

    // Resolve URL or query to a track
    let track;
    try {
      track = await resolveInputToTrack(input);
    } catch (e) {
      console.error('resolveInputToTrack error:', e);
      return interaction.editReply('Could not find a playable result for that input.');
    }

    const guildId = interaction.guildId;
    const q = ensureQueue(guildId, createAudioPlayer);

    // Wire player events once per queue
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

    // Save text channel for announcements
    q.textChannelId = interaction.channelId;

    // Connect if needed
    if (!q.connection || getVoiceConnection(guildId) == null) {
      q.connection = joinVoiceChannel({
        channelId: vc.id,
        guildId,
        adapterCreator: interaction.guild.voiceAdapterCreator,
        selfDeaf: true,
      });
      if (!q._subscribed) {
        q.connection.subscribe(q.player);
        q._subscribed = true;
      }
    }

    // Enqueue and start if first
    q.songs.push({ url: track.url, title: track.title });
    const first = q.songs.length === 1;

    await interaction.editReply(first ? `Queued and starting: ${track.title}` : `Queued: ${track.title}`);

    if (first) {
      await playNext(client, guildId);
    }
  },
};
