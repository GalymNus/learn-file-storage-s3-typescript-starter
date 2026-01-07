import fs from "fs";
import { File } from "buffer";
import type { BunRequest } from "bun";
import path from "path";

import type { ApiConfig } from "../config";
import { cfg } from "../config";
import { respondWithJSON } from "./json";
import { getBearerToken, validateJWT } from "../auth";
import { getVideo, updateVideo } from "../db/videos";
import { BadRequestError, NotFoundError, UserForbiddenError } from "./errors";
import { randomBytes } from "crypto";


const MAX_THUMBNAIL_UPLOAD_SIZE = 10 << 20;

type Thumbnail = {
  data: ArrayBuffer;
  mediaType: string;
};


export async function handlerUploadThumbnail(cfg: ApiConfig, req: BunRequest) {
  const { videoId } = req.params as { videoId?: string };
  if (!videoId) {
    throw new BadRequestError("Invalid video ID");
  }

  const token = getBearerToken(req.headers);
  const userID = validateJWT(token, cfg.jwtSecret);
  const formData = await req.formData();
  const uploadedFile = formData.get("thumbnail");
  if (!(uploadedFile instanceof File)) {
    throw new BadRequestError("Invalid thumbnail");
  } else {
    if (uploadedFile.size > MAX_THUMBNAIL_UPLOAD_SIZE) {
      throw new BadRequestError("Image is bigger than 10mb!");
    }
    const mediaType = uploadedFile.type;
    const supportedTypes = ["image/jpeg", "image/png"];
    if (!supportedTypes.includes(mediaType)) {
      throw new BadRequestError("Unsupported media type!");
    }
    const fileData = await uploadedFile.arrayBuffer();
    const video = getVideo(cfg.db, videoId);
    const randomFileName = randomBytes(32).toString("base64");
    if (video) {
      if (video.userID != userID) {
        throw new UserForbiddenError("User is not owner of the video!");
      }
      const fileString = Buffer.from(fileData);
      let newUrl = "";
      const extention = mediaType.split("/")[1];
      try {
        const pathTemplate = `/${randomFileName}.${extention}`;
        newUrl = path.join(cfg.assetsRoot, pathTemplate);
        Bun.write(newUrl, fileString);
      } catch (e) {
        console.log("error", e);
      }
      const newThumbnailURL = `http://localhost:${cfg.port}/assets/${randomFileName}.${extention}`;
      const updatedVideo = { ...video, thumbnailURL: newThumbnailURL };
      updateVideo(cfg.db, updatedVideo);
      return respondWithJSON(200, { video: updatedVideo });
    }
  }
  return respondWithJSON(400, null);
}
