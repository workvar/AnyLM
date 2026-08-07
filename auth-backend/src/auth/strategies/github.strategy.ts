import { Injectable } from "@nestjs/common";
import { PassportStrategy } from "@nestjs/passport";
import { ConfigService } from "@nestjs/config";
import { Strategy, Profile } from "passport-github2";
import { OAuthProfile } from "../auth.service";

@Injectable()
export class GithubStrategy extends PassportStrategy(Strategy, "github") {
  constructor(config: ConfigService) {
    super({
      clientID: config.get("GITHUB_CLIENT_ID", ""),
      clientSecret: config.get("GITHUB_CLIENT_SECRET", ""),
      // NOTE: GitHub requires an EXACT registered callback (port included) and
      // does not allow floating loopback ports. If you rely on GitHub login,
      // keep the backend on a fixed PORT (don't let it fall back).
      callbackURL: config.get(
        "GITHUB_CALLBACK_URL",
        `http://127.0.0.1:${process.env.PORT}/auth/github/callback`
      ),
      scope: ["user:email"],
    });
  }

  async validate(
    _accessToken: string,
    _refreshToken: string,
    profile: Profile,
    done: (err: Error | null, user?: OAuthProfile) => void
  ) {
    const email = profile.emails?.[0]?.value;
    if (!email) return done(new Error("GitHub account has no public email"));
    const mapped: OAuthProfile = {
      email,
      name: profile.displayName || profile.username,
      avatarUrl: profile.photos?.[0]?.value ?? null,
      provider: "github",
      providerId: profile.id,
    };
    done(null, mapped);
  }
}
