import { Module } from "@nestjs/common";
import { DemoAssetsController } from "./demo-assets.controller.js";

@Module({
  controllers: [DemoAssetsController]
})
export class DemoAssetsModule {}
