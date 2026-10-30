import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { v2 as cloudinary } from "cloudinary";

@Injectable()
export class CloudinaryService {
  constructor(config: ConfigService) {
    cloudinary.config({
      cloud_name: config.get<string>("cloudinary.cloudName"),
      api_key: config.get<string>("cloudinary.apiKey"),
      api_secret: config.get<string>("cloudinary.apiSecret"),
    });
  }

  async uploadImages(imageFiles: Express.Multer.File[]): Promise<string[]> {
    if (!imageFiles?.length) return [];

    return Promise.all(
      imageFiles.map(async (image) => {
        const b64 = Buffer.from(image.buffer as Uint8Array).toString("base64");
        const dataURI = `data:${image.mimetype};base64,${b64}`;
        const result = await cloudinary.uploader.upload(dataURI, {
          secure: true,
          transformation: [{ width: 800, height: 600, crop: "fill" }, { quality: "auto" }],
        });
        return result.url;
      }),
    );
  }
}
