import { Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";
import { ConfigService } from "@nestjs/config";
import { PassportModule } from "@nestjs/passport";
import { UsersModule } from "../users/users.module";
import { AuthService } from "./auth.service";
import { AuthController } from "./auth.controller";
import { TokensService } from "./tokens.service";
import { JwtStrategy } from "./strategies/jwt.strategy";
import { JwtRefreshStrategy } from "./strategies/jwt-refresh.strategy";
import { GoogleStrategy } from "./strategies/google.strategy";
import { GithubStrategy } from "./strategies/github.strategy";

// OAuth strategies self-register with Passport in their constructor, and the
// underlying libs throw if a clientID is missing. So we only instantiate them
// when the corresponding credentials are configured. Email/password and JWT
// auth work with no OAuth setup at all.
const oauthProviders = [
  {
    provide: GoogleStrategy,
    useFactory: (config: ConfigService) =>
      config.get("GOOGLE_CLIENT_ID") ? new GoogleStrategy(config) : null,
    inject: [ConfigService],
  },
  {
    provide: GithubStrategy,
    useFactory: (config: ConfigService) =>
      config.get("GITHUB_CLIENT_ID") ? new GithubStrategy(config) : null,
    inject: [ConfigService],
  },
];

@Module({
  imports: [UsersModule, PassportModule, JwtModule.register({})],
  controllers: [AuthController],
  providers: [
    AuthService,
    TokensService,
    JwtStrategy,
    JwtRefreshStrategy,
    ...oauthProviders,
  ],
})
export class AuthModule {}
