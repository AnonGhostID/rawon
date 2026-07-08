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
        const pages = chunk([...songs.values()], 10).map((sngs, ind) => {
            const names = sngs.map((song, i) => {
                const npKey = np.key;
                const addition = song.key === npKey ? "**" : "";

                return `${addition}${ind * 10 + (i + 1)} - [${song.song.title}](${song.song.url})${addition}`;
            });

            return names.join("\n");
        });
        const embed = createEmbed("info", pages[0])
            .setTitle(`📋 ${__("requestChannel.queueListTitle")}`)
            .setThumbnail(ctx.guild?.iconURL({ extension: "png", size: 1_024 }) ?? null);
        const msg = await ctx.reply({ embeds: [embed] });

        return new ButtonPagination(msg, {
            author: ctx.author.id,
            edit: (i, emb, page) =>
                emb.setDescription(page).setFooter({
                    text: `• ${__mf("reusable.pageFooter", {
                        actual: i + 1,
                        total: pages.length,
                    })}`,
                }),
            embed,
            pages,
        }).start();
    }
}
