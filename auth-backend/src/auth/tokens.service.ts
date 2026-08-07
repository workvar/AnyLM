import { Injectable } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { ConfigService } from "@nestjs/config";
import { createHash, randomUUID } from "crypto";
import * as bcrypt from "bcryptjs";

export interface JwtPayload {
  sub: string;
  email: string;
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

@Injectable()
export class TokensService {
  constructor(private jwt: JwtService, private config: ConfigService) {}

  async signTokens(payload: JwtPayload): Promise<TokenPair> {
    const [accessToken, refreshToken] = await Promise.all([
      this.jwt.signAsync(payload, {
        secret: this.config.get("JWT_ACCESS_SECRET", "dev-access-secret"),
        expiresIn: this.config.get("JWT_ACCESS_TTL", "15m"),
      }),
      // jti makes each refresh token unique, so rotation always produces a new
      // token (even within the same second) and reusing an old one fails.
      this.jwt.signAsync(
        { ...payload, jti: randomUUID() },
        {
          secret: this.config.get("JWT_REFRESH_SECRET", "dev-refresh-secret"),
          expiresIn: this.config.get("JWT_REFRESH_TTL", "7d"),
        }
      ),
    ]);
    return { accessToken, refreshToken };
  }

  // bcrypt only considers the first 72 bytes, and JWTs share an identical
  // prefix, so we SHA-256 the token first (64 hex chars, fully representative).
  private digest(token: string): string {
    return createHash("sha256").update(token).digest("hex");
  }

  hashToken(token: string): Promise<string> {
    return bcrypt.hash(this.digest(token), 10);
  }

  compareToken(token: string, hash: string): Promise<boolean> {
    return bcrypt.compare(this.digest(token), hash);
  }
}
