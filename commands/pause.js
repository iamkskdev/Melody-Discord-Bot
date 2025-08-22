const { SlashCommandBuilder } = require('discord.js');
const { getQueue } = require('../lib/music'); // ensure ../lib/music exports getQueue

module.exports = {
  data: new SlashCommandBuilder()
    .setName('pause')
    .setDescription('Pause playback'),
  async execute(interaction) {
    // Optional: require the user to be in a voice channel
    const inVc = interaction.member?.voice?.channel;
    if (!inVc) {
      return interaction.reply({ content: 'Join a voice channel to use this.', flags: 64 });
    }

    const q = getQueue(interaction.guildId);
    if (!q || !q.player) {
      return interaction.reply({ content: 'Nothing is playing.', flags: 64 });
    }

    const ok = q.player.pause(true);
    if (!ok) {
      return interaction.reply({ content: 'Nothing is playing or it is already paused.', flags: 64 });
    }

    return interaction.reply('Paused.');
  },
};
