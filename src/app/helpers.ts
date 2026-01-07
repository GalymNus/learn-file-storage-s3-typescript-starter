import fs from "fs";
import { NotFoundError } from "../api/errors";

export async function getVideoAspectRatio(filePath: string) {
    const pathExists = await fs.existsSync(filePath);
    if (pathExists) {
        const proc = Bun.spawn(["ffprobe", "-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height", "-of", "json", filePath], {
            stdout: "pipe",
            stderr: "pipe",
        });
        if (proc.stdout) {
            const output = await new Response(proc.stdout).text();
            const { width, height } = await JSON.parse(output).streams[0];
            const ratio = width / height;
            if (ratio > 1.7 && ratio < 1.8) {
                return "landscape";
            }
            else if (ratio > 0.5 && ratio < 0.6) {
                return "portrait";
            }
            else {
                return "other";
            }
        }
    } else {
        throw new NotFoundError("File doesnt exists!");
    }
}

export async function processVideoForFastStart(inputFilePath: string): Promise<string> {
    const outputFilePath = `${inputFilePath}.processed`;
    const output = Bun.spawn(["ffmpeg", "-i", inputFilePath, "-movflags", "faststart", "-map_metadata", "0", "-codec", "copy", "-f", "mp4", outputFilePath]);
    await output.exited;
    const exitCode = output.exitCode;
    if (exitCode !== 0) {
        throw new Error("ffmpeg failed to process video");
    }
    return outputFilePath;
}