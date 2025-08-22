require('dotenv').config();

const fs = require('fs');
const path = require('path');
const {
  Client,
  GatewayIntentBits,
  REST,
  Routes,
  Events,
} = require('discord.js');

const { startLiveWatcher } = require('./lib/livewatcher');

const DISCORD_TOKEN = process.env.DISCORD_TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const GUILD_ID = process.env.GUILD_ID;          // primary guild
const GUILD_ID2 = process.env.GUILD_ID2 || '';  // optional second guild
const EXTRA_GUILD_IDS = process.env.EXTRA_GUILD_IDS || ''; // optional: "id3,id4"

if (!DISCORD_TOKEN || !CLIENT_ID || !GUILD_ID) {
  console.error('Missing env vars: DISCORD_TOKEN, CLIENT_ID, GUILD_ID');
  process.exit(1);
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.GuildMessages,  // for /say and forwarding
    GatewayIntentBits.DirectMessages, // for DM forwarding (optional)
    GatewayIntentBits.MessageContent, // optional (helps with message content in some setups)
  ],
  partials: ['CHANNEL'], // required to receive DMs
});

async function loadCommandModules() {
  const commandsPath = path.join(__dirname, 'commands');
  if (!fs.existsSync(commandsPath)) {
    console.warn('No ./commands folder found. Create it and add command files.');
    return [];
  }
  const files = fs.readdirSync(commandsPath).filter(f => f.endsWith('.js'));
  const modules = [];
  for (const file of files) {
    const full = path.join(commandsPath, file);
    try {
      const mod = require(full);
      if (!mod?.data || !mod?.execute) {
        console.warn(`Skipping ${file}: missing data or execute export`);
        continue;
      }
      modules.push(mod);
    } catch (e) {
      console.error(`Failed to load ${file}:`, e);
    }
  }
  return modules;
}

async function registerAllCommands(modules) {
  const rest = new REST({ version: '10' }).setToken(DISCORD_TOKEN);
  const body = modules.map(m => m.data.toJSON());

  // Collect guild IDs: primary + optional second + any extras
  const guildIds = [GUILD_ID, GUILD_ID2, ...EXTRA_GUILD_IDS.split(',')]
    .map(s => s && s.trim())
    .filter(Boolean);

  if (guildIds.length === 0) {
    console.error('No guild IDs provided for registration.');
    process.exit(1);
  }

  await Promise.all(
    guildIds.map(id =>
      rest.put(Routes.applicationGuildCommands(CLIENT_ID, id), { body })
    )
  );
  console.log('Registered guild commands for:', guildIds.join(', '));

  // If you prefer to also register globally (slow propagation), uncomment:
  // await rest.put(Routes.applicationCommands(CLIENT_ID), { body });
  // console.log('Registered GLOBAL commands');
}

client.once(Events.ClientReady, async () => {
  console.log(`Logged in as ${client.user.tag}`);

  // Load and register commands
  const modules = await loadCommandModules();
  client.commands = new Map(modules.map(m => [m.data.name, m]));
  await registerAllCommands(modules);

  // Start your livestream watcher
  startLiveWatcher(client);

  console.log('Bot initialization complete.');
});

client.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  const cmd = client.commands?.get(interaction.commandName);
  if (!cmd) {
    return interaction.reply({ content: 'Command not found.', flags: 64 }); // ephemeral
  }

  // Shared context passed to commands; extend as needed
  const context = { client };

  try {
    await cmd.execute(interaction, context);
  } catch (e) {
    console.error(`Error in /${interaction.commandName}:`, e);
    if (!interaction.deferred && !interaction.replied) {
      await interaction.reply({ content: 'There was an error executing this command.', flags: 64 });
    }
  }
});

// Optional: DM forwarding to a specific channel (set DM_FORWARD_CHANNEL_ID in .env)
client.on(Events.MessageCreate, async (message) => {
  try {
    if (message.author?.bot) return;
    if (message.guild) return; // only DMs

    const forwardChannelId = process.env.DM_FORWARD_CHANNEL_ID;
    if (!forwardChannelId) return;

    const forwardChannel = await client.channels.fetch(forwardChannelId).catch(() => null);
    if (!forwardChannel || !forwardChannel.isTextBased()) return;

    const authorTag = `${message.author.tag} (${message.author.id})`;
    const body = (message.content || '(no text)').slice(0, 1900);
    const files = [...message.attachments.values()].map(a => ({ attachment: a.url, name: a.name }));

    await forwardChannel.send({
      content: `New DM to Melody from ${authorTag}\n\n${body}`,
      files: files.slice(0, 5),
      allowedMentions: { parse: [] },
    });
  } catch (e) {
    console.error('DM forward error:', e);
  }
});

client.login(DISCORD_TOKEN);
