import {
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
} from "@nestjs/common";
import { Request, Response } from "express";
import { JwtAuthGuard } from "../auth/guards/guards";
import { ConnectorsService } from "./connectors.service";

function userId(req: Request) {
  return (req.user as { userId: string }).userId;
}

@Controller("connectors")
export class ConnectorsController {
  constructor(private connectors: ConnectorsService) {}

  // Provider list with configured/connected flags for the Skills UI.
  @UseGuards(JwtAuthGuard)
  @Get()
  status(@Req() req: Request) {
    return this.connectors.status(userId(req));
  }

  // Start the consent flow: returns the URL the app opens in the browser.
  @UseGuards(JwtAuthGuard)
  @Post(":provider/start")
  start(@Req() req: Request, @Param("provider") provider: string) {
    return this.connectors.start(userId(req), provider);
  }

  // OAuth redirect target. Confirms in the browser and deep-links back to
  // the app so the Skills view can refresh its connection status.
  @Get(":provider/callback")
  async callback(
    @Param("provider") provider: string,
    @Query("code") code: string,
    @Query("state") state: string,
    @Query("error") error: string,
    @Res() res: Response
  ) {
    if (error || !code) {
      res
        .type("html")
        .send(page("Connection failed", error || "No authorization code returned."));
      return;
    }
    try {
      await this.connectors.handleCallback(provider, code, state);
      const deepLink = `anylm://connectors/callback?provider=${encodeURIComponent(provider)}`;
      res
        .type("html")
        .send(page("Connected", "You can close this window and return to AnyLM.", deepLink));
    } catch (e: any) {
      res.type("html").send(page("Connection failed", e.message || "Unknown error"));
    }
  }

  // A live access token for skill tool execution (refreshes when stale).
  @UseGuards(JwtAuthGuard)
  @Get(":provider/token")
  token(@Req() req: Request, @Param("provider") provider: string) {
    return this.connectors.freshToken(userId(req), provider);
  }

  @UseGuards(JwtAuthGuard)
  @Delete(":provider")
  disconnect(@Req() req: Request, @Param("provider") provider: string) {
    return this.connectors.disconnect(userId(req), provider);
  }
}

function page(title: string, body: string, deepLink?: string) {
  const redirect = deepLink
    ? `<script>location.href=${JSON.stringify(deepLink)}</script>`
    : "";
  return (
    `<html><body style='font-family:sans-serif;text-align:center;padding-top:80px'>` +
    `<h2>${title}</h2><p>${body}</p>${redirect}</body></html>`
  );
}
