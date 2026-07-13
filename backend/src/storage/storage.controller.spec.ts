import { StorageController } from "./storage.controller.js";

describe("StorageController", () => {
  it("allows public images to be embedded by Mini Program rendering origins", async () => {
    const stream = { pipe: jest.fn() };
    const storage = {
      readLocalObject: jest.fn(async () => ({
        stream,
        contentType: "image/jpeg",
        contentLength: 2527
      }))
    };
    const headers: Record<string, string> = {};
    const reply: { header: jest.Mock; send: jest.Mock } = {
      header: jest.fn((name: string, value: string): void => {
        headers[name] = value;
      }),
      send: jest.fn((body: unknown) => body)
    };

    const controller = new StorageController(storage as never);
    await controller.readObject("4", "avatars", "avatar.jpg", reply as never);

    expect(headers["cross-origin-resource-policy"]).toBe("cross-origin");
    expect(headers["content-type"]).toBe("image/jpeg");
    expect(reply.send).toHaveBeenCalledWith(stream);
  });
});
