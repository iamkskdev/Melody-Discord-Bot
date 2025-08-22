const { SlashCommandBuilder } = require('discord.js');
const { getQueue } = require('../lib/music'); // ensure ../lib/music exports getQueue

module.exports = {
  data: new SlashCommandBuilder()
    .setName('resume')
    .setDescription('Resume playback'),
  async execute(interaction) {
    // Optional: require the user to be in a voice channel
    const inVc = interaction.member?.voice?.channel;
    if (!inVc) {
      return interaction.reply({ content: 'Join a voice channel to use this.', flags: 64 });
    }

    const q = getQueue(interaction.guildId);
    if (!q || !q.player) {
      return interaction.reply({ content: 'Nothing to resume.', flags: 64 });
    }

    const ok = q.player.unpause();
    if (!ok) {
      return interaction.reply({ content: 'Nothing to resume.', flags: 64 });
    }

    return interaction.reply('Resumed.');
  },
};
