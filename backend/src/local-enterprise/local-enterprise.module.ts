import { Module } from "@nestjs/common";
import { AdminAuthModule } from "../admin-auth/admin-auth.module.js";
import { SessionModule } from "../session/session.module.js";
import { DatabaseModule } from "../database/database.module.js";
import { AdminOperationLogModule } from "../admin-operation-log/admin-operation-log.module.js";
import { LocalEnterpriseAdminController, LocalEnterpriseController } from "./local-enterprise.controller.js";
import { LocalEnterpriseRepository } from "./local-enterprise.repository.js";
import { LocalEnterpriseService } from "./local-enterprise.service.js";
import { WechatJoinQrService } from "./wechat-join-qr.service.js";
import { ConfigModule } from "../config/config.module.js";

@Module({ imports:[AdminAuthModule,AdminOperationLogModule,SessionModule,DatabaseModule,ConfigModule], controllers:[LocalEnterpriseController,LocalEnterpriseAdminController], providers:[LocalEnterpriseRepository,LocalEnterpriseService,WechatJoinQrService] })
export class LocalEnterpriseModule {}
