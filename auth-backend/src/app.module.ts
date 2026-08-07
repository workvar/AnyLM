import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { PrismaModule } from "./prisma/prisma.module";
import { AuthModule } from "./auth/auth.module";
import { UsersModule } from "./users/users.module";
import { GovernanceModule } from "./governance/governance.module";
import { ConnectorsModule } from "./connectors/connectors.module";

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    UsersModule,
    AuthModule,
    GovernanceModule,
    ConnectorsModule,
  ],
})
export class AppModule {}
