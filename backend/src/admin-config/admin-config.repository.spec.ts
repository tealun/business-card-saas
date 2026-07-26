import { AdminConfigRepository } from "./admin-config.repository.js";

describe("AdminConfigRepository", () => {
  it("materializes portrait photo data URLs in template layout before storing", async () => {
    const storage = {
      storeImageDataUrl: jest
        .fn()
        .mockResolvedValueOnce({
          publicUrl: "/api/v1/storage/tenant/demo/portrait-photos/one.png",
          storageKey: "tenant/demo/portrait-photos/one.png"
        })
        .mockResolvedValueOnce({
          publicUrl: "/api/v1/storage/tenant/demo/portrait-photos/two.png",
          storageKey: "tenant/demo/portrait-photos/two.png"
        })
    };
    const repository = new AdminConfigRepository(undefined, storage as never);

    const created = await repository.createTemplate("tenant-demo", {
      name: "照片版模板",
      layout: {
        variant: "portrait-photo",
        portrait_photo_url: "data:image/png;base64,aGVsbG8="
      }
    });
    const updated = await repository.updateTemplate("tenant-demo", created.template_id, {
      layout: {
        variant: "portrait-photo",
        portrait_photo_url: "data:image/png;base64,d29ybGQ="
      }
    });

    expect(created.layout.portrait_photo_url).toBe("/api/v1/storage/tenant/demo/portrait-photos/one.png");
    expect(updated.layout.portrait_photo_url).toBe("/api/v1/storage/tenant/demo/portrait-photos/two.png");
    expect(storage.storeImageDataUrl).toHaveBeenNthCalledWith(1, {
      tenantId: "tenant-demo",
      category: "portrait-photos",
      dataUrl: "data:image/png;base64,aGVsbG8="
    });
    expect(storage.storeImageDataUrl).toHaveBeenNthCalledWith(2, {
      tenantId: "tenant-demo",
      category: "portrait-photos",
      dataUrl: "data:image/png;base64,d29ybGQ="
    });
  });
});
