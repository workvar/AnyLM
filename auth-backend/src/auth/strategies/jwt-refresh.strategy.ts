import { Injectable } from "@nestjs/common";
import { PassportStrategy } from "@nestjs/passport";
import { ConfigService } from "@nestjs/config";
import { ExtractJwt, Strategy } from "passport-jwt";
import { Request } from "express";
import { JwtPayload } from "../tokens.service";

// Validates the refresh token (sent as Bearer) and exposes the raw token
// so the service can compare it against the stored hash and rotate.
@Injectable()
export class JwtRefreshStrategy extends PassportStrategy(Strategy, "jwt-refresh") {
  constructor(config: ConfigService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.get("JWT_REFRESH_SECRET", "dev-refresh-secret"),
      passReqToCallback: true,
    });
  }

  async validate(req: Request, payload: JwtPayload) {
    const refreshToken = (req.headers.authorization || "").replace("Bearer ", "").trim();
    return { userId: payload.sub, email: payload.email, refreshToken };
  }
}
