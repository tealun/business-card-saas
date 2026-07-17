import { Module } from "@nestjs/common";
import { AdminAuthModule } from "../admin-auth/admin-auth.module.js";
import { CompanyVideoFeatureController, PlatformVideoFeatureController } from "./company-video-feature.controller.js";
import { CompanyVideoFeatureRepository } from "./company-video-feature.repository.js";
import { CompanyVideoFeatureService } from "./company-video-feature.service.js";
import { AdminOperationLogModule } from "../admin-operation-log/admin-operation-log.module.js";
@Module({imports:[AdminAuthModule,AdminOperationLogModule],controllers:[CompanyVideoFeatureController,PlatformVideoFeatureController],providers:[CompanyVideoFeatureRepository,CompanyVideoFeatureService],exports:[CompanyVideoFeatureRepository,CompanyVideoFeatureService]})
export class CompanyVideoFeatureModule {}
