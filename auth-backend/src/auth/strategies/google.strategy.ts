import { Injectable } from "@nestjs/common";
import { PassportStrategy } from "@nestjs/passport";
import { ConfigService } from "@nestjs/config";
import { Strategy, Profile, VerifyCallback } from "passport-google-oauth20";
import { OAuthProfile } from "../auth.service";

@Injectable()
export class GoogleStrategy extends PassportStrategy(Strategy, "google") {
  constructor(config: ConfigService) {
    super({
      clientID: config.get("GOOGLE_CLIENT_ID", ""),
      clientSecret: config.get("GOOGLE_CLIENT_SECRET", ""),
      // Loopback IP on the resolved port. Google Desktop-app clients accept any
      // loopback port, so this stays valid even after a port fallback. Leave
      // GOOGLE_CALLBACK_URL unset in .env to keep this dynamic.
      callbackURL: config.get(
        "GOOGLE_CALLBACK_URL",
        `http://127.0.0.1:${process.env.PORT}/auth/google/callback`
      ),
      scope: ["email", "profile"],
    });
  }

  // Maps the Google profile into our normalized OAuthProfile.
  async validate(
    _accessToken: string,
    _refreshToken: string,
    profile: Profile,
    done: VerifyCallback
  ) {
    const email = profile.emails?.[0]?.value;
    if (!email) return done(new Error("Google account has no email"), undefined);
    const mapped: OAuthProfile = {
      email,
      name: profile.displayName,
      avatarUrl: profile.photos?.[0]?.value ?? null,
      provider: "google",
      providerId: profile.id,
    };
    done(null, mapped);
  }
}
