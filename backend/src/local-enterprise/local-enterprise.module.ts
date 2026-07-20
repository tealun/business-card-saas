import { Module } from "@nestjs/common";
import { AdminAuthModule } from "../admin-auth/admin-auth.module.js";
import { SessionModule } from "../session/session.module.js";
import { DatabaseModule } from "../database/database.module.js";
import { LocalEnterpriseAdminController, LocalEnterpriseController } from "./local-enterprise.controller.js";
import { LocalEnterpriseRepository } from "./local-enterprise.repository.js";
import { LocalEnterpriseService } from "./local-enterprise.service.js";

@Module({ imports:[AdminAuthModule,SessionModule,DatabaseModule], controllers:[LocalEnterpriseController,LocalEnterpriseAdminController], providers:[LocalEnterpriseRepository,LocalEnterpriseService] })
export class LocalEnterpriseModule {}
