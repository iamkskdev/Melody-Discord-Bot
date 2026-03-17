# Melody Discord Bot 🎵

Melody is a modular Discord bot built with **Node.js** and **discord.js v14**.
It supports slash commands, modular command loading, DM forwarding, and a live stream watcher system.

The bot was designed to run in specific guilds and dynamically register slash commands during startup.

⚠️ **Note:** This project is no longer actively maintained and may not function correctly due to changes in the Discord API or dependency updates. It is kept here for **learning and portfolio purposes**.

---

# Features

• Modular command system
• Slash command support
• Automatic command registration per guild
• Voice channel interaction
• Direct message forwarding
• Livestream watcher integration
• Multi-guild support

---

# Commands

The bot loads commands dynamically from the `commands` folder.

Example commands included:

| Command   | Description                   |
| --------- | ----------------------------- |
| `/play`   | Play music in a voice channel |
| `/pause`  | Pause current playback        |
| `/resume` | Resume paused music           |
| `/skip`   | Skip the current track        |
| `/stop`   | Stop playback                 |
| `/ping`   | Check bot latency             |
| `/say`    | Make the bot send a message   |
| `/tag`    | Send predefined tag responses |
| `/dm`     | Send direct messages          |

---

# Project Structure

```
Melody-Discord-Bot
│
├── commands/            # Slash command modules
│   ├── dm.js
│   ├── pause.js
│   ├── ping.js
│   ├── play.js
│   ├── resume.js
│   ├── say.js
│   ├── skip.js
│   ├── stop.js
│   └── tag.js
│
├── lib/
│   └── livewatcher.js   # Livestream monitoring system
│
├── deploy-commands.js   # Command deployment script
├── queue.js             # Music queue management
├── index.js             # Main bot entry point
├── package.json
├── package-lock.json
└── .gitignore
```

---

# How It Works

### Command Loader

At startup the bot:

1. Reads all `.js` files inside the `commands` folder
2. Imports their command data and execution function
3. Registers them as slash commands in configured guilds

This makes the bot easily extendable by simply adding new command files.

---

### Slash Command Registration

Commands are registered using Discord's REST API:

```
Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID)
```

This allows fast updates without waiting for global command propagation.

---

### Live Stream Watcher

The bot includes a **live stream watcher system**:

```
startLiveWatcher(client)
```

This module can monitor external platforms and notify Discord servers when a stream goes live.

---

### DM Forwarding System

The bot can optionally forward user DMs to a specific server channel.

Environment variable required:

```
DM_FORWARD_CHANNEL_ID
```

When enabled:

• User sends DM to the bot
• Bot forwards the message to a configured moderation channel

---

# Environment Variables

Create a `.env` file with:

```
DISCORD_TOKEN=your_bot_token
CLIENT_ID=your_client_id
GUILD_ID=your_server_id

# Optional
GUILD_ID2=second_server_id
EXTRA_GUILD_IDS=id3,id4
DM_FORWARD_CHANNEL_ID=channel_id
```

---


---

# Technologies Used

• Node.js
• Discord.js v14
• dotenv
• JavaScript (ES6)

---

# Status

⚠️ This project is archived and may not work with the current Discord API.

---
