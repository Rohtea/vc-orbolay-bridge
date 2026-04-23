/*
 * Vencord, a Discord client mod
 * Copyright (c) 2025 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { definePluginSettings } from "@api/Settings";
import definePlugin, { OptionType } from "@utils/types";
import * as Webpack from "@webpack";
import { ChannelStore, FluxDispatcher, GenericStore, GuildMemberStore, Toasts, UserStore, SelectedChannelStore, React, Button } from "@webpack/common";
import { waitForStore } from "@webpack/common/internal";

export let VoiceStateStore: GenericStore;
export let StreamerModeStore: GenericStore;

waitForStore("VoiceStateStore", m => VoiceStateStore = m);
waitForStore("StreamerModeStore", m => StreamerModeStore = m);

interface ChannelState {
    userId: string;
    channelId: string;
    deaf: boolean;
    mute: boolean;
    stream: boolean;
    selfDeaf: boolean;
    selfMute: boolean;
    selfStream: boolean;
}

interface CornerAlignment {
    top: boolean;
    left: boolean;
}

interface Config {
    port: number;
    userId: string;
    messageAlignment: CornerAlignment;
    userAlignment: CornerAlignment;
    voiceSemitransparent: boolean;
    messagesSemitransparent: boolean;
    isKeybindEnabled: boolean;
    notifyActiveChannel: boolean;
    keybind: string;
}

const formatKey = (code: string) => {
    return code
    .replace(/Control(Left|Right)/, "Ctrl")
    .replace(/Shift(Left|Right)/, "Shift")
    .replace(/Alt(Left|Right)/, "Alt")
    .replace(/Meta(Left|Right)/, "Super")
    .replace("Backquote", "`")
    .replace("Minus", "-")
    .replace("Equal", "=")
    .replace("BracketLeft", "[")
    .replace("BracketRight", "]")
    .replace("Backslash", "\\")
    .replace("Semicolon", ";")
    .replace("Quote", "'")
    .replace("Comma", ",")
    .replace("Period", ".")
    .replace("Slash", "/")
    .replace(/Key([A-Z])/, "$1")
    .replace(/Digit([0-9])/, "$1");
};

const KeybindRecorder = () => {
    const [keys, setKeys] = React.useState<string[]>(() =>
    settings.store.keybind ? settings.store.keybind.split("+").filter(Boolean) : []
    );
    const [recording, setRecording] = React.useState(false);

    React.useEffect(() => {
        if (!recording) return;

        const handleKeyDown = (e: KeyboardEvent) => {
            e.preventDefault();
            e.stopPropagation();

            const keyName = e.code;

            setKeys(prev => {
                if (!prev.includes(keyName)) {
                    const newKeys = [...prev, keyName];
                    settings.store.keybind = newKeys.join("+");
                    return newKeys;
                }
                return prev;
            });
        };

        const handleKeyUp = (e: KeyboardEvent) => {
            e.preventDefault();
            e.stopPropagation();
            setRecording(false);

            // Sync with the Rust backend immediately so it works without restarting
            if (ws?.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({
                    cmd: "REGISTER_CONFIG",
                    ...settings.store,
                    userId: UserStore?.getCurrentUser()?.id
                }));
            }
        };

        window.addEventListener("keydown", handleKeyDown, true);
        window.addEventListener("keyup", handleKeyUp, true);

        return () => {
            window.removeEventListener("keydown", handleKeyDown, true);
            window.removeEventListener("keyup", handleKeyUp, true);
        };
    }, [recording]);

    return (
        <div style={{ display: "flex", alignItems: "center", gap: "10px", marginTop: "8px" }}>
        <div style={{
            flex: 1,
            padding: "8px 12px",
            background: "var(--input-background)", // Better contrast than background-secondary
            border: recording ? "1px solid var(--brand-experiment)" : "1px solid var(--background-tertiary)",
            borderRadius: "4px",
            color: "var(--text-normal, #ffffff)",
            fontWeight: 500
        }}>
        {keys.length > 0 ? keys.map(formatKey).join(" + ") : "None"}
        </div>
        <Button
        size={Button.Sizes.TINY}
        look={recording ? Button.Looks.OUTLINED : Button.Looks.FILLED}
        color={recording ? Button.Colors.RED : Button.Colors.BRAND}
        onClick={() => {
            setKeys([]);
            settings.store.keybind = "";
            setRecording(true);
        }}
        >
        {recording ? "Recording..." : "Record Keybind"}
        </Button>
        </div>
    );
};

const settings = definePluginSettings({
    port: {
        type: OptionType.NUMBER,
        description: "Port to connect to",
        default: 6888,
        restartNeeded: true
    },
    isKeybindEnabled: {
        type: OptionType.BOOLEAN,
        description: "Enable/disable the global keybind",
        default: true,
        restartNeeded: false,

    },
    keybind: {
        type: OptionType.COMPONENT,
        description: "Overlay toggle keybind",
        default: "ControlLeft+Backquote",
        component: KeybindRecorder,
        onChange: (newValue) => {
            // Send the update immediately when the value changes
            if (ws?.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({
                    cmd: "REGISTER_CONFIG",
                    ...settings.store, // Send the whole store
                }));
            }
        }
    },
    messageAlignment: {
        type: OptionType.SELECT,
        description: "Alignment of messages in the overlay",
        options: [
            { label: "Top left", value: "topleft", default: true },
            { label: "Top right", value: "topright" },
            { label: "Bottom left", value: "bottomleft" },
            { label: "Bottom right", value: "bottomright" },
            { label: "Top Center", value: "topcenter" },
            { label: "Bottom Center", value: "bottomcenter" },
            { label: "Center Left", value: "centerleft" },
            { label: "Center Right", value: "centerright" },
        ],
        default: "topright",
        restartNeeded: true
    },
    userAlignment: {
        type: OptionType.SELECT,
        description: "Alignment of users in the overlay",
        options: [
            { label: "Top left", value: "topleft", default: true },
            { label: "Top right", value: "topright" },
            { label: "Bottom left", value: "bottomleft" },
            { label: "Bottom right", value: "bottomright" },
            { label: "Top Center", value: "topcenter" },
            { label: "Bottom Center", value: "bottomcenter" },
            { label: "Center Left", value: "centerleft" },
            { label: "Center Right", value: "centerright" },
        ],
        default: "topleft",
        restartNeeded: true
    },
    voiceSemitransparent: {
        type: OptionType.BOOLEAN,
        description: "Make voice channel members transparent",
        default: true,
        restartNeeded: true
    },
    messagesSemitransparent: {
        type: OptionType.BOOLEAN,
        description: "Make message notifications transparent",
        default: false,
        restartNeeded: true
    },
    notifyActiveChannel: {
        type: OptionType.BOOLEAN,
        description: "Show notifications for the channel you are currently looking at",
        default: true,
            restartNeeded: false
    }
});
let ws: WebSocket | null = null;
let currentChannel = null;

const waitForPopulate = async fn => {
    while (true) {
        const result = await fn();
        if (result) return result;
        await new Promise(r => setTimeout(r, 500));
    }
};

const stateToPayload = (guildId: string, state: ChannelState) => ({
    userId: state.userId,
    username:
        GuildMemberStore.getNick(guildId, state.userId) ||
        // @ts-expect-error this exists
        UserStore?.getUser(state.userId)?.globalName,
    avatarUrl: UserStore?.getUser(state.userId)?.avatar,
    channelId: state.channelId,
    deaf: state.deaf || state.selfDeaf,
    mute: state.mute || state.selfMute,
    streaming: state.selfStream,
    speaking: false,
});

const incoming = payload => {
    switch (payload.cmd) {
        case "TOGGLE_MUTE":
            FluxDispatcher.dispatch({
                type: "AUDIO_TOGGLE_SELF_MUTE",
                syncRemote: true,
                playSoundEffect: true,
                context: "default"
            });
            break;
        case "TOGGLE_DEAF":
            FluxDispatcher.dispatch({
                type: "AUDIO_TOGGLE_SELF_DEAF",
                syncRemote: true,
                playSoundEffect: true,
                context: "default"
            });
            break;
        case "DISCONNECT":
            FluxDispatcher.dispatch({
                type: "VOICE_CHANNEL_SELECT",
                channelId: null
            });
            break;
        case "STOP_STREAM": {
            const userId = UserStore?.getCurrentUser()?.id;
            const voiceState = VoiceStateStore?.getVoiceStateForUser(userId);
            const channel = ChannelStore?.getChannel?.(voiceState?.channelId);

            // If any of these are null, we can't do anything
            if (!userId || !voiceState || !channel) return;

            FluxDispatcher.dispatch({
                type: "STREAM_STOP",
                streamKey: `guild:${channel.guild_id}:${voiceState.channelId}:${userId}`,
                appContext: "APP"
            });

            break;
        }
        case "NAVIGATE": {
            // If any of this isn't defined then we can't do anything anyways
            if (!payload.guild_id || !payload.channel_id || !payload.message_id) break;

            const { guild_id, channel_id, message_id } = payload;
            FluxDispatcher.dispatch({
                type: "CHANNEL_SELECT",
                guildId: String(guild_id),
                channelId: String(channel_id),
                messageId: String(message_id),
            });

            break;
        }
    }
};

const handleSpeaking = dispatch => {
    ws?.send(
        JSON.stringify({
            cmd: "VOICE_STATE_UPDATE",
            state: {
                userId: dispatch.userId,
                speaking: dispatch.speakingFlags === 1,
            },
        })
    );
};

const handleMessageNotification = (dispatch: any) => {
    if (!ws || ws.readyState !== WebSocket.OPEN) return;

    const selectedTextChannel = SelectedChannelStore.getChannelId();

    if (dispatch.message?.channel_id === selectedTextChannel) {
        return;
    }

    ws.send(
        JSON.stringify({
            cmd: "MESSAGE_NOTIFICATION",
            message: {
                title: dispatch.title,
                body: dispatch.body,
                icon: dispatch.icon,
                guildId: dispatch.message?.guild_id,
                channelId: dispatch.message?.channel_id,
                messageId: dispatch.message?.id,
            }
        })
    );
};

const handleMessageCreate = (data: any) => {
    if (!settings.store.notifyActiveChannel) return;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;

    const { message } = data;
    const selectedTextChannel = SelectedChannelStore.getChannelId();

    if (message.channel_id !== selectedTextChannel) return;

    if (message.author.id === UserStore.getCurrentUser().id) return;

    const member = message.member;

    const displayName =
    member?.nick ??
    message.author.global_name ??
    message.author.username;

    ws.send(
        JSON.stringify({
            cmd: "MESSAGE_NOTIFICATION",
            message: {
                title: displayName,
                body: message.content,
                icon: `https://cdn.discordapp.com/avatars/${message.author.id}/${message.author.avatar}.png`,
                guildId: message.guild_id,
                channelId: message.channel_id,
                messageId: message.id,
            }
        })
    );
};

const handleVoiceStateUpdates = async dispatch => {
    // Ensure we are in the channel that the update is for
    const id = UserStore?.getCurrentUser()?.id;

    for (const state of dispatch.voiceStates) {
        const ourState = state.userId === id;
        const { guildId } = state;

        if (ourState) {
            if (state.channelId && state.channelId !== currentChannel) {
                const voiceStates = await waitForPopulate(() =>
                    VoiceStateStore?.getVoiceStatesForChannel(state.channelId)
                );

                ws?.send(
                    JSON.stringify({
                        cmd: "CHANNEL_JOINED",
                        states: Object.values(voiceStates).map(s => stateToPayload(guildId, s as ChannelState)),
                    })
                );

                currentChannel = state.channelId;

                break;
            } else if (!state.channelId) {
                ws?.send(
                    JSON.stringify({
                        cmd: "CHANNEL_LEFT",
                    })
                );

                currentChannel = null;

                break;
            }
        }

        // If this is for the channel we are in, send a VOICE_STATE_UPDATE
        if (
            !!currentChannel &&
            (state.channelId === currentChannel ||
                state.oldChannelId === currentChannel)
        ) {
            ws?.send(
                JSON.stringify({
                    cmd: "VOICE_STATE_UPDATE",
                    state: stateToPayload(guildId, state as ChannelState),
                })
            );
        }
    }
};

const handleStreamerMode = dispatch => {
    ws?.send(
        JSON.stringify({
            cmd: "STREAMER_MODE",
            enabled: dispatch.value,
        })
    );
};

const createWebsocket = () => {
    console.log("Attempting to connect to Orbolay server");

    // First ensure old connection is closed
    if (ws?.close) ws.close();

    setTimeout(() => {
        // If the ws is not ready, kill it and log
        if (ws?.readyState !== WebSocket.OPEN) {
            Toasts.show({
                message: "Orbolay websocket could not connect. Is it running?",
                type: Toasts.Type.FAILURE,
                id: Toasts.genId(),
            });
            ws = null;
            return;
        }
    }, 1000);

    ws = new WebSocket("ws://127.0.0.1:" + settings.store.port);
    ws.onerror = e => {
        ws?.close?.();
        ws = null;
        throw e;
    };
    ws.onmessage = e => {
        incoming(JSON.parse(e.data));
    };
    ws.onclose = () => {
        ws = null;
    };
    ws.onopen = async () => {
        Toasts.show({
            message: "Connected to Orbolay server",
            type: Toasts.Type.SUCCESS,
            id: Toasts.genId(),
        });

        // Send over the config
        const config = {
            ...settings.store,
            userId: null,
        };

        // Ensure we track the current user id
        config.userId = await waitForPopulate(() => UserStore?.getCurrentUser()?.id);

        ws?.send(JSON.stringify({ cmd: "REGISTER_CONFIG", ...config }));

        // Send initial channel joined (if the user is in a channel)
        const userVoiceState = VoiceStateStore.getVoiceStateForUser(
            config.userId,
        );

        if (!userVoiceState) {
            return;
        }

        const channelState = VoiceStateStore.getVoiceStatesForChannel(
            userVoiceState.channelId
        );
        const { guildId } = userVoiceState;

        ws?.send(
            JSON.stringify({
                cmd: "CHANNEL_JOINED",
                states: Object.values(channelState).map(s => stateToPayload(guildId, s as ChannelState)),
            })
        );

        // Also let the client know whether we are in streamer mode
        ws?.send(
            JSON.stringify({
                cmd: "STREAMER_MODE",
                enabled: StreamerModeStore.enabled,
            })
        );

        currentChannel = userVoiceState.channelId;
    };
};

export default definePlugin({
    name: "OrbolayBridge",
    description: "Bridge plugin to connect Orbolay to Discord",
    authors: [{
        name: "SpikeHD",
        id: 221757857836564485n
    }],
    hidden: false,

    settings,

    flux: {
        SPEAKING: handleSpeaking,
        VOICE_STATE_UPDATES: handleVoiceStateUpdates,
        RPC_NOTIFICATION_CREATE: handleMessageNotification,
        STREAMER_MODE: handleStreamerMode,
        MESSAGE_CREATE: handleMessageCreate,
    },

    start() {
        createWebsocket();
    },

    stop() {
        ws?.close?.();
        ws = null;
    }
});
