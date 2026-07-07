import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { Injectable } from "@nestjs/common";

@Injectable()
export class CardFieldCipherService {
  encrypt(plaintext: string): string {
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", this.key(), iv);
    const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
    const tag = cipher.getAuthTag();
    return ["v1", iv.toString("base64url"), tag.toString("base64url"), ciphertext.toString("base64url")].join(".");
  }

  decrypt(value: string): string {
    const [version, iv, tag, ciphertext] = value.split(".");
    if (version !== "v1" || !iv || !tag || !ciphertext) {
      throw new Error("invalid encrypted card field value");
    }

    const decipher = createDecipheriv("aes-256-gcm", this.key(), Buffer.from(iv, "base64url"));
    decipher.setAuthTag(Buffer.from(tag, "base64url"));
    return Buffer.concat([
      decipher.update(Buffer.from(ciphertext, "base64url")),
      decipher.final()
    ]).toString("utf8");
  }

  private key(): Buffer {
    const value = process.env.CARD_FIELD_ENCRYPTION_KEY_BASE64?.trim();
    if (!value) {
      throw new Error("CARD_FIELD_ENCRYPTION_KEY_BASE64 must be set");
    }

    const key = Buffer.from(value, "base64");
    if (key.length !== 32) {
      throw new Error("CARD_FIELD_ENCRYPTION_KEY_BASE64 must decode to 32 bytes");
    }
    return key;
  }
}
