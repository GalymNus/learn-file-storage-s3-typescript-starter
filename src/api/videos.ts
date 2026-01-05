import type { BunRequest } from "bun";
import path from "path";
import { randomBytes } from "crypto";

import { getBearerToken, validateJWT } from "../auth";
import { type ApiConfig } from "../config";
import { getVideo, updateVideo } from "../db/videos";
import { respondWithJSON } from "./json";
import { BadRequestError, NotFoundError, UserForbiddenError } from "./errors";


const MAX_VIDEO_UPLOAD_SIZE = 1 << 30;


export async function handlerUploadVideo(cfg: ApiConfig, req: BunRequest) {
  const { videoId } = req.params as { videoId?: string };
  const formData = await req.formData();

  if (!videoId) {
    throw new BadRequestError("Invalid video ID");
  }
  const token = getBearerToken(req.headers);
  const userID = validateJWT(token, cfg.jwtSecret);
  const video = getVideo(cfg.db, videoId);
  if (video) {
    if (video.userID != userID) {
      throw new UserForbiddenError("User is not owner");
    }
    const uploadedFile = formData.get("video");
    if (!(uploadedFile instanceof File)) {
      throw new BadRequestError("Invalid file type");
    } else {
      if (uploadedFile.size > MAX_VIDEO_UPLOAD_SIZE) {
        throw new BadRequestError("Video is bigger than 1gb!");
      }
      const mediaType = uploadedFile.type;
      if (mediaType != "video/mp4") {
        throw new BadRequestError("Video is not mp4!");
      }
      const fileData = await uploadedFile.arrayBuffer();
      let newLocalUrl;
      const fileString = Buffer.from(fileData);
      const randomFileName = randomBytes(32).toString("hex");
      try {
        const pathTemplate = `videos/${randomFileName}.mp4`;
        newLocalUrl = path.join(cfg.assetsRoot, pathTemplate);
        Bun.write(newLocalUrl, fileString);
      } catch (e) {
        console.log("error", e);
      }
      if (newLocalUrl) {
        const key = `${randomFileName}.mp4`;
        const bunFile = Bun.file(newLocalUrl);
        const s3file = cfg.s3Client.file(key, { bucket: cfg.s3Bucket });
        await s3file.write(bunFile, { type: mediaType });
        const s3FilePathTemplate = `https://${cfg.s3Bucket}.s3.${cfg.s3Region}.amazonaws.com/${randomFileName}.mp4`
        const updatedVideo = { ...video, id: videoId, videoURL: s3FilePathTemplate };
        updateVideo(cfg.db, updatedVideo);
        bunFile.delete();
        return respondWithJSON(200, { video: updatedVideo });
      }
    }
  }
  throw new NotFoundError("Video not found!");
}