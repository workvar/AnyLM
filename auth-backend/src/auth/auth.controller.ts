import {
  Body,
  Controller,
  Get,
  Post,
  Req,
  Res,
  UseGuards,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Request, Response } from "express";
import { AuthService, OAuthProfile } from "./auth.service";
import { RegisterDto, LoginDto } from "./dto/auth.dto";
import {
  JwtAuthGuard,
  JwtRefreshGuard,
  GoogleAuthGuard,
  GithubAuthGuard,
} from "./guards/guards";

@Controller("auth")
export class AuthController {
  constructor(private auth: AuthService, private config: ConfigService) {}

  @Post("register")
  register(@Body() dto: RegisterDto) {
    return this.auth.register(dto);
  }

  @Post("login")
  login(@Body() dto: LoginDto) {
    return this.auth.login(dto);
  }

  @UseGuards(JwtRefreshGuard)
  @Post("refresh")
  refresh(@Req() req: Request) {
    const u = req.user as { userId: string; refreshToken: string };
    return this.auth.refresh(u.userId, u.refreshToken);
  }

  @UseGuards(JwtAuthGuard)
  @Post("logout")
  logout(@Req() req: Request) {
    const u = req.user as { userId: string };
    return this.auth.logout(u.userId);
  }

  @UseGuards(JwtAuthGuard)
  @Get("me")
  me(@Req() req: Request) {
    const u = req.user as { userId: string };
    return this.auth.me(u.userId);
  }

  // --- Google ---
  @UseGuards(GoogleAuthGuard)
  @Get("google")
  google() {
    // Guard redirects to Google; nothing to do here.
  }

  @UseGuards(GoogleAuthGuard)
  @Get("google/callback")
  async googleCallback(@Req() req: Request, @Res() res: Response) {
    await this.completeOAuth(req, res);
  }

  // --- GitHub ---
  @UseGuards(GithubAuthGuard)
  @Get("github")
  github() {
    // Guard redirects to GitHub.
  }

  @UseGuards(GithubAuthGuard)
  @Get("github/callback")
  async githubCallback(@Req() req: Request, @Res() res: Response) {
    await this.completeOAuth(req, res);
  }

  // Tiny page the OAuth flow lands on. The desktop app intercepts the
  // redirect query before this loads; browsers just see a confirmation.
  @Get("success")
  success(@Res() res: Response) {
    res.type("html").send(
      "<html><body style='font-family:sans-serif;text-align:center;padding-top:80px'>" +
        "<h2>Signed in</h2><p>You can close this window and return to AnyLM.</p>" +
        "</body></html>"
    );
  }

  // Shared: turn the OAuth profile into tokens and redirect to the app.
  private async completeOAuth(req: Request, res: Response) {
    const profile = req.user as OAuthProfile;
    const result = await this.auth.loginWithOAuth(profile);
    // Hand tokens back to the desktop app via its custom URI scheme. This has
    // no port, so it works no matter what port the backend ended up on.
    const base = this.config.get("OAUTH_SUCCESS_REDIRECT", "anylm://auth/callback");
    const url = new URL(base);
    url.searchParams.set("accessToken", result.accessToken);
    url.searchParams.set("refreshToken", result.refreshToken);
    res.redirect(url.toString());
  }
}
