import tmi from "@staroverlay/sdk/tmi";
import StarOverlay, { createChatParser, MessageToken } from "@staroverlay/sdk";

const container = document.querySelector<HTMLDivElement>('#app')!;

const activeEmotes = new Set<HTMLImageElement>();
const emoteQueue: { url: string }[] = [];

function getSettings() {
    const s = StarOverlay.settings || {};
    return {
        triggerType: (s.trigger?.triggerType ?? "command") as "command" | "chat-message",
        command: (s.trigger?.command ?? "!showemote") as string,
        commandAlias: (s.trigger?.commandAlias ?? "!se") as string,
        timeOnScreen: ((s.global?.timeOnScreen ?? 5) as number) * 1000,
        maxEmotes: (s.global?.maxEmotes ?? 5) as number,
        maxEmotesPerMessage: (s.global?.maxEmotesPerMessage ?? 1) as number,
        useQueue: (s.global?.useQueue ?? false) as boolean,
        animation: (s.appearance?.animation ?? "fade") as "fade" | "dvd" | "throw",
        emoteHeight: (s.appearance?.emoteHeight ?? 112) as number,
        channelEmotes: (s.emotes?.channelEmotes ?? true) as boolean,
        ffz: (s.emotes?.ffz ?? true) as boolean,
        bttv: (s.emotes?.bttv ?? true) as boolean,
        seventv: (s.emotes?.seventv ?? true) as boolean,
    };
}

function processQueue() {
    const cfg = getSettings();
    if (cfg.maxEmotes > 0 && activeEmotes.size >= cfg.maxEmotes) return;

    const emoteItem = emoteQueue.shift();
    if (emoteItem) {
        spawnEmote(emoteItem.url);
    }
}

function spawnEmote(url: string) {
    const cfg = getSettings();

    const img = document.createElement("img");
    img.src = url;
    img.className = `emote-el anim-${cfg.animation}`;
    img.style.height = `${cfg.emoteHeight}px`;

    activeEmotes.add(img);

    if (cfg.animation === "fade") {
        img.style.position = "absolute";
        img.style.left = `${Math.random() * (window.innerWidth - cfg.emoteHeight)}px`;
        img.style.top = `${Math.random() * (window.innerHeight - cfg.emoteHeight)}px`;
        container.appendChild(img);

        const fadeDuration = 500; // ms
        img.animate([
            { opacity: 0 },
            { opacity: 1, offset: fadeDuration / cfg.timeOnScreen },
            { opacity: 1, offset: 1 - fadeDuration / cfg.timeOnScreen },
            { opacity: 0 }
        ], {
            duration: cfg.timeOnScreen,
            easing: "linear",
            fill: "forwards"
        }).onfinish = () => removeEmote(img);
    } else if (cfg.animation === "dvd") {
        img.style.position = "absolute";

        let x = Math.random() * (window.innerWidth - cfg.emoteHeight);
        let y = Math.random() * (window.innerHeight - cfg.emoteHeight);
        let vx = (Math.random() > 0.5 ? 1 : -1) * (2 + Math.random() * 2);
        let vy = (Math.random() > 0.5 ? 1 : -1) * (2 + Math.random() * 2);

        img.style.left = `${x}px`;
        img.style.top = `${y}px`;
        container.appendChild(img);

        let start = performance.now();
        let rafId: number;

        const update = (now: DOMHighResTimeStamp) => {
            if (now - start > cfg.timeOnScreen) {
                removeEmote(img);
                return;
            }

            const imgSize = img.getBoundingClientRect();
            const w = imgSize.width || cfg.emoteHeight;
            const h = imgSize.height || cfg.emoteHeight;

            x += vx;
            y += vy;

            if (x <= 0) { x = 0; vx *= -1; }
            if (x >= window.innerWidth - w) { x = window.innerWidth - w; vx *= -1; }
            if (y <= 0) { y = 0; vy *= -1; }
            if (y >= window.innerHeight - h) { y = window.innerHeight - h; vy *= -1; }

            img.style.left = `${x}px`;
            img.style.top = `${y}px`;
            rafId = requestAnimationFrame(update);
        };
        rafId = requestAnimationFrame(update);
    } else if (cfg.animation === "throw") {
        img.style.position = "absolute";

        // Spawn from bottom
        let x = Math.random() * (window.innerWidth - cfg.emoteHeight);
        let y = window.innerHeight;

        // Initial velocity (upwards, random x)
        let vx = (Math.random() * 8) - 4; // -4 to 4
        // Adjust initial Y velocity based on screen height to reach roughly top
        let vy = -(15 + Math.random() * 10);
        const gravity = 0.5;

        img.style.left = `${x}px`;
        img.style.top = `${y}px`;
        container.appendChild(img);

        let rafId: number;

        const update = () => {
            x += vx;
            vy += gravity;
            y += vy;

            img.style.left = `${x}px`;
            img.style.top = `${y}px`;

            // Remove when falls below bottom of screen
            const imgSize = img.getBoundingClientRect();
            const h = imgSize.height || cfg.emoteHeight;

            if (y > window.innerHeight + h) {
                removeEmote(img);
                return;
            }
            rafId = requestAnimationFrame(update);
        };
        rafId = requestAnimationFrame(update);
    }
}

function removeEmote(img: HTMLImageElement) {
    if (activeEmotes.has(img)) {
        activeEmotes.delete(img);
        img.remove();
        processQueue();
    }
}

function handleNewEmote(url: string) {
    const cfg = getSettings();
    if (cfg.maxEmotes > 0 && activeEmotes.size >= cfg.maxEmotes) {
        if (cfg.useQueue) {
            emoteQueue.push({ url });
        }
    } else {
        spawnEmote(url);
    }
}

function initializeApp() {
    const twitchIntegration = StarOverlay.integrations.find(i => i.type === 'twitch');
    if (!twitchIntegration?.username) return;

    const channel = twitchIntegration.username;
    const cfg = getSettings();

    const chatParser = createChatParser(twitchIntegration);
    chatParser.fetchEmotes({
        channel: cfg.channelEmotes,
        ffz: cfg.ffz,
        bttv: cfg.bttv,
        seventv: cfg.seventv,
    }).catch(() => { });

    const client = new tmi.Client({
        channels: [channel],
        connection: { secure: true, reconnect: true },
    });

    client.on("message", (_channel, state, message) => {
        const settings = getSettings();
        const tokens = chatParser.parseMessage(message, state.emotes);

        let emoteUrls: string[] = [];

        if (settings.triggerType === "command") {
            const hasCommand = message.toLowerCase().startsWith(`${settings.command.toLowerCase()} `) ||
                message.toLowerCase().startsWith(`${settings.commandAlias.toLowerCase()} `);
            if (hasCommand) {
                const emotes = tokens.filter(t => t.type === "emote").slice(0, settings.maxEmotesPerMessage);
                emoteUrls = emotes.map(t => {
                    const e = t as Extract<MessageToken, { type: "emote" }>;
                    return e.emote.url.high || e.emote.url.mid || e.emote.url.low;
                });
            }
        } else if (settings.triggerType === "chat-message") {
            const emotes = tokens.filter(t => t.type === "emote").slice(0, settings.maxEmotesPerMessage);
            emoteUrls = emotes.map(t => {
                const e = t as Extract<MessageToken, { type: "emote" }>;
                return e.emote.url.high || e.emote.url.mid || e.emote.url.low;
            });
        }

        for (const url of emoteUrls) {
            handleNewEmote(url);
        }
    });

    client.connect().catch(() => { });
}

StarOverlay.on("ready", () => {
    initializeApp();
});
