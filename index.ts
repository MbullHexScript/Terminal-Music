#!/usr/bin/env bun

import { input, select } from '@inquirer/prompts';
import ytSearch from 'yt-search';
import { spawn } from 'child_process';
import { promisify } from 'util';
import { exec as execCallback } from 'child_process';

const exec = promisify(execCallback);

// ─── ANSI Color Palette ───────────────────────────────────────────────────────
const c = {
  reset:         '\x1b[0m',
  bold:          '\x1b[1m',
  dim:           '\x1b[2m',
  green:         '\x1b[32m',
  brightGreen:   '\x1b[92m',
  cyan:          '\x1b[36m',
  brightCyan:    '\x1b[96m',
  yellow:        '\x1b[33m',
  brightYellow:  '\x1b[93m',
  red:           '\x1b[31m',
  brightRed:     '\x1b[91m',
  gray:          '\x1b[90m',
  white:         '\x1b[97m',
  magenta:       '\x1b[35m',
  brightMagenta: '\x1b[95m',
};

// ─── UI Helpers ───────────────────────────────────────────────────────────────
const W = 62;

function stripAnsi(str: string): string {
  return str.replace(/\x1b\[[0-9;]*m/g, '');
}

function centerPad(text: string, width = W): string {
  const clean = stripAnsi(text);
  const total = width - clean.length;
  const left  = Math.floor(total / 2);
  const right = total - left;
  return ' '.repeat(Math.max(0, left)) + text + ' '.repeat(Math.max(0, right));
}

function boxLine(inner: string): string {
  const clean = stripAnsi(inner);
  const pad   = W - clean.length;
  return `  ${c.green}║${c.reset}${inner}${' '.repeat(Math.max(0, pad))}${c.green}║${c.reset}`;
}

function boxTop():    string { return `  ${c.green}╔${'═'.repeat(W)}╗${c.reset}`; }
function boxBottom(): string { return `  ${c.green}╚${'═'.repeat(W)}╝${c.reset}`; }
function boxDiv():    string { return `  ${c.green}╠${'═'.repeat(W)}╣${c.reset}`; }

function spinner(frame: number): string {
  return ['◢', '◣', '◤', '◥'][frame % 4]!;
}

// ─── ASCII Art Header ─────────────────────────────────────────────────────────
function printHeader(): void {
  console.clear();
  const g  = c.brightGreen;
  const cy = c.brightCyan;
  const gr = c.gray;
  const rs = c.reset;
  console.log(`
${g}  ╔══════════════════════════════════════════════════════════════╗${rs}
${g}  ║${rs}  ${gr}SYSTEM  : TERMINAL MUSIC YOUTUBE PLAYER${rs}  ${g}║${rs}
${g}  ║${rs}  ${gr}STATUS  : ${cy}● ONLINE  ${gr}│ SIGNAL : ${cy}████████████ 100%            ${rs}  ${g}║${rs}
${g}  ╚══════════════════════════════════════════════════════════════╝${rs}
`);
}

// ─── Now Playing Loader ───────────────────────────────────────────────────────
async function printNowPlayingLoader(title: string): Promise<void> {
  const shortTitle = title.length > 48 ? title.substring(0, 46) + '..' : title;
  console.log(boxTop());
  console.log(boxLine(centerPad(`${c.brightGreen}▶  ${shortTitle}  ◀${c.reset}`)));

  for (let i = 0; i <= 8; i++) {
    const filled = i * 7;
    const empty  = W - 4 - filled;
    const bar    = `  ${c.brightGreen}${'▓'.repeat(filled)}${c.green}${'░'.repeat(Math.max(0, empty))}${c.reset}  `;
    const status = centerPad(`${c.gray}PIPING STREAM ${spinner(i)} BUFFERING AUDIO DATA...${c.reset}`);
    process.stdout.write('\x1b[2A');
    console.log(boxLine(bar));
    console.log(boxLine(status));
    await Bun.sleep(90);
  }

  console.log(boxDiv());
  console.log(boxLine(`  ${c.gray}[SYS]${c.reset} ${c.brightGreen}DIRECT PIPE ESTABLISHED ─ NO URL EXPIRY${c.reset}`));
  console.log(boxLine(`  ${c.gray}[CTL]${c.reset} ${c.brightYellow}ESC${c.reset} ${c.gray}→ STOP  │  CTRL+C → TERMINATE SESSION${c.reset}`));
  console.log(boxDiv());
  process.stdout.write(boxLine('  '));
}

// ─── Progress Bar ─────────────────────────────────────────────────────────────
function formatTime(s: number): string {
  const m = Math.floor(s / 60);
  return `${m}:${Math.floor(s % 60).toString().padStart(2, '0')}`;
}

function parseDuration(ts: string): number {
  const p = ts.split(':').map(Number);
  if (p.length === 2) return p[0]! * 60 + p[1]!;
  if (p.length === 3) return p[0]! * 3600 + p[1]! * 60 + p[2]!;
  return 0;
}

function drawProgress(current: number, total: number): void {
  const barW   = 34;
  const pct    = Math.min(current / total, 1);
  const filled = Math.floor(barW * pct);
  const bar    = `${c.brightGreen}${'▓'.repeat(filled)}${c.green}${'░'.repeat(barW - filled)}${c.reset}`;
  const time   = `${c.brightCyan}${formatTime(current)}${c.gray}/${c.brightCyan}${formatTime(total)}${c.reset}`;
  const pctStr = `${c.brightYellow}${String(Math.floor(pct * 100)).padStart(3)}%${c.reset}`;
  const inner  = `  ${c.gray}▶${c.reset} ${bar} ${time} ${pctStr}  `;
  process.stdout.write(`\r${boxLine(inner)}`);
}

// ─── Binary Detection ─────────────────────────────────────────────────────────
async function findBinary(name: string): Promise<string> {
  const isWindows = process.platform === 'win32';
  try {
    const { stdout } = await exec(isWindows ? `where ${name}` : `which ${name}`);
    return stdout.trim().split('\n')[0]!.trim();
  } catch {
    throw new Error(
      `${c.brightRed}[ERR]${c.reset} Binary "${c.brightCyan}${name}${c.reset}" not found in PATH.\n` +
      `      ${c.gray}→ yt-dlp : https://github.com/yt-dlp/yt-dlp/releases/latest\n` +
      `      → ffmpeg : https://ffmpeg.org/download.html${c.reset}`
    );
  }
}

// ─── YouTube Search ───────────────────────────────────────────────────────────
interface VideoInfo {
  title: string;
  videoId: string;
  url: string;
  duration: { timestamp: string };
  author: { name: string };
}

async function searchYouTube(query: string): Promise<VideoInfo[]> {
  try {
    const result = await ytSearch(query);
    return result.videos.slice(0, 10);
  } catch (error) {
    console.error(`${c.brightRed}[ERR]${c.reset} Search failed:`, error);
    return [];
  }
}

// ─── Audio Playback (PIPE MODE — no URL expiry) ───────────────────────────────
//
// Sebelumnya: yt-dlp -g → URL → ffplay buka URL (URL bisa expire di tengah lagu)
// Sekarang  : yt-dlp stdout ──pipe──► ffplay stdin (tidak ada URL, tidak bisa expire)
//
async function playAudio(
  videoUrl: string,
  duration: string,
  title: string
): Promise<{ stoppedByUser: boolean }> {
  try {
    await printNowPlayingLoader(title);

    const ytDlpBin  = await findBinary('yt-dlp');
    const ffplayBin = await findBinary('ffplay');

    const totalSecs = parseDuration(duration);

    // Spawn yt-dlp dengan output ke stdout (-o -)
    const ytDlp = spawn(ytDlpBin, [
      '-f', 'bestaudio',
      '-o', '-',        // output audio stream ke stdout
      '--quiet',
      '--no-warnings',
      videoUrl,
    ], { shell: false, stdio: ['ignore', 'pipe', 'pipe'] });

    // Spawn ffplay yang baca dari stdin (pipe:0)
    const ffplay = spawn(ffplayBin, [
      '-nodisp',
      '-autoexit',
      '-loglevel', 'quiet',
      '-i', 'pipe:0',  // baca audio dari stdin
    ], { shell: false, stdio: ['pipe', 'ignore', 'ignore'] });

    // ─── PIPE: yt-dlp stdout ──► ffplay stdin ────────────────────────────────
    ytDlp.stdout.pipe(ffplay.stdin!);

    // Ignore broken pipe error (terjadi saat user stop sebelum lagu selesai)
    ffplay.stdin!.on('error', () => {});
    ytDlp.stdout.on('error', () => {});

    // Log yt-dlp errors tapi jangan crash
    ytDlp.stderr.on('data', (data: Buffer) => {
      const msg = data.toString().trim();
      if (msg && !msg.includes('WARNING')) {
        // silent — bisa uncomment baris bawah untuk debug
        // process.stderr.write(`${c.gray}[ytdlp] ${msg}${c.reset}\n`);
      }
    });

    if (process.stdin.isTTY) {
      process.stdin.setRawMode(true);
      process.stdin.resume();
    }

    return new Promise<{ stoppedByUser: boolean }>((resolve, reject) => {
      let currentTime = 0;
      let settled     = false;

      const progressInterval = setInterval(() => {
        currentTime++;
        if (currentTime <= totalSecs) drawProgress(currentTime, totalSecs);
      }, 1000);

      const cleanup = () => {
        if (settled) return;
        settled = true;
        clearInterval(progressInterval);
        if (process.stdin.isTTY) {
          process.stdin.setRawMode(false);
          process.stdin.pause();
        }
        process.stdin.removeListener('data', keyHandler);
        process.removeListener('SIGINT', sigintHandler);
        process.stdout.write('\n');
        console.log(boxBottom() + '\n');
      };

      const killAll = () => {
        try { ytDlp.kill('SIGKILL'); }  catch {}
        try { ffplay.kill('SIGKILL'); } catch {}
      };

      const keyHandler = (data: Buffer) => {
        if (data[0] === 27) { // ESC
          killAll();
          cleanup();
          console.log(`  ${c.yellow}[SYS]${c.reset} ${c.gray}STREAM TERMINATED BY USER ─ SESSION INTACT${c.reset}\n`);
          resolve({ stoppedByUser: true });
        }
      };

      const sigintHandler = () => {
        killAll();
        cleanup();
        console.log(`\n  ${c.brightRed}[SYS]${c.reset} ${c.gray}FORCE SHUTDOWN ─ CONNECTION CLOSED${c.reset}\n`);
        process.exit(0);
      };

      process.stdin.on('data', keyHandler);
      process.on('SIGINT', sigintHandler);

      // ffplay selesai = lagu selesai
      ffplay.on('close', (code) => {
        // Pastikan yt-dlp juga dihentikan
        try { ytDlp.kill(); } catch {}
        cleanup();
        if (!settled) {
          if (code === 0 || code === null) {
            console.log(`  ${c.brightGreen}[SYS]${c.reset} ${c.gray}STREAM COMPLETE ─ BUFFER FLUSHED${c.reset}\n`);
            resolve({ stoppedByUser: false });
          } else {
            reject(new Error(`ffplay exited with code ${code}`));
          }
        }
      });

      // yt-dlp error (network, dll)
      ytDlp.on('close', (code) => {
        if (code !== 0 && code !== null && !settled) {
          killAll();
          cleanup();
          reject(new Error(`yt-dlp exited with code ${code} — check internet connection`));
        }
      });

      ffplay.on('error', (err) => { if (!settled) { cleanup(); reject(err); } });
      ytDlp.on('error',  (err) => { if (!settled) { cleanup(); reject(err); } });
    });

  } catch (error) {
    console.error(`\n  ${c.brightRed}[ERR]${c.reset} PLAYBACK FAILED:`, error instanceof Error ? error.message : error);
    throw error;
  }
}

// ─── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  printHeader();

  try {
    await findBinary('yt-dlp');
    await findBinary('ffplay');
    console.log(`  ${c.gray}[SYS]${c.reset} ${c.brightGreen}ALL SYSTEMS NOMINAL ─ READY TO INTERCEPT STREAMS${c.reset}\n`);
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  }

  while (true) {
    try {
      console.log(boxTop());
      console.log(boxLine(`  ${c.gray}SEARCH TARGET${c.reset}`));
      console.log(boxBottom());

      const query = await input({
        message: `${c.brightGreen}►${c.reset}`,
        transformer: (val) => `${c.brightCyan}${val}${c.reset}`,
      });

      if (!query.trim()) {
        console.log(`  ${c.yellow}[WARN]${c.reset} ${c.gray}EMPTY QUERY ─ INPUT REQUIRED${c.reset}\n`);
        continue;
      }

      process.stdout.write(`\n  ${c.gray}[NET]${c.reset} ${c.brightGreen}SCANNING NETWORK`);
      for (let i = 0; i < 8; i++) {
        await Bun.sleep(100);
        process.stdout.write(`${c.green}·${c.reset}`);
      }
      process.stdout.write(` ${c.brightGreen}SIGNAL FOUND${c.reset}\n\n`);

      const results = await searchYouTube(query);

      if (results.length === 0) {
        console.log(`  ${c.brightRed}[ERR]${c.reset} ${c.gray}NO STREAMS FOUND ─ QUERY RETURNED EMPTY${c.reset}\n`);
        continue;
      }

      console.log(`  ${c.gray}[SYS]${c.reset} ${c.brightGreen}${results.length} STREAMS INTERCEPTED ─ AWAITING SELECTION${c.reset}\n`);

      let keepResults = true;
      while (keepResults) {
        console.log(boxTop());
        console.log(boxLine(centerPad(`${c.brightCyan}◈ INTERCEPTED STREAMS ◈${c.reset}`)));
        console.log(boxBottom());

        const choices = [
          { name: `${c.yellow}⟵  NEW SEARCH TARGET${c.reset}`, value: null },
          ...results.map((v, i) => ({
            name:
              `${c.gray}${String(i + 1).padStart(2, '0')}${c.reset} ` +
              `${c.brightGreen}▸${c.reset} ` +
              `${v.title.substring(0, 40).padEnd(40)} ` +
              `${c.gray}│${c.reset} ` +
              `${c.brightCyan}${v.duration.timestamp}${c.reset}`,
            value: v,
          })),
        ];

        const selected = await select({
          message: `${c.brightGreen}SELECT STREAM${c.reset}`,
          choices,
          pageSize: 12,
        });

        if (selected === null) {
          console.log(`\n  ${c.gray}[SYS]${c.reset} ${c.yellow}RESETTING SEARCH PARAMETERS...${c.reset}\n`);
          break;
        }

        console.log(`\n  ${c.gray}[SYS]${c.reset} ${c.brightGreen}TARGET LOCKED ─ INITIALIZING PIPE STREAM${c.reset}\n`);

        const { stoppedByUser } = await playAudio(
          selected.url,
          selected.duration.timestamp,
          selected.title,
        );

        keepResults = stoppedByUser;
      }

    } catch (error) {
      if (error instanceof Error && error.message.includes('User force closed')) {
        console.log(`\n  ${c.brightCyan}[SYS]${c.reset} ${c.brightGreen}CONNECTION TERMINATED ─ GOODBYE OPERATOR${c.reset}\n`);
        process.exit(0);
      }
      console.error(`  ${c.brightRed}[ERR]${c.reset}`, error);
    }
  }
}

main();
