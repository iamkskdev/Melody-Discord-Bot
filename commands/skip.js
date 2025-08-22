const { SlashCommandBuilder } = require('discord.js');
const { getQueue } = require('../lib/music'); // make sure lib/music exports getQueue

module.exports = {
  data: new SlashCommandBuilder()
    .setName('skip')
    .setDescription('Skip the current track'),
  async execute(interaction) {
    const q = getQueue(interaction.guildId);

    // Must be in a voice channel (optional guard)
    const inVc = interaction.member?.voice?.channel;
    if (!inVc) {
      return interaction.reply({ content: 'Join a voice channel to use this.', flags: 64 });
    }

    if (!q || !q.songs?.length) {
      return interaction.reply({ content: 'Queue is empty.', flags: 64 });
    }

    // Stopping triggers Idle -> your Idle handler should shift and play next
    try {
      q.player.stop(true);
      return interaction.reply('Skipped.');
    } catch (e) {
      console.error('Skip error:', e);
      return interaction.reply({ content: 'Could not skip right now.', flags: 64 });
    }
  },
};
