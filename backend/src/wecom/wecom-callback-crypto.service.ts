import { createDecipheriv, createHash, timingSafeEqual } from "node:crypto";
import { BadRequestException, Injectable, ServiceUnavailableException, UnauthorizedException } from "@nestjs/common";
import { WecomConfigService } from "./wecom-config.service.js";

export interface WecomEncryptedPayload {
  msgSignature: string;
  timestamp: string;
  nonce: string;
  encrypt: string;
}

export interface WecomDecryptedMessage {
  message: string;
  receiveId: string;
}

@Injectable()
export class WecomCallbackCryptoService {
  constructor(private readonly config: WecomConfigService) {}

  decrypt(payload: WecomEncryptedPayload): WecomDecryptedMessage {
    const suite = this.config.suite;
    if (!this.hasValidAesKey(suite.callbackAesKey)) {
      throw new ServiceUnavailableException("WeCom callback AES key is not configured");
    }
    if (!this.verifySignature(payload, suite.callbackToken)) {
      throw new UnauthorizedException("invalid WeCom callback signature");
    }

    const aesKey = this.decodeAesKey(suite.callbackAesKey);
    const decrypted = this.decryptCipherText(payload.encrypt, aesKey);
    const unpadded = this.removePkcs7Padding(decrypted);
    if (unpadded.length < 20) {
      throw new BadRequestException("invalid WeCom callback payload");
    }

    const messageLength = unpadded.readUInt32BE(16);
    const messageStart = 20;
    const messageEnd = messageStart + messageLength;
    if (messageLength <= 0 || messageEnd > unpadded.length) {
      throw new BadRequestException("invalid WeCom callback message length");
    }

    const message = unpadded.subarray(messageStart, messageEnd).toString("utf8");
    const receiveId = unpadded.subarray(messageEnd).toString("utf8");
    if (receiveId !== suite.suiteId) {
      throw new UnauthorizedException("invalid WeCom callback receiver");
    }
    return { message, receiveId };
  }

  signatureOf(payload: Omit<WecomEncryptedPayload, "msgSignature">, token = this.config.suite.callbackToken): string {
    return createHash("sha1")
      .update([token, payload.timestamp, payload.nonce, payload.encrypt].sort().join(""))
      .digest("hex");
  }

  private verifySignature(payload: WecomEncryptedPayload, token: string): boolean {
    const expected = this.signatureOf(payload, token);
    const actual = payload.msgSignature;
    const left = Buffer.from(actual);
    const right = Buffer.from(expected);
    return left.length === right.length && timingSafeEqual(left, right);
  }

  private decryptCipherText(encrypted: string, aesKey: Buffer): Buffer {
    try {
      const decipher = createDecipheriv("aes-256-cbc", aesKey, aesKey.subarray(0, 16));
      decipher.setAutoPadding(false);
      return Buffer.concat([decipher.update(encrypted, "base64"), decipher.final()]);
    } catch {
      throw new BadRequestException("invalid WeCom callback ciphertext");
    }
  }

  private decodeAesKey(encodingAesKey: string): Buffer {
    const aesKey = Buffer.from(`${encodingAesKey}=`, "base64");
    if (aesKey.length !== 32) {
      throw new ServiceUnavailableException("WeCom callback AES key is invalid");
    }
    return aesKey;
  }

  private removePkcs7Padding(decrypted: Buffer): Buffer {
    const padding = decrypted.at(-1);
    if (!padding || padding < 1 || padding > 32 || padding > decrypted.length) {
      throw new BadRequestException("invalid WeCom callback padding");
    }
    return decrypted.subarray(0, decrypted.length - padding);
  }

  private hasValidAesKey(encodingAesKey: string): boolean {
    return encodingAesKey.length === 43;
  }
}
