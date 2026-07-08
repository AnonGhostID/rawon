import { type AudioPlayerPlayingState, AudioPlayerStatus } from "@discordjs/voice";
import { ApplyOptions } from "@sapphire/decorators";
import { type Command } from "@sapphire/framework";
import { type CommandContext, ContextCommand } from "@stegripe/command-context";
import { type GuildMember, PermissionFlagsBits, type SlashCommandBuilder } from "discord.js";
import i18n from "../../config/index.js";
import { type CommandContext as LocalCommandContext } from "../../structures/CommandContext.js";
import { type Rawon } from "../../structures/Rawon.js";
import { type QueueSong } from "../../typings/index.js";
import { haveQueue } from "../../utils/decorators/MusicUtil.js";
import { chunk } from "../../utils/functions/chunk.js";
import { createEmbed } from "../../utils/functions/createEmbed.js";
import { i18n__, i18n__mf } from "../../utils/functions/i18n.js";
import { formatDuration, normalizeTime } from "../../utils/functions/normalizeTime.js";
import { ButtonPagination } from "../../utils/structures/ButtonPagination.js";
import { type SongManager } from "../../utils/structures/SongManager.js";

@ApplyOptions<Command.Options>({
    name: "queue",
    aliases: ["q"],
    description: i18n.__("commands.music.queue.description"),
    detailedDescription: { usage: i18n.__("commands.music.queue.usage") },
    requiredClientPermissions: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.EmbedLinks,
    ],
    chatInputCommand(
        builder: Parameters<NonNullable<Command.Options["chatInputCommand"]>>[0],
        opts: Parameters<NonNullable<Command.Options["chatInputCommand"]>>[1],
    ): SlashCommandBuilder {
        return builder
            .setName(opts.name ?? "queue")
            .setDescription(opts.description ?? i18n.__("commands.music.queue.description"))
            .addSubcommand((sub) =>
                sub.setName("clear").setDescription(i18n.__("commands.music.queue.slashClear")),
            ) as SlashCommandBuilder;
    },
})
export class QueueCommand extends ContextCommand {
    private getClient(ctx: CommandContext): Rawon {
        return ctx.client as Rawon;
    }

    @haveQueue
    public async contextRun(ctx: CommandContext): Promise<void> {
        const client = this.getClient(ctx);
        const __ = i18n__(client, ctx.guild);
        const __mf = i18n__mf(client, ctx.guild);
        const localCtx = ctx as CommandContext & LocalCommandContext;
        const selection = localCtx.options?.getSubcommand() ?? localCtx.args[0];
        if (selection?.toLowerCase() === "clear") {
            const queue = ctx.guild?.queue;
            if (!queue) {
                return;
            }

            // Inline VC guard — only for the clear path (NOT method-level decorators)
            const member = ctx.member as GuildMember | null;
            if (
                !member?.voice.channel ||
                member.voice.channel.id !== queue.connection?.joinConfig.channelId
            ) {
                await ctx.reply({
                    embeds: [createEmbed("warn", __("utils.musicDecorator.noInVC"))],
                });
                return;
            }

            // Guard: only clear when player is actively playing (Idle/Paused would lose current song key)
            if (queue.player.state.status !== AudioPlayerStatus.Playing) {
                await ctx.reply({
                    embeds: [createEmbed("warn", __("utils.musicDecorator.notPlaying"))],
                });
                return;
            }

            const currentSongKey = (queue.player.state as AudioPlayerPlayingState).resource
                .metadata as QueueSong | undefined;

            // Delete all songs except the currently playing one
            queue.songs.forEach((_, key) => {
                if (key !== currentSongKey?.key) {
                    queue.songs.delete(key); // SongManager.delete auto-saves queue state
                }
            });

            queue.setAutoPlay(false);
            void queue.saveState();

            await ctx.reply({
                embeds: [
                    createEmbed("success", `🧹 **|** ${__("commands.music.queue.queueCleared")}`),
                ],
            });
            return;
        }

        const np = (ctx.guild?.queue?.player.state as AudioPlayerPlayingState).resource
            .metadata as QueueSong;
        const full = ctx.guild?.queue?.songs.sortByIndex() as SongManager;
        const songs =
            ctx.guild?.queue?.loopMode === "QUEUE"
                ? full
                : full.filter((val) => val.index >= np.index);
        const queue = ctx.guild?.queue;
        const totalDuration = [...songs.values()].reduce(
            (acc, s) => acc + (s.song.isLive ? 0 : s.song.duration),
            0,
        );
        const totalSongs = songs.size;

        const formatSongDuration = (song: QueueSong): string =>
            song.song.isLive ? "LIVE" : normalizeTime(song.song.duration);
        const formatTrackInfo = (song: QueueSong): string =>
            song.requester.user.bot
                ? `\`${formatSongDuration(song)}\` | 🎵 Mode Autoplay`
                : __mf("commands.music.queue.trackInfo", {
                      duration: formatSongDuration(song),
                      requester: song.requester.toString(),
                  });

        // Build now-playing line (always shown on page 1)
        const nowPlayingLine = `### ▶ ${__("commands.music.queue.nowPlaying")}\n[${np.song.title}](${np.song.url})\n${formatTrackInfo(np)}`;

        // Upcoming songs with their actual position in the songs array (matches ?skipto numbering)
        const songsArray = [...songs.values()];
        const upcomingWithPos = songsArray
            .map((song, idx) => ({ song, pos: idx + 1 }))
            .filter(({ song }) => song.key !== np.key);
        const pages = chunk(upcomingWithPos, 7).map((items, ind) => {
            const names = items.map(({ song, pos }) => {
                return `\`#${pos}\` **[${song.song.title}](${song.song.url})**\n${formatTrackInfo(song)}`;
            });

            if (ind === 0) {
                return `${nowPlayingLine}\n\n### ${__("commands.music.queue.upNext")}\n${names.join("\n\n")}`;
            }
            return names.join("\n\n");
        });
        // Edge case: no upcoming songs — show only the now-playing section
        if (pages.length === 0) {
            pages.push(nowPlayingLine);
        }

        const embed = createEmbed("info", pages[0])
            .setTitle(`📋 ${__("requestChannel.queueListTitle")}`)
            .setThumbnail(
                (np.song.thumbnail?.length ?? 0) > 0
                    ? np.song.thumbnail
                    : (ctx.guild?.iconURL({ extension: "png", size: 1_024 }) ?? null),
            );
        const msg = await ctx.reply({ embeds: [embed] });

        const loopModeEmoji: Record<string, string> = {
            OFF: "▶️",
            SONG: "🔂",
            QUEUE: "🔁",
        };
        const loopEmoji = loopModeEmoji[queue?.loopMode ?? "OFF"] ?? "▶️";
        const shuffleState = queue?.shuffle ? "ON" : "OFF";

        return new ButtonPagination(msg, {
            author: ctx.author.id,
            edit: (i, emb, page) =>
                emb
                    .setDescription(page)
                    .setFooter({
                        text: `• ${__mf("commands.music.queue.queueStats", {
                            count: totalSongs,
                            duration: formatDuration(totalDuration),
                        })} • ${__mf("reusable.pageFooter", {
                            actual: i + 1,
                            total: pages.length,
                        })}`,
                    })
                    .setFields([
                        {
                            name: __("requestChannel.status"),
                            value: `${loopEmoji} ${queue?.loopMode ?? "OFF"}`,
                            inline: true,
                        },
                        {
                            name: __("requestChannel.shuffle"),
                            value: `🔀 ${shuffleState}`,
                            inline: true,
                        },
                        {
                            name: __("requestChannel.volume"),
                            value: `🔊 ${queue?.volume ?? 100}%`,
                            inline: true,
                        },
                    ]),
            embed,
            pages,
        }).start();
    }
}
