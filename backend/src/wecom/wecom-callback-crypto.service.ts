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

export interface WecomDecryptOptions {
  token?: string;
  aesKey?: string;
  expectedReceiveId?: string | null;
}

const REPLAY_WINDOW_SECONDS = 5 * 60;

@Injectable()
export class WecomCallbackCryptoService {
  constructor(private readonly config: WecomConfigService) {}

  /**
   * 校验并解密企业微信回调消息。
   *
   * 入口参数来自 URL/query 和密文体；这里先做时间窗和签名校验，再解密并校验接收方，
   * 供指令回调、数据回调等上层服务复用。
   */
  decrypt(payload: WecomEncryptedPayload, options: WecomDecryptOptions = {}): WecomDecryptedMessage {
    // 先校验时间窗再进入 AES 路径，避免重放密文消耗解密逻辑。
    this.guardTimestamp(payload);

    const suite = this.config.suite;
    const token = options.token ?? suite.callbackToken;
    const encodingAesKey = options.aesKey ?? suite.callbackAesKey;
    const expectedReceiveId = options.expectedReceiveId === undefined ? suite.suiteId : options.expectedReceiveId;
    if (!this.hasValidAesKey(encodingAesKey)) {
      throw new ServiceUnavailableException("WeCom callback AES key is not configured");
    }
    if (!this.verifySignature(payload, token)) {
      throw new UnauthorizedException("invalid WeCom callback signature");
    }
    return this.decryptTrustedCiphertext(payload.encrypt, {
      aesKey: encodingAesKey,
      expectedReceiveId
    });
  }

  /**
   * 解密已经被上游判定可信的企业微信密文。
   *
   * 仅跳过签名/时间窗检查，仍会校验 AES key、消息长度、PKCS#7 padding 和 receiveId；
   * 适用于测试或同一回调流程内已经完成外层校验后的复用。
   */
  decryptTrustedCiphertext(encrypt: string, options: WecomDecryptOptions = {}): WecomDecryptedMessage {
    const suite = this.config.suite;
    const encodingAesKey = options.aesKey ?? suite.callbackAesKey;
    const expectedReceiveId = options.expectedReceiveId === undefined ? suite.suiteId : options.expectedReceiveId;
    if (!this.hasValidAesKey(encodingAesKey)) {
      throw new ServiceUnavailableException("WeCom callback AES key is not configured");
    }

    const aesKey = this.decodeAesKey(encodingAesKey);
    const decrypted = this.decryptCipherText(encrypt, aesKey);
    const unpadded = this.removePkcs7Padding(decrypted);
    if (unpadded.length < 20) {
      throw new BadRequestException("invalid WeCom callback payload");
    }

    const messageLength = unpadded.readUInt32BE(16);
    const messageStart = 20;
    const messageEnd = messageStart + messageLength;
    // 企业微信明文格式为 random(16) + msg_len(4) + xml/json + receive_id；
    // 先校验声明长度再切片，避免畸形密文把消息内容和接收方边界混在一起。
    if (messageLength <= 0 || messageEnd > unpadded.length) {
      throw new BadRequestException("invalid WeCom callback message length");
    }

    const message = unpadded.subarray(messageStart, messageEnd).toString("utf8");
    const receiveId = unpadded.subarray(messageEnd).toString("utf8");
    if (expectedReceiveId !== null && receiveId !== expectedReceiveId) {
      throw new UnauthorizedException("invalid WeCom callback receiver");
    }
    return { message, receiveId };
  }

  signatureOf(payload: Omit<WecomEncryptedPayload, "msgSignature">, token = this.config.suite.callbackToken): string {
    return createHash("sha1")
      .update([token, payload.timestamp, payload.nonce, payload.encrypt].sort().join(""))
      .digest("hex");
  }

  private guardTimestamp(payload: WecomEncryptedPayload): void {
    const now = Math.floor(Date.now() / 1000);
    const timestamp = Number(payload.timestamp);
    if (!Number.isFinite(timestamp) || Math.abs(now - timestamp) > REPLAY_WINDOW_SECONDS) {
      throw new UnauthorizedException("WeCom callback timestamp is outside the allowed window");
    }
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
    // 企业微信配置的是 43 位 base64 字符串，补一个 "=" 后才能按标准 base64 解出 32 字节 key。
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
    const paddingBytes = decrypted.subarray(decrypted.length - padding);
    if (!paddingBytes.every((byte) => byte === padding)) {
      throw new BadRequestException("invalid WeCom callback padding");
    }
    return decrypted.subarray(0, decrypted.length - padding);
  }

  private hasValidAesKey(encodingAesKey: string): boolean {
    return encodingAesKey.length === 43;
  }
}
