


const { SlashCommandBuilder } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('tag')
    .setDescription('🔔 Tag a user multiple times, sending one message per tag')
    .addUserOption(option =>
      option.setName('user')
        .setDescription('Who to tag')
        .setRequired(true)
    )
    .addIntegerOption(option =>
      option.setName('count')
        .setDescription('How many times to tag them')
        .setRequired(true)
    ),

  async execute(interaction) {
    const user = interaction.options.getUser('user');
    const count = interaction.options.getInteger('count');
    const channel = interaction.channel;

    await interaction.reply({
      content: `🎯 Tagging ${user} ${count} time(s)...`,
      ephemeral: true
    });

    for (let i = 0; i < count; i++) {
      interaction.channel.send({
        content: `${user}`,
        allowedMentions: { users: [user.id] }
      });
    }
  }
};
