import { getBearerToken, validateJWT } from "../auth";
import { respondWithJSON } from "./json";
import { getVideo, updateVideo } from "../db/videos";
import type { ApiConfig } from "../config";
import type { BunRequest } from "bun";
import { BadRequestError, NotFoundError, UserForbiddenError } from "./errors";
import { File } from "buffer";


const MAX_UPLOAD_SIZE = 10 << 20;

type Thumbnail = {
  data: ArrayBuffer;
  mediaType: string;
};

const videoThumbnails: Map<string, Thumbnail> = new Map();

export async function handlerGetThumbnail(cfg: ApiConfig, req: BunRequest) {
  const { videoId } = req.params as { videoId?: string };
  if (!videoId) {
    throw new BadRequestError("Invalid video ID");
  }

  const video = getVideo(cfg.db, videoId);
  if (!video) {
    throw new NotFoundError("Couldn't find video");
  }

  const thumbnail = videoThumbnails.get(videoId);
  if (!thumbnail) {
    throw new NotFoundError("Thumbnail not found");
  }

  return new Response(thumbnail.data, {
    headers: {
      "Content-Type": thumbnail.mediaType,
      "Cache-Control": "no-store",
    },
  });
}

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
    if (uploadedFile.size > MAX_UPLOAD_SIZE) {
      throw new BadRequestError("Image is bigger than 10mb!");
    }
    const mediaType = uploadedFile.type;
    const fileData = await uploadedFile.arrayBuffer();
    const video = getVideo(cfg.db, videoId);
    if (video) {
      if (video.userID != userID) {
        throw new UserForbiddenError("User is not owner of the video!");
      }
      videoThumbnails.set(video.id, { mediaType, data: fileData });
      const updatedVideo = { ...video, thumbnailURL: `http://localhost:8091/api/thumbnails/${video.id}` };
      updateVideo(cfg.db, updatedVideo);
      return respondWithJSON(200, { vidoe: updatedVideo });
    }
  }
}
