const {
  SlashCommandBuilder,
  ChannelType,
  PermissionsBitField
} = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('say')
    .setDescription('📢 Make the bot send a message to a selected channel')
    .addChannelOption(option =>
      option.setName('channel')
        .setDescription('Target text channel')
        .addChannelTypes(ChannelType.GuildText) // Prevent selection of voice/DM channels
        .setRequired(true)
    )
    .addStringOption(option =>
      option.setName('text')
        .setDescription('The message to send')
        .setRequired(true)
    ),

  async execute(interaction) {
    const targetChannel = interaction.options.getChannel('channel');
    const message = interaction.options.getString('text');
    const member = interaction.member;

    // Optional: Restrict usage to admins
    if (!member.permissions.has(PermissionsBitField.Flags.Administrator)) {
      return await interaction.reply({
        content: '❌ You must be an administrator to use this command.',
        ephemeral: true
      });
    }

    // Confirm bot has access to send messages in the selected channel
    const botPermissions = targetChannel.permissionsFor(interaction.client.user);
    if (!botPermissions || !botPermissions.has(PermissionsBitField.Flags.SendMessages)) {
      return await interaction.reply({
        content: '🚫 I can’t send messages in that channel.',
        ephemeral: true
      });
    }

    await targetChannel.send(message);
    await interaction.reply({
      content: `✅ Message sent to <#${targetChannel.id}>`,
      ephemeral: true
    });
  }
};
