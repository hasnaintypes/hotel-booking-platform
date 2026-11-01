import { BadGatewayException, Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { v2 as cloudinary } from "cloudinary";

export type UploadedImage = {
  /** HTTPS delivery URL. */
  url: string;
  /** Needed to delete the asset again. */
  publicId: string;
};

@Injectable()
export class CloudinaryService {
  private readonly logger = new Logger(CloudinaryService.name);
  private readonly folder: string | undefined;
  private readonly tags: string[];

  constructor(config: ConfigService) {
    cloudinary.config({
      cloud_name: config.get<string>("cloudinary.cloudName"),
      api_key: config.get<string>("cloudinary.apiKey"),
      api_secret: config.get<string>("cloudinary.apiSecret"),
      secure: true,
    });
    this.folder = config.get<string>("cloudinary.folder");
    this.tags = config.get<string[]>("cloudinary.tags") ?? [];
  }

  /**
   * Uploads every image or none: if one upload fails, the ones that already succeeded are deleted
   * and the request fails, so a half-finished upload leaves nothing behind.
   */
  async uploadImages(imageFiles: Express.Multer.File[]): Promise<UploadedImage[]> {
    if (!imageFiles?.length) return [];

    const results = await Promise.allSettled(imageFiles.map((image) => this.uploadOne(image)));
    const uploaded = results.flatMap((r) => (r.status === "fulfilled" ? [r.value] : []));

    if (uploaded.length !== results.length) {
      await this.deleteImages(uploaded.map((image) => image.publicId));
      throw new BadGatewayException("Image upload failed");
    }

    return uploaded;
  }

  /** Best effort: a failure is logged with the asset id so an orphan can be removed by hand. */
  async deleteImages(publicIds: string[]): Promise<void> {
    if (publicIds.length === 0) return;

    const results = await Promise.allSettled(
      publicIds.map((publicId) => cloudinary.uploader.destroy(publicId)),
    );
    results.forEach((result, index) => {
      if (result.status === "rejected") {
        this.logger.warn(`Could not delete uploaded image ${publicIds[index]}; it is now orphaned`);
      }
    });
  }

  private async uploadOne(image: Express.Multer.File): Promise<UploadedImage> {
    const b64 = Buffer.from(image.buffer as Uint8Array).toString("base64");
    const dataURI = `data:${image.mimetype};base64,${b64}`;
    const result = await cloudinary.uploader.upload(dataURI, {
      folder: this.folder,
      tags: this.tags,
      resource_type: "image",
      transformation: [{ width: 800, height: 600, crop: "fill" }, { quality: "auto" }],
    });
    return { url: result.secure_url, publicId: result.public_id };
  }
}
