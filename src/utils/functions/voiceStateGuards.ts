import { type GuildMember } from "discord.js";

export function isVoiceDeafened(member: GuildMember | null | undefined): boolean {
    return member?.voice.deaf === true;
}
