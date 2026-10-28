'use client';

// =====================================================================
// KONFIGURASI — GANTI DI SINI AJA, BANG
// =====================================================================
const NAMA_ADIK = 'Shaiza Jaja';
const NOMOR_WA_ABANG = '6281224384412'; // format internasional tanpa "+" dan tanpa "0" di depan

// Soundtrack (ambil ID dari link YouTube / YouTube Music: ...watch?v=ID_DI_SINI)
const YOUTUBE_VIDEO_ID = '3LhZWVRp6f4';
const JUDUL_LAGU = "It's Showtime!"; // fallback kalau judul dari YouTube gagal dibaca
const ARTIS_LAGU = 'Undertale OST';
const VOLUME_LAGU = 70; // 0 - 100
// =====================================================================

import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import {
  AnimatePresence,
  motion,
  useAnimationControls,
} from 'framer-motion';
import confetti from 'canvas-confetti';

// ---------------------------------------------------------------------
// Tipe & Konstanta Umum
// ---------------------------------------------------------------------
type Phase = 'BOOTING' | 'PRESS_START' | 'HOME' | 'TETRIS_GAME' | 'REWARD_SCREEN';
type Btn = 'UP' | 'DOWN' | 'LEFT' | 'RIGHT' | 'A' | 'B' | 'START' | 'SELECT';

const TARGET_SKOR = 20;
const POIN_MENDARAT = 4;
const POIN_GARIS = 10;
const BOOT_DURATION = 3000;

// Palet warna GameBoy klasik (hijau LCD)
const LCD = {
  lightest: '#9bbc0f',
  light: '#8bac0f',
  dark: '#306230',
  darkest: '#0f380f',
};

// ---------------------------------------------------------------------
// LOGIKA TETRIS (fungsi murni)
// ---------------------------------------------------------------------
const ROWS = 16;
const COLS = 10;

type PieceType = 'I' | 'O' | 'T' | 'S' | 'Z' | 'J' | 'L';
type Cell = PieceType | null;
type Board = Cell[][];
type Piece = { type: PieceType; shape: number[][]; x: number; y: number };
type GameStatus = 'PLAYING' | 'WIN' | 'OVER';

type GameState = {
  board: Board;
  piece: Piece | null;
  next: PieceType;
  score: number;
  lines: number;
  status: GameStatus;
};

const SHAPES: Record<PieceType, number[][]> = {
  I: [[1, 1, 1, 1]],
  O: [
    [1, 1],
    [1, 1],
  ],
  T: [
    [0, 1, 0],
    [1, 1, 1],
  ],
  S: [
    [0, 1, 1],
    [1, 1, 0],
  ],
  Z: [
    [1, 1, 0],
    [0, 1, 1],
  ],
  J: [
    [1, 0, 0],
    [1, 1, 1],
  ],
  L: [
    [0, 0, 1],
    [1, 1, 1],
  ],
};

const PIECE_TYPES: PieceType[] = ['I', 'O', 'T', 'S', 'Z', 'J', 'L'];

const randomType = (): PieceType =>
  PIECE_TYPES[Math.floor(Math.random() * PIECE_TYPES.length)];

const emptyBoard = (): Board =>
  Array.from({ length: ROWS }, () => Array<Cell>(COLS).fill(null));

const spawnPiece = (type: PieceType): Piece => {
  const shape = SHAPES[type].map((r) => [...r]);
  return {
    type,
    shape,
    x: Math.floor((COLS - shape[0].length) / 2),
    y: 0,
  };
};

const collides = (board: Board, shape: number[][], x: number, y: number) => {
  for (let r = 0; r < shape.length; r++) {
    for (let c = 0; c < shape[r].length; c++) {
      if (!shape[r][c]) continue;
      const nx = x + c;
      const ny = y + r;
      if (nx < 0 || nx >= COLS || ny >= ROWS) return true;
      if (ny >= 0 && board[ny][nx]) return true;
    }
  }
  return false;
};

const rotateShape = (shape: number[][]) =>
  shape[0].map((_, c) => shape.map((row) => row[c]).reverse());

const mergePiece = (board: Board, piece: Piece): Board => {
  const nb = board.map((row) => [...row]);
  piece.shape.forEach((row, r) =>
    row.forEach((v, c) => {
      const ny = piece.y + r;
      const nx = piece.x + c;
      if (v && ny >= 0 && ny < ROWS && nx >= 0 && nx < COLS) {
        nb[ny][nx] = piece.type;
      }
    })
  );
  return nb;
};

const clearLines = (board: Board) => {
  const remaining = board.filter((row) => row.some((c) => c === null));
  const cleared = ROWS - remaining.length;
  const fresh = Array.from({ length: cleared }, () =>
    Array<Cell>(COLS).fill(null)
  );
  return { board: [...fresh, ...remaining], cleared };
};

const createGame = (first: PieceType, next: PieceType): GameState => ({
  board: emptyBoard(),
  piece: spawnPiece(first),
  next,
  score: 0,
  lines: 0,
  status: 'PLAYING',
});

const lockPiece = (g: GameState, nextRandom: PieceType): GameState => {
  if (!g.piece) return g;
  const merged = mergePiece(g.board, g.piece);
  const { board, cleared } = clearLines(merged);
  const score = g.score + POIN_MENDARAT + cleared * POIN_GARIS;
  const lines = g.lines + cleared;

  if (score >= TARGET_SKOR) {
    return { ...g, board, score, lines, piece: null, status: 'WIN' };
  }

  const piece = spawnPiece(g.next);
  if (collides(board, piece.shape, piece.x, piece.y)) {
    return { ...g, board, score, lines, piece: null, status: 'OVER' };
  }

  return { ...g, board, score, lines, piece, next: nextRandom };
};

type GameAction =
  | { type: 'LEFT' }
  | { type: 'RIGHT' }
  | { type: 'ROTATE' }
  | { type: 'DOWN'; rand: PieceType }
  | { type: 'DROP'; rand: PieceType }
  | { type: 'RESET'; first: PieceType; next: PieceType };

const gameReducer = (g: GameState, a: GameAction): GameState => {
  if (a.type === 'RESET') return createGame(a.first, a.next);
  if (g.status !== 'PLAYING' || !g.piece) return g;
  const p = g.piece;

  switch (a.type) {
    case 'LEFT':
      return collides(g.board, p.shape, p.x - 1, p.y)
        ? g
        : { ...g, piece: { ...p, x: p.x - 1 } };
    case 'RIGHT':
      return collides(g.board, p.shape, p.x + 1, p.y)
        ? g
        : { ...g, piece: { ...p, x: p.x + 1 } };
    case 'ROTATE': {
      const rotated = rotateShape(p.shape);
      // Wall kick sederhana biar enak diputar di pinggir
      for (const off of [0, -1, 1, -2, 2]) {
        if (!collides(g.board, rotated, p.x + off, p.y)) {
          return { ...g, piece: { ...p, shape: rotated, x: p.x + off } };
        }
      }
      return g;
    }
    case 'DOWN':
      if (!collides(g.board, p.shape, p.x, p.y + 1)) {
        return { ...g, piece: { ...p, y: p.y + 1 } };
      }
      return lockPiece(g, a.rand);
    case 'DROP': {
      let y = p.y;
      while (!collides(g.board, p.shape, p.x, y + 1)) y++;
      return lockPiece({ ...g, piece: { ...p, y } }, a.rand);
    }
    default:
      return g;
  }
};

// Warna/tekstur tiap jenis balok (tetap dalam palet hijau GameBoy)
const CELL_STYLE: Record<PieceType, { bg: string; inner: string }> = {
  I: { bg: LCD.darkest, inner: LCD.dark },
  O: { bg: LCD.dark, inner: LCD.light },
  T: { bg: LCD.darkest, inner: LCD.light },
  S: { bg: LCD.dark, inner: LCD.darkest },
  Z: { bg: LCD.darkest, inner: LCD.lightest },
  J: { bg: LCD.dark, inner: LCD.lightest },
  L: { bg: LCD.darkest, inner: LCD.darkest },
};

// ---------------------------------------------------------------------
// Efek Confetti (warna retro, tanpa pink)
// ---------------------------------------------------------------------
const fireConfetti = () => {
  const colors = ['#9bbc0f', '#306230', '#f8e71c', '#ffffff', '#4a90e2', '#ff8c00'];
  const end = Date.now() + 1800;
  confetti({ particleCount: 140, spread: 90, origin: { y: 0.55 }, colors, shapes: ['square'] });
  const frame = () => {
    confetti({ particleCount: 4, angle: 60, spread: 60, origin: { x: 0 }, colors, shapes: ['square'] });
    confetti({ particleCount: 4, angle: 120, spread: 60, origin: { x: 1 }, colors, shapes: ['square'] });
    if (Date.now() < end) requestAnimationFrame(frame);
  };
  frame();
};

// ---------------------------------------------------------------------
// SOUNDTRACK — pemutar YouTube tersembunyi (hanya audio yang dipakai)
// ---------------------------------------------------------------------
/* eslint-disable @typescript-eslint/no-explicit-any */
declare global {
  interface Window {
    YT?: any;
    onYouTubeIframeAPIReady?: () => void;
  }
}

function useYouTubeAudio(videoId: string) {
  const hostRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<any>(null);
  const wantPlayRef = useRef(false);
  const [ready, setReady] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [title, setTitle] = useState('');
  const [time, setTime] = useState({ current: 0, duration: 0 });

  useEffect(() => {
    let cancelled = false;

    const create = () => {
      if (cancelled || !hostRef.current || playerRef.current || !window.YT?.Player) return;
      const el = document.createElement('div');
      hostRef.current.appendChild(el);
      playerRef.current = new window.YT.Player(el, {
        videoId,
        width: '200',
        height: '200',
        playerVars: {
          autoplay: 0,
          controls: 0,
          disablekb: 1,
          fs: 0,
          loop: 1,
          playlist: videoId, // wajib untuk loop 1 video
          playsinline: 1,
          rel: 0,
        },
        events: {
          onReady: (e: any) => {
            if (cancelled) return;
            setReady(true);
            e.target.setVolume(VOLUME_LAGU);
            const data = e.target.getVideoData?.();
            if (data?.title) setTitle(data.title);
            if (wantPlayRef.current) e.target.playVideo();
          },
          onStateChange: (e: any) => {
            // -1 = unstarted, 0 = ended, 1 = playing, 2 = paused, 3 = buffering, 5 = cued
            setPlaying(e.data === 1 || e.data === 3);
            if (e.data === 0) {
              e.target.seekTo(0);
              e.target.playVideo();
            } else if (wantPlayRef.current && (e.data === 2 || e.data === 5)) {
              // Tidak ada fitur pause: kalau ke-pause oleh apapun, langsung lanjut lagi
              e.target.playVideo();
            }
          },
        },
      });
    };

    if (window.YT?.Player) {
      create();
    } else {
      const prev = window.onYouTubeIframeAPIReady;
      window.onYouTubeIframeAPIReady = () => {
        prev?.();
        create();
      };
      if (!document.getElementById('yt-iframe-api')) {
        const s = document.createElement('script');
        s.id = 'yt-iframe-api';
        s.src = 'https://www.youtube.com/iframe_api';
        document.body.appendChild(s);
      }
    }

    const host = hostRef.current;
    return () => {
      cancelled = true;
      try {
        playerRef.current?.destroy?.();
      } catch {
        /* abaikan */
      }
      playerRef.current = null;
      if (host) host.innerHTML = '';
    };
  }, [videoId]);

  // Update progress lagu + watchdog: pastikan lagu selalu jalan (looping terus)
  useEffect(() => {
    if (!ready) return;
    const id = setInterval(() => {
      const p = playerRef.current;
      if (!p?.getCurrentTime) return;
      setTime({ current: p.getCurrentTime() || 0, duration: p.getDuration() || 0 });
      if (wantPlayRef.current && document.visibilityState === 'visible') {
        const state = p.getPlayerState?.();
        if (state !== 1 && state !== 3) p.playVideo();
      }
    }, 1000);
    return () => clearInterval(id);
  }, [ready]);

  // Di HP, browser kadang memblokir play() tanpa sentuhan user.
  // Setiap sentuhan/klik/tombol di halaman ikut "membangunkan" lagu kalau sempat berhenti.
  useEffect(() => {
    const resume = () => {
      const p = playerRef.current;
      if (!wantPlayRef.current || !p?.getPlayerState) return;
      const state = p.getPlayerState();
      if (state !== 1 && state !== 3) p.playVideo();
    };
    const onVisible = () => {
      if (document.visibilityState === 'visible') resume();
    };
    document.addEventListener('pointerdown', resume, true);
    document.addEventListener('touchend', resume, true);
    document.addEventListener('keydown', resume, true);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      document.removeEventListener('pointerdown', resume, true);
      document.removeEventListener('touchend', resume, true);
      document.removeEventListener('keydown', resume, true);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, []);

  const play = useCallback(() => {
    wantPlayRef.current = true;
    playerRef.current?.playVideo?.();
  }, []);

  return { hostRef, ready, playing, title, time, play };
}
/* eslint-enable @typescript-eslint/no-explicit-any */

// ---------------------------------------------------------------------
// KOMPONEN UTAMA
// ---------------------------------------------------------------------
export default function Page() {
  const [phase, setPhase] = useState<Phase>('BOOTING');
  const [bootProgress, setBootProgress] = useState(0);
  const [unlocked, setUnlocked] = useState(false);
  const [homeIndex, setHomeIndex] = useState(0);
  const [lockedWarning, setLockedWarning] = useState(false);
  const [rewardIndex, setRewardIndex] = useState(0);
  const [pranked, setPranked] = useState<string[]>([]);
  const [game, dispatch] = useReducer(
    gameReducer,
    undefined,
    () => createGame('T', 'O') // nilai awal deterministik (aman untuk SSR)
  );

  const screenControls = useAnimationControls();
  const warningTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const music = useYouTubeAudio(YOUTUBE_VIDEO_ID);
  const playMusic = music.play;

  // Tekan START setelah loading -> lagu mulai (browser wajib ada interaksi user dulu)
  const pressStart = useCallback(() => {
    playMusic();
    setPhase('HOME');
  }, [playMusic]);

  // ----------------------- BOOTING -----------------------
  useEffect(() => {
    if (phase !== 'BOOTING') return;
    const start = Date.now();
    const id = setInterval(() => {
      const pct = Math.min(100, Math.round(((Date.now() - start) / BOOT_DURATION) * 100));
      setBootProgress(pct);
      if (pct >= 100) {
        clearInterval(id);
        setTimeout(() => setPhase('PRESS_START'), 250);
      }
    }, 40);
    return () => clearInterval(id);
  }, [phase]);

  // ----------------------- TETRIS LOOP -----------------------
  useEffect(() => {
    if (phase !== 'TETRIS_GAME' || game.status !== 'PLAYING') return;
    const id = setInterval(() => dispatch({ type: 'DOWN', rand: randomType() }), 650);
    return () => clearInterval(id);
  }, [phase, game.status]);

  // Menang -> confetti + buka hadiah
  useEffect(() => {
    if (phase === 'TETRIS_GAME' && game.status === 'WIN') {
      setUnlocked(true);
      fireConfetti();
    }
  }, [phase, game.status]);

  useEffect(
    () => () => {
      if (warningTimer.current) clearTimeout(warningTimer.current);
    },
    []
  );

  // ----------------------- AKSI -----------------------
  const startGame = useCallback(() => {
    dispatch({ type: 'RESET', first: randomType(), next: randomType() });
    setPhase('TETRIS_GAME');
  }, []);

  const tryOpenReward = useCallback(() => {
    if (unlocked) {
      setRewardIndex(0);
      setPhase('REWARD_SCREEN');
      return;
    }
    // Hadiah masih terkunci -> layar getar + teks peringatan
    setLockedWarning(true);
    screenControls.start({
      x: [0, -12, 12, -10, 10, -6, 6, -2, 2, 0],
      rotate: [0, -1.5, 1.5, -1, 1, 0],
      transition: { duration: 0.55 },
    });
    if (warningTimer.current) clearTimeout(warningTimer.current);
    warningTimer.current = setTimeout(() => setLockedWarning(false), 2800);
  }, [unlocked, screenControls]);

  const goHome = useCallback(() => {
    setPhase('HOME');
    setHomeIndex(unlocked ? 1 : 0);
  }, [unlocked]);

  const openWhatsApp = useCallback(() => {
    const pesan =
      `BANG, JAJA MAU ....` ;
    window.location.href = `https://wa.me/${NOMOR_WA_ABANG}?text=${encodeURIComponent(pesan)}`;
  }, []);

  const chooseReward = useCallback(
    (idx: number) => {
      const opt = REWARD_OPTIONS[idx];
      if (opt.id === 'abang') {
        openWhatsApp();
        return;
      }
      setPranked((prev) => (prev.includes(opt.id) ? prev : [...prev, opt.id]));
    },
    [openWhatsApp]
  );

  // ----------------------- INPUT TERPUSAT -----------------------
  const handleInput = useCallback(
    (btn: Btn) => {
      switch (phase) {
        case 'PRESS_START':
          pressStart();
          break;

        case 'HOME':
          if (btn === 'UP' || btn === 'DOWN' || btn === 'LEFT' || btn === 'RIGHT') {
            setHomeIndex((i) => (i === 0 ? 1 : 0));
          } else if (btn === 'A' || btn === 'START') {
            if (homeIndex === 0) startGame();
            else tryOpenReward();
          }
          break;

        case 'TETRIS_GAME':
          if (game.status === 'PLAYING') {
            if (btn === 'LEFT') dispatch({ type: 'LEFT' });
            else if (btn === 'RIGHT') dispatch({ type: 'RIGHT' });
            else if (btn === 'DOWN') dispatch({ type: 'DOWN', rand: randomType() });
            else if (btn === 'UP' || btn === 'A') dispatch({ type: 'ROTATE' });
            else if (btn === 'B') dispatch({ type: 'DROP', rand: randomType() });
            else if (btn === 'SELECT') goHome();
          } else if (game.status === 'WIN') {
            // Hanya START (atau klik tombol) supaya tidak ke-skip karena A/B masih dipencet
            if (btn === 'START') goHome();
          } else if (game.status === 'OVER') {
            if (btn === 'A' || btn === 'START') startGame();
            else if (btn === 'B' || btn === 'SELECT') goHome();
          }
          break;

        case 'REWARD_SCREEN':
          if (btn === 'UP' || btn === 'LEFT') {
            setRewardIndex((i) => (i + REWARD_OPTIONS.length - 1) % REWARD_OPTIONS.length);
          } else if (btn === 'DOWN' || btn === 'RIGHT') {
            setRewardIndex((i) => (i + 1) % REWARD_OPTIONS.length);
          } else if (btn === 'A' || btn === 'START') {
            chooseReward(rewardIndex);
          } else if (btn === 'B' || btn === 'SELECT') {
            goHome();
          }
          break;

        default:
          break;
      }
    },
    [phase, homeIndex, game.status, rewardIndex, startGame, tryOpenReward, goHome, chooseReward, pressStart]
  );

  // Selalu pakai handler terbaru di listener keyboard
  const inputRef = useRef(handleInput);
  useEffect(() => {
    inputRef.current = handleInput;
  }, [handleInput]);

  // ----------------------- KEYBOARD (LAPTOP) -----------------------
  useEffect(() => {
    const map: Record<string, Btn> = {
      ArrowUp: 'UP',
      ArrowDown: 'DOWN',
      ArrowLeft: 'LEFT',
      ArrowRight: 'RIGHT',
      w: 'UP',
      s: 'DOWN',
      a: 'LEFT',
      d: 'RIGHT',
      z: 'A',
      j: 'A',
      Enter: 'START',
      x: 'B',
      k: 'B',
      ' ': 'B',
      Shift: 'SELECT',
      Escape: 'SELECT',
      Backspace: 'SELECT',
    };
    const onKey = (e: KeyboardEvent) => {
      const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
      const btn = map[key];
      if (!btn) return;
      e.preventDefault();
      inputRef.current(btn);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // ----------------------- RENDER -----------------------
  const isBootPhase = phase === 'BOOTING' || phase === 'PRESS_START';

  return (
    <>
      {/* Pemutar YouTube tersembunyi — selalu ter-mount agar lagu tidak putus saat ganti layar */}
      <div
        ref={music.hostRef}
        aria-hidden
        className="fixed bottom-0 left-0 w-[2px] h-[2px] overflow-hidden opacity-0 pointer-events-none"
      />

      {isBootPhase ? (
        <BootScreen
          progress={bootProgress}
          showStart={phase === 'PRESS_START'}
          onStart={pressStart}
        />
      ) : (
        <>
          <MusicWidget
            playing={music.playing}
            ready={music.ready}
            title={music.title || JUDUL_LAGU}
            artist={ARTIS_LAGU}
            current={music.time.current}
            duration={music.time.duration}
          />
          {renderMain()}
        </>
      )}
    </>
  );

  function renderMain() {
  return (
    <main className="min-h-[100dvh] w-full flex items-center justify-center overflow-hidden select-none px-3 pb-3 pt-[64px] bg-[radial-gradient(circle_at_50%_30%,#2b2f45_0%,#1b1d2a_60%,#111220_100%)]">
      <motion.div
        initial={{ y: 60, opacity: 0, scale: 0.9 }}
        animate={{ y: 0, opacity: 1, scale: 1 }}
        transition={{ type: 'spring', stiffness: 120, damping: 14 }}
        className="relative"
        style={{ width: 'min(94vw, 390px, calc((100dvh - 80px) * 0.6))' }}
      >
        <GameBoyBody
          screenControls={screenControls}
          onInput={(b) => inputRef.current(b)}
          repeatEnabled={phase === 'TETRIS_GAME' && game.status === 'PLAYING'}
        >
          <AnimatePresence mode="wait">
            {phase === 'HOME' && (
              <ScreenWrap key="home">
                <HomeScreen
                  unlocked={unlocked}
                  selected={homeIndex}
                  lockedWarning={lockedWarning}
                  onHover={setHomeIndex}
                  onPlay={startGame}
                  onReward={tryOpenReward}
                />
              </ScreenWrap>
            )}
            {phase === 'TETRIS_GAME' && (
              <ScreenWrap key="tetris">
                <TetrisScreen game={game} onBack={goHome} onRetry={startGame} />
              </ScreenWrap>
            )}
            {phase === 'REWARD_SCREEN' && (
              <ScreenWrap key="reward">
                <RewardScreen
                  selected={rewardIndex}
                  pranked={pranked}
                  onHover={setRewardIndex}
                  onChoose={chooseReward}
                  onBack={goHome}
                />
              </ScreenWrap>
            )}
          </AnimatePresence>
        </GameBoyBody>

        <p className="mt-3 text-center text-[7px] leading-relaxed text-white/40 hidden sm:block">
          ← ↑ → ↓ GERAK &nbsp;•&nbsp; Z/↑ = A (PUTAR) &nbsp;•&nbsp; X/SPASI = B (JATUH) &nbsp;•&nbsp; ENTER = START
        </p>
      </motion.div>
    </main>
  );
  }
}

// ---------------------------------------------------------------------
// WIDGET "NOW PLAYING" ala Spotify / TikTok
// ---------------------------------------------------------------------
const formatTime = (s: number) => {
  if (!Number.isFinite(s) || s < 0) return '0:00';
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, '0')}`;
};

function MusicWidget({
  playing,
  ready,
  title,
  artist,
  current,
  duration,
}: {
  playing: boolean;
  ready: boolean;
  title: string;
  artist: string;
  current: number;
  duration: number;
}) {
  const pct = duration > 0 ? Math.min(100, (current / duration) * 100) : 0;

  return (
    <motion.div
      initial={{ y: -80, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ type: 'spring', stiffness: 160, damping: 18, delay: 0.3 }}
      className="fixed top-3 right-3 z-50 w-[min(80vw,270px)] select-none"
    >
      <div className="relative flex items-center gap-2.5 rounded-2xl border border-white/10 bg-black/55 backdrop-blur-md pl-1.5 pr-2 py-1.5 shadow-[0_8px_30px_rgba(0,0,0,0.45)] overflow-hidden">
        {/* Piringan berputar (album art) */}
        <div className="relative shrink-0 w-10 h-10">
          <div
            className="spin-disc w-full h-full rounded-full overflow-hidden border-2 border-[#222]"
            style={{
              animationPlayState: playing ? 'running' : 'paused',
              background:
                'repeating-radial-gradient(circle,#111 0px,#111 2px,#1d1d1d 3px,#111 4px)',
            }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={`https://i.ytimg.com/vi/${YOUTUBE_VIDEO_ID}/hqdefault.jpg`}
              alt=""
              className="w-full h-full object-cover scale-[1.35] opacity-90"
              draggable={false}
            />
          </div>
          <div className="absolute inset-0 m-auto w-2.5 h-2.5 rounded-full bg-[#1b1d2a] border border-white/30" />
        </div>

        {/* Info lagu */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 mb-1">
            <Equalizer playing={playing} />
            <span className="text-[6px] tracking-wider text-[#1ed760]">
              {!ready ? 'LOADING...' : playing ? 'NOW PLAYING' : 'BUFFERING...'}
            </span>
          </div>
          <div className="overflow-hidden whitespace-nowrap">
            <div
              className="marquee inline-flex gap-8 text-[8px] text-white"
              style={{ animationPlayState: playing ? 'running' : 'paused' }}
            >
              <span>{title}</span>
              <span aria-hidden>{title}</span>
            </div>
          </div>
          <p className="mt-1 truncate text-[6px] text-white/55">{artist}</p>

          {/* Progress */}
          <div className="mt-1.5 flex items-center gap-1.5">
            <span className="text-[5px] text-white/50 tabular-nums">{formatTime(current)}</span>
            <div className="relative h-[3px] flex-1 rounded-full bg-white/15 overflow-hidden">
              <div
                className="absolute inset-y-0 left-0 rounded-full bg-[#1ed760] transition-[width] duration-500 ease-linear"
                style={{ width: `${pct}%` }}
              />
            </div>
            <span className="text-[5px] text-white/50 tabular-nums">{formatTime(duration)}</span>
          </div>
        </div>

        {/* Indikator loop (tanpa tombol pause — lagu diputar terus) */}
        <div
          aria-label="Lagu diputar berulang"
          className="shrink-0 w-8 h-8 rounded-full bg-white/10 border border-white/15 flex items-center justify-center text-[12px] text-[#1ed760]"
        >
          <span className="spin-disc inline-block" style={{ animationDuration: '3s' }}>
            ↻
          </span>
        </div>
      </div>
    </motion.div>
  );
}

function Equalizer({ playing }: { playing: boolean }) {
  const bars = [
    [3, 9, 5, 10, 4],
    [8, 4, 10, 3, 7],
    [5, 10, 3, 8, 6],
    [9, 3, 7, 5, 10],
  ];
  return (
    <div className="flex items-end gap-[2px] h-[10px]">
      {bars.map((h, i) => (
        <motion.span
          key={i}
          className="w-[2px] rounded-sm bg-[#1ed760]"
          animate={playing ? { height: h } : { height: 2 }}
          transition={
            playing
              ? { duration: 0.9 + i * 0.12, repeat: Infinity, repeatType: 'mirror', ease: 'easeInOut' }
              : { duration: 0.3 }
          }
        />
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------
// BOOT SCREEN
// ---------------------------------------------------------------------
function BootScreen({
  progress,
  showStart,
  onStart,
}: {
  progress: number;
  showStart: boolean;
  onStart: () => void;
}) {
  const blocks = 20;
  const filled = Math.round((progress / 100) * blocks);
  const text = progress < 50 ? 'INSERTING CARTRIDGE...' : 'LOADING LEVEL 17...';

  return (
    <main
      onClick={showStart ? onStart : undefined}
      className={`min-h-[100dvh] w-full flex flex-col items-center justify-center gap-8 p-6 select-none ${
        showStart ? 'cursor-pointer' : ''
      }`}
      style={{ background: LCD.darkest, color: LCD.lightest }}
    >
      <motion.div
        initial={{ y: -40, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.5 }}
        className="flex flex-col items-center gap-3"
      >
        {/* Ilustrasi kaset pixel */}
        <motion.div
          animate={{ y: [-30, 0, 0] }}
          transition={{ duration: 1.2, times: [0, 0.6, 1], ease: 'easeOut' }}
          className="relative w-24 h-28 rounded-t-md rounded-br-2xl border-4"
          style={{ borderColor: LCD.lightest, background: LCD.dark }}
        >
          <div className="absolute top-2 left-2 right-2 h-3" style={{ background: LCD.darkest }} />
          <div
            className="absolute top-7 left-2 right-2 bottom-4 flex items-center justify-center text-[10px] text-center leading-tight"
            style={{ background: LCD.lightest, color: LCD.darkest }}
          >
            LV
            <br />
            17
          </div>
        </motion.div>
        <p className="text-[10px] tracking-widest opacity-70">Happy Birthday!</p>
      </motion.div>

      <div className="min-h-[60px] flex flex-col items-center justify-center">
        <AnimatePresence mode="wait">
          {showStart ? (
            <motion.div
              key="start"
              initial={{ scale: 0.5, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ type: 'spring', stiffness: 220, damping: 12 }}
              className="flex flex-col items-center gap-3"
            >
              <motion.button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onStart();
                }}
                animate={{ scale: [1, 1.07, 1] }}
                transition={{ duration: 1, repeat: Infinity }}
                className="px-5 py-3 text-[12px] sm:text-sm border-4"
                style={{ borderColor: LCD.lightest, background: LCD.dark }}
              >
                <span className="blink">▶</span> PRESS START
              </motion.button>
              <p className="text-[7px] opacity-70 text-center leading-relaxed">
                TAP LAYAR / ENTER ♪ NYALAKAN SUARA
              </p>
            </motion.div>
          ) : (
            <motion.p key="loading" exit={{ opacity: 0 }} className="blink text-[11px] sm:text-sm text-center">
              {text}
            </motion.p>
          )}
        </AnimatePresence>
      </div>

      <div className="w-full max-w-sm">
        <div className="flex gap-[3px] p-[5px] border-4" style={{ borderColor: LCD.lightest }}>
          {Array.from({ length: blocks }).map((_, i) => (
            <div
              key={i}
              className="h-4 flex-1 transition-colors duration-100"
              style={{ background: i < filled ? LCD.lightest : 'transparent' }}
            />
          ))}
        </div>
        <p className="mt-3 text-right text-[10px]">{progress}%</p>
      </div>
    </main>
  );
}

// ---------------------------------------------------------------------
// BODI GAMEBOY
// ---------------------------------------------------------------------
function GameBoyBody({
  children,
  screenControls,
  onInput,
  repeatEnabled,
}: {
  children: React.ReactNode;
  screenControls: ReturnType<typeof useAnimationControls>;
  onInput: (b: Btn) => void;
  repeatEnabled: boolean;
}) {
  return (
    <div
      className="relative w-full rounded-t-[18px] rounded-bl-[18px] rounded-br-[64px] px-[6%] pt-[6%] pb-[8%]"
      style={{
        background: 'linear-gradient(160deg,#d8d4cc 0%,#c4c0b8 55%,#b3afa6 100%)',
        boxShadow:
          'inset -6px -8px 0 rgba(0,0,0,0.12), inset 4px 4px 0 rgba(255,255,255,0.5), 0 25px 50px rgba(0,0,0,0.55)',
      }}
    >
      {/* Garis atas casing */}
      <div className="absolute top-[10px] left-[18px] right-[18px] flex justify-between text-[6px] text-[#8b877f]">
        <span>◄ OFF·ON ►</span>
        <span>LVL·17</span>
      </div>

      {/* Bingkai layar */}
      <motion.div
        animate={screenControls}
        className="relative mt-3 rounded-t-[10px] rounded-bl-[10px] rounded-br-[40px] px-[9%] pt-[5%] pb-[7%]"
        style={{ background: '#5f6072', boxShadow: 'inset 0 -3px 0 rgba(0,0,0,0.3)' }}
      >
        <div className="flex items-center gap-2 mb-[4%]">
          <div className="h-[2px] flex-1 bg-[#3d5afe]/70" />
          <span className="text-[5px] sm:text-[6px] text-[#c9c9d6] tracking-wider whitespace-nowrap">
            DOT MATRIX WITH 8-BIT SOUND
          </span>
          <div className="h-[2px] w-[12%] bg-[#3d5afe]/70" />
        </div>

        {/* LED baterai */}
        <div className="absolute left-[3%] top-[38%] flex flex-col items-center gap-1">
          <motion.div
            animate={{ opacity: [1, 0.55, 1] }}
            transition={{ duration: 2, repeat: Infinity }}
            className="w-[7px] h-[7px] rounded-full bg-[#ff3b30] shadow-[0_0_6px_#ff3b30]"
          />
          <span className="text-[4px] text-[#c9c9d6]">BATTERY</span>
        </div>

        {/* LCD */}
        <div
          className="relative w-full aspect-[10/9] overflow-hidden rounded-[2px]"
          style={{
            background: LCD.lightest,
            boxShadow: 'inset 3px 3px 0 rgba(15,56,15,0.35)',
            color: LCD.darkest,
          }}
        >
          {children}
          <div className="lcd-scanlines pointer-events-none absolute inset-0" />
        </div>
      </motion.div>

      {/* Logo */}
      <div className="mt-[4%] flex items-baseline gap-2 pl-1">
        <span className="text-[10px] sm:text-[12px] italic font-bold text-[#2a2f86]">RETRO</span>
        <span className="text-[13px] sm:text-[16px] italic text-[#2a2f86]">GAME BOY</span>
        <span className="text-[7px] text-[#2a2f86]">TM</span>
      </div>

      {/* Kontrol */}
      <div className="mt-[8%] flex items-center justify-between">
        <DPad onInput={onInput} repeatEnabled={repeatEnabled} />
        <div className="flex items-end gap-[14px] -rotate-[25deg] mr-1">
          <RoundButton label="B" onInput={onInput} btn="B" className="translate-y-3" />
          <RoundButton label="A" onInput={onInput} btn="A" />
        </div>
      </div>

      {/* Select / Start */}
      <div className="mt-[9%] flex justify-center gap-6">
        <PillButton label="SELECT" btn="SELECT" onInput={onInput} />
        <PillButton label="START" btn="START" onInput={onInput} />
      </div>

      {/* Speaker grille */}
      <div className="absolute right-[7%] bottom-[5%] flex gap-[6px] -rotate-[28deg]">
        {Array.from({ length: 6 }).map((_, i) => (
          <div
            key={i}
            className="w-[5px] h-[42px] rounded-full"
            style={{ background: '#8f8b83', boxShadow: 'inset 1px 1px 0 rgba(0,0,0,0.35)' }}
          />
        ))}
      </div>
    </div>
  );
}

// Hook tombol fisik: tekan sekali langsung jalan, tahan = auto-repeat (untuk D-Pad saat main Tetris)
function usePressHandlers(onPress: () => void, repeat: boolean) {
  const delayRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pressRef = useRef(onPress);
  useEffect(() => {
    pressRef.current = onPress;
  }, [onPress]);

  const stop = useCallback(() => {
    if (delayRef.current) clearTimeout(delayRef.current);
    if (intervalRef.current) clearInterval(intervalRef.current);
    delayRef.current = null;
    intervalRef.current = null;
  }, []);

  useEffect(() => stop, [stop]);

  return {
    onPointerDown: (e: React.PointerEvent) => {
      e.preventDefault();
      pressRef.current();
      if (repeat) {
        stop();
        delayRef.current = setTimeout(() => {
          intervalRef.current = setInterval(() => pressRef.current(), 80);
        }, 220);
      }
    },
    onPointerUp: stop,
    onPointerLeave: stop,
    onPointerCancel: stop,
    onContextMenu: (e: React.MouseEvent) => e.preventDefault(),
  };
}

function DPadKey({
  btn,
  onInput,
  repeat,
  className,
  arrow,
}: {
  btn: Btn;
  onInput: (b: Btn) => void;
  repeat: boolean;
  className: string;
  arrow: string;
}) {
  const handlers = usePressHandlers(() => onInput(btn), repeat);
  return (
    <motion.button
      type="button"
      aria-label={btn}
      whileTap={{ scale: 0.88, backgroundColor: '#111' }}
      className={`absolute flex items-center justify-center bg-[#26262b] text-[#555] text-[8px] touch-none ${className}`}
      style={{ boxShadow: 'inset -2px -3px 0 rgba(0,0,0,0.5)' }}
      {...handlers}
    >
      {arrow}
    </motion.button>
  );
}

function DPad({ onInput, repeatEnabled }: { onInput: (b: Btn) => void; repeatEnabled: boolean }) {
  return (
    <div className="relative w-[104px] h-[104px] sm:w-[112px] sm:h-[112px] shrink-0">
      <DPadKey btn="UP" arrow="▲" onInput={onInput} repeat={false} className="left-1/3 top-0 w-1/3 h-[36%] rounded-t-[4px]" />
      <DPadKey btn="DOWN" arrow="▼" onInput={onInput} repeat={repeatEnabled} className="left-1/3 bottom-0 w-1/3 h-[36%] rounded-b-[4px]" />
      <DPadKey btn="LEFT" arrow="◀" onInput={onInput} repeat={repeatEnabled} className="left-0 top-1/3 w-[36%] h-1/3 rounded-l-[4px]" />
      <DPadKey btn="RIGHT" arrow="▶" onInput={onInput} repeat={repeatEnabled} className="right-0 top-1/3 w-[36%] h-1/3 rounded-r-[4px]" />
      <div className="absolute left-1/3 top-1/3 w-1/3 h-1/3 bg-[#26262b] pointer-events-none flex items-center justify-center">
        <div className="w-[60%] h-[60%] rounded-full bg-[#1c1c20]" />
      </div>
    </div>
  );
}

function RoundButton({
  label,
  btn,
  onInput,
  className = '',
}: {
  label: string;
  btn: Btn;
  onInput: (b: Btn) => void;
  className?: string;
}) {
  const handlers = usePressHandlers(() => onInput(btn), false);
  return (
    <div className={`flex flex-col items-center gap-1 ${className}`}>
      <motion.button
        type="button"
        aria-label={`Tombol ${label}`}
        whileTap={{ scale: 0.86 }}
        className="w-[46px] h-[46px] sm:w-[50px] sm:h-[50px] rounded-full touch-none"
        style={{
          background: 'radial-gradient(circle at 35% 30%,#c0392b 0%,#8f1d21 70%)',
          boxShadow: 'inset -3px -4px 0 rgba(0,0,0,0.35), 0 3px 0 rgba(0,0,0,0.25)',
        }}
        {...handlers}
      />
      <span className="text-[9px] text-[#2a2f86]">{label}</span>
    </div>
  );
}

function PillButton({ label, btn, onInput }: { label: string; btn: Btn; onInput: (b: Btn) => void }) {
  const handlers = usePressHandlers(() => onInput(btn), false);
  return (
    <div className="flex flex-col items-center gap-1 -rotate-[25deg]">
      <motion.button
        type="button"
        aria-label={label}
        whileTap={{ scale: 0.85 }}
        className="w-[46px] h-[12px] rounded-full bg-[#7d7b80] touch-none"
        style={{ boxShadow: 'inset -1px -2px 0 rgba(0,0,0,0.4)' }}
        {...handlers}
      />
      <span className="text-[6px] text-[#2a2f86]">{label}</span>
    </div>
  );
}

// ---------------------------------------------------------------------
// LAYAR-LAYAR LCD
// ---------------------------------------------------------------------
function ScreenWrap({ children }: { children: React.ReactNode }) {
  return (
    <motion.div
      initial={{ opacity: 0, filter: 'brightness(1.6)' }}
      animate={{ opacity: 1, filter: 'brightness(1)' }}
      exit={{ opacity: 0, filter: 'brightness(0.4)' }}
      transition={{ duration: 0.25 }}
      className="absolute inset-0"
    >
      {children}
    </motion.div>
  );
}

function MenuButton({
  children,
  active,
  disabled,
  onClick,
  onHover,
}: {
  children: React.ReactNode;
  active: boolean;
  disabled?: boolean;
  onClick: () => void;
  onHover: () => void;
}) {
  return (
    <motion.button
      type="button"
      onClick={onClick}
      onMouseEnter={onHover}
      whileTap={{ scale: 0.95 }}
      className="relative w-full flex items-center gap-2 px-2 py-[7px] text-left text-[8px] sm:text-[9px] border-2"
      style={{
        borderColor: disabled ? '#6b7a5a' : LCD.darkest,
        background: disabled ? '#a7ad98' : active ? LCD.darkest : LCD.light,
        color: disabled ? '#5d6152' : active ? LCD.lightest : LCD.darkest,
        boxShadow: disabled ? 'none' : `2px 2px 0 ${LCD.dark}`,
      }}
    >
      <span className={active ? 'blink' : 'opacity-0'}>▶</span>
      <span className="flex-1">{children}</span>
    </motion.button>
  );
}

function HomeScreen({
  unlocked,
  selected,
  lockedWarning,
  onHover,
  onPlay,
  onReward,
}: {
  unlocked: boolean;
  selected: number;
  lockedWarning: boolean;
  onHover: (i: number) => void;
  onPlay: () => void;
  onReward: () => void;
}) {
  return (
    <div className="h-full w-full flex flex-col items-center justify-between p-[6%] text-center">
      <div className="flex-1 flex items-center justify-center w-full">
        <AnimatePresence mode="wait">
          {lockedWarning ? (
            <motion.p
              key="warn"
              initial={{ scale: 0.6, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.6, opacity: 0 }}
              className="text-[9px] sm:text-[10px] leading-[1.8]"
            >
              ⚠ Main game dulu baru bisa ambil hadiah!
            </motion.p>
          ) : (
            <motion.div
              key="title"
              initial={{ y: -8, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 8, opacity: 0 }}
              className="flex flex-col items-center gap-2"
            >
              <motion.p
                animate={{ y: [0, -2, 0] }}
                transition={{ duration: 1.6, repeat: Infinity }}
                className="text-[9px] sm:text-[10px] leading-[1.8]"
              >
                HAPPY BIRTHDAY YANG KE-17 TAHUN,
              </motion.p>
              <p
                className="text-[12px] sm:text-[14px] leading-[1.5] break-words px-1 py-1"
                style={{ background: LCD.darkest, color: LCD.lightest }}
              >
                {NAMA_ADIK}!
              </p>
              <p className="text-[6px] opacity-70 mt-1">★ LEVEL 17 UNLOCKED ★</p>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <div className="w-full flex flex-col gap-2">
        <MenuButton active={selected === 0} onClick={onPlay} onHover={() => onHover(0)}>
          Main Game
        </MenuButton>
        <MenuButton
          active={selected === 1}
          disabled={!unlocked}
          onClick={onReward}
          onHover={() => onHover(1)}
        >
          <span className="flex items-center justify-between w-full">
            <span>Hadiah</span>
            <span className="text-[7px]">{unlocked ? '★' : '🔒'}</span>
          </span>
        </MenuButton>
      </div>
    </div>
  );
}

function TetrisScreen({
  game,
  onBack,
  onRetry,
}: {
  game: GameState;
  onBack: () => void;
  onRetry: () => void;
}) {
  // Gabungkan board + balok yang sedang jatuh
  const display: Cell[][] = game.board.map((row) => [...row]);
  if (game.piece) {
    const p = game.piece;
    p.shape.forEach((row, r) =>
      row.forEach((v, c) => {
        const y = p.y + r;
        const x = p.x + c;
        if (v && y >= 0 && y < ROWS && x >= 0 && x < COLS) display[y][x] = p.type;
      })
    );
  }

  const progress = Math.min(100, (game.score / TARGET_SKOR) * 100);
  const nextShape = SHAPES[game.next];

  return (
    <div className="relative h-full w-full flex gap-[4%] p-[4%]">
      {/* Papan */}
      <div
        className="h-full aspect-[10/16] grid border-2"
        style={{
          gridTemplateColumns: `repeat(${COLS}, 1fr)`,
          gridTemplateRows: `repeat(${ROWS}, 1fr)`,
          borderColor: LCD.darkest,
          background: LCD.light,
        }}
      >
        {display.map((row, y) =>
          row.map((cell, x) => (
            <div
              key={`${y}-${x}`}
              className="relative"
              style={
                cell
                  ? {
                      background: CELL_STYLE[cell].bg,
                      boxShadow: `inset 0 0 0 1px ${LCD.lightest}`,
                    }
                  : undefined
              }
            >
              {cell && (
                <div
                  className="absolute inset-[30%]"
                  style={{ background: CELL_STYLE[cell].inner }}
                />
              )}
            </div>
          ))
        )}
      </div>

      {/* Panel info */}
      <div className="flex-1 flex flex-col gap-2 text-[7px] sm:text-[8px] min-w-0">
        <div>
          <p className="opacity-70">SKOR</p>
          <motion.p
            key={game.score}
            initial={{ scale: 1.6 }}
            animate={{ scale: 1 }}
            className="text-[12px] sm:text-[14px] origin-left"
          >
            {game.score}
          </motion.p>
        </div>
        <div>
          <p className="opacity-70">TARGET</p>
          <p>{TARGET_SKOR}</p>
          <div className="mt-1 h-[6px] w-full border" style={{ borderColor: LCD.darkest }}>
            <div className="h-full transition-all" style={{ width: `${progress}%`, background: LCD.darkest }} />
          </div>
        </div>
        <div>
          <p className="opacity-70 mb-1">NEXT</p>
          <div className="inline-flex flex-col gap-[1px]">
            {nextShape.map((row, r) => (
              <div key={r} className="flex gap-[1px]">
                {row.map((v, c) => (
                  <div
                    key={c}
                    className="w-[7px] h-[7px]"
                    style={{ background: v ? LCD.darkest : 'transparent' }}
                  />
                ))}
              </div>
            ))}
          </div>
        </div>
        <div className="mt-auto leading-[1.7] text-[5px] sm:text-[6px] opacity-80">
          <p>LANDING +{POIN_MENDARAT}</p>
          <p>GARIS +{POIN_GARIS}</p>
          <p>A=PUTAR B=JATUH</p>
          <p>SELECT=MENU</p>
        </div>
      </div>

      {/* Overlay menang */}
      <AnimatePresence>
        {game.status === 'WIN' && (
          <motion.div
            initial={{ opacity: 0, scale: 0.5 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ type: 'spring', stiffness: 200, damping: 12 }}
            className="absolute inset-[6%] flex flex-col items-center justify-center gap-3 text-center border-4 p-2"
            style={{ background: LCD.lightest, borderColor: LCD.darkest }}
          >
            <motion.p
              animate={{ scale: [1, 1.08, 1] }}
              transition={{ duration: 0.8, repeat: Infinity }}
              className="text-[10px] sm:text-[11px] leading-[1.8]"
            >
              GAME BERHASIL!
              <br />
              HADIAH TERBUKA
            </motion.p>
            <p className="text-[6px] leading-[1.8] opacity-80">
              Gokil juga {NAMA_ADIK}.Kirain bakal nyerah di skor 4 😏
            </p>
            <button
              type="button"
              onClick={onBack}
              className="text-[8px] px-3 py-2 border-2"
              style={{ background: LCD.darkest, color: LCD.lightest, borderColor: LCD.darkest }}
            >
              <span className="blink">▶</span> KE MENU (START)
            </button>
          </motion.div>
        )}
        {game.status === 'OVER' && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="absolute inset-[6%] flex flex-col items-center justify-center gap-3 text-center border-4 p-2"
            style={{ background: LCD.lightest, borderColor: LCD.darkest }}
          >
            <p className="text-[10px]">GAME OVER</p>
            <p className="text-[6px] leading-[1.8]">Yah, masa kalah sih? Ulang lagi, jangan cupu!</p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={onRetry}
                className="text-[7px] px-2 py-2"
                style={{ background: LCD.darkest, color: LCD.lightest }}
              >
                ULANG (A)
              </button>
              <button type="button" onClick={onBack} className="text-[7px] px-2 py-2 border-2" style={{ borderColor: LCD.darkest }}>
                MENU (B)
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

const REWARD_OPTIONS = [
  { id: 'iphone', label: 'iPhone 17 Pro Max' },
  { id: 'macbook', label: 'MacBook Pro M5' },
  { id: 'abang', label: 'Diskusi aja deh :(' },
] as const;

function RewardScreen({
  selected,
  pranked,
  onHover,
  onChoose,
  onBack,
}: {
  selected: number;
  pranked: string[];
  onHover: (i: number) => void;
  onChoose: (i: number) => void;
  onBack: () => void;
}) {
  const allPranked = pranked.includes('iphone') && pranked.includes('macbook');

  return (
    <div className="h-full w-full flex flex-col p-[5%] gap-2">
      <div className="flex items-center justify-between">
        <button type="button" onClick={onBack} className="text-[7px] opacity-70">
          ◀ B
        </button>
        <p className="text-[8px] sm:text-[9px]">PILIH HADIAH</p>
        <span className="text-[7px] opacity-0">◀ B</span>
      </div>

      <div className="flex-1 flex flex-col justify-center gap-2">
        {REWARD_OPTIONS.map((opt, i) => {
          const isPranked = pranked.includes(opt.id);
          return (
            <div key={opt.id} className="relative h-[30px] sm:h-[34px]">
              <AnimatePresence mode="wait">
                {!isPranked ? (
                  <motion.button
                    key="btn"
                    type="button"
                    onClick={() => onChoose(i)}
                    onMouseEnter={() => onHover(i)}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{
                      opacity: [1, 0.7, 1, 0.4, 0],
                      scale: [1, 1.05, 0.9, 0.6, 0],
                      x: [0, -6, 5, -3, 0],
                      skewX: [0, 12, -12, 6, 0],
                      filter: ['blur(0px)', 'blur(0px)', 'blur(1px)', 'blur(2px)', 'blur(4px)'],
                      transition: { duration: 0.9, ease: 'easeIn' },
                    }}
                    whileTap={{ scale: 0.95 }}
                    className="absolute inset-0 flex items-center gap-2 px-2 text-left text-[7px] sm:text-[8px] border-2"
                    style={{
                      borderColor: LCD.darkest,
                      background: selected === i ? LCD.darkest : LCD.light,
                      color: selected === i ? LCD.lightest : LCD.darkest,
                      boxShadow: `2px 2px 0 ${LCD.dark}`,
                    }}
                  >
                    <span className={selected === i ? 'blink' : 'opacity-0'}>▶</span>
                    <span className="flex-1">{opt.label}</span>
                    {opt.id === 'abang' && <span className="text-[6px]">WA</span>}
                  </motion.button>
                ) : (
                  <motion.p
                    key="prank"
                    initial={{ opacity: 0, y: 6, letterSpacing: '0.3em' }}
                    animate={{ opacity: 1, y: 0, letterSpacing: '0em' }}
                    transition={{ duration: 0.8, ease: 'easeOut' }}
                    onMouseEnter={() => onHover(i)}
                    className="absolute inset-0 flex items-center justify-center text-center text-[7px] sm:text-[8px] border-2 border-dashed"
                    style={{ borderColor: LCD.dark }}
                  >
                    Mencet apa? betul ga?
                  </motion.p>
                )}
              </AnimatePresence>
            </div>
          );
        })}
      </div>

      <p className="text-center text-[5px] sm:text-[6px] leading-[1.8] opacity-80 min-h-[2em]">
        {allPranked
          ? 'Udah, pilihan terakhir nih. Gak usah malu-malu 😜'
          : 'Pilih yang bener ya, Ja. Mwhehehehe.'}
      </p>
    </div>
  );
}
