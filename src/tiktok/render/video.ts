import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
// ffmpeg-static é CommonJS e exporta só o caminho do binário; os tipos dele não batem com import ESM.
const ffmpegStatic = createRequire(import.meta.url)("ffmpeg-static") as string | null;

// Usa o ffmpeg que vem no pacote; se o binário não foi baixado na instalação, tenta o do sistema.
function ffmpegBinary(): string {
  return ffmpegStatic && existsSync(ffmpegStatic) ? ffmpegStatic : "ffmpeg";
}

export interface VideoOptions {
  width: number;
  height: number;
  secondsPerFrame?: number;
  fps?: number;
}

// MP4 vertical sem áudio: o som em alta é escolhido no app do TikTok na hora de postar.
export async function framesToVideo(
  frames: Buffer[],
  { width, height, secondsPerFrame = 4, fps = 30 }: VideoOptions,
): Promise<Buffer> {
  const dir = await mkdtemp(path.join(tmpdir(), "kit-video-"));
  try {
    const inputs: string[] = [];
    const filters: string[] = [];
    const framesPerImage = Math.round(secondsPerFrame * fps);

    for (const [index, frame] of frames.entries()) {
      const file = path.join(dir, `frame-${index}.png`);
      await writeFile(file, frame);
      inputs.push("-i", file);
      // Zoom lento em cada quadro pra imagem não ficar parada; o 2x antes do zoom evita tremido.
      filters.push(
        `[${index}:v]scale=${width * 2}:${height * 2},` +
          `zoompan=z='min(zoom+0.0007,1.08)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)'` +
          `:d=${framesPerImage}:s=${width}x${height}:fps=${fps},setsar=1[v${index}]`,
      );
    }
    const labels = frames.map((_, index) => `[v${index}]`).join("");
    filters.push(`${labels}concat=n=${frames.length}:v=1:a=0,format=yuv420p[out]`);

    const output = path.join(dir, "kit.mp4");
    await execFileAsync(ffmpegBinary(), [
      "-hide_banner",
      "-loglevel",
      "error",
      "-y",
      ...inputs,
      "-filter_complex",
      filters.join(";"),
      "-map",
      "[out]",
      "-c:v",
      "libx264",
      "-preset",
      "veryfast",
      "-crf",
      "22",
      "-r",
      String(fps),
      "-movflags",
      "+faststart",
      output,
    ]);
    return await readFile(output);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
