/** Short POS feedback sounds (served from /public/sounds). */

const SOUND_URLS = {
  add: "/sounds/add.mp3",
  cash: "/sounds/cash.mp3",
} as const;

type PosSound = keyof typeof SOUND_URLS;

const POOL_SIZE = 4;
const pools: Record<PosSound, HTMLAudioElement[]> = {
  add: [],
  cash: [],
};

function resolveUrl(path: string): string {
  const base = import.meta.env.BASE_URL ?? "/";
  return `${base.replace(/\/?$/, "/")}${path.replace(/^\//, "")}`;
}

function borrowAudio(kind: PosSound): HTMLAudioElement {
  const pool = pools[kind];
  const idle = pool.find((a) => a.paused || a.ended);
  if (idle) {
    idle.currentTime = 0;
    return idle;
  }
  if (pool.length < POOL_SIZE) {
    const audio = new Audio(resolveUrl(SOUND_URLS[kind]));
    audio.preload = "auto";
    pool.push(audio);
    return audio;
  }
  const audio = pool[0]!;
  audio.pause();
  audio.currentTime = 0;
  return audio;
}

export function playPosSound(kind: PosSound): void {
  if (typeof window === "undefined") return;
  try {
    const audio = borrowAudio(kind);
    void audio.play().catch(() => {
      /* autoplay / hardware mute — non-fatal */
    });
  } catch {
    /* ignore */
  }
}

export function playAddSound(): void {
  playPosSound("add");
}

export function playCashSound(): void {
  playPosSound("cash");
}
