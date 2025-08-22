const { SlashCommandBuilder } = require('discord.js');
const { getVoiceConnection } = require('@discordjs/voice');
const { getQueue } = require('../lib/music'); // ensure lib/music exports getQueue

module.exports = {
  data: new SlashCommandBuilder()
    .setName('stop')
    .setDescription('Stop playback, clear the queue, and disconnect'),
  async execute(interaction) {
    const guildId = interaction.guildId;

    // Optional guard: require caller to be in a voice channel
    const inVc = interaction.member?.voice?.channel;
    if (!inVc) {
      return interaction.reply({ content: 'Join a voice channel to use this.', flags: 64 });
    }

    const q = getQueue(guildId);

    try {
      if (q) {
        q.songs = [];
        q.player?.stop(true);
      }
      getVoiceConnection(guildId)?.destroy();
      return interaction.reply('Stopped and cleared the queue.');
    } catch (e) {
      console.error('Stop error:', e);
      return interaction.reply({ content: 'Failed to stop playback.', flags: 64 });
    }
  },
};
