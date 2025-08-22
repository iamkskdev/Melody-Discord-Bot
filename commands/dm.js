const { SlashCommandBuilder } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('dm')
    .setDescription('📩 Send a direct message to someone')
    .addUserOption(option =>
      option.setName('user')
        .setDescription('The user to DM')
        .setRequired(true)
    )
    .addStringOption(option =>
      option.setName('message')
        .setDescription('Message content')
        .setRequired(true)
    ),

  async execute(interaction) {
    const targetUser = interaction.options.getUser('user');
    const messageContent = interaction.options.getString('message');

    if (targetUser.bot) {
      return interaction.reply({
        content: '🤖 I can’t DM other bots.',
        ephemeral: true
      });
    }

    try {
      await targetUser.send(messageContent);
      await interaction.reply({
        content: `✅ Message sent to ${targetUser.tag}`,
        ephemeral: true
      });
    } catch (error) {
      console.error(`❌ DM failed to ${targetUser.tag}:`, error);
      await interaction.reply({
        content: `❌ I couldn’t send a DM to ${targetUser.tag}. They may have DMs disabled.`,
        ephemeral: true
      });
    }
  }
};
