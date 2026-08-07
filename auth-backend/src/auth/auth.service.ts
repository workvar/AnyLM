import {
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import * as bcrypt from "bcryptjs";
import { User } from "@prisma/client";
import { UsersService, toPublic } from "../users/users.service";
import { TokensService } from "./tokens.service";
import { PrismaService } from "../prisma/prisma.service";
import { RegisterDto, LoginDto } from "./dto/auth.dto";

export interface OAuthProfile {
  email: string;
  name?: string | null;
  avatarUrl?: string | null;
  provider: "google" | "github";
  providerId: string;
}

@Injectable()
export class AuthService {
  constructor(
    private users: UsersService,
    private tokens: TokensService,
    private prisma: PrismaService
  ) {}

  // Domain-based auto-join: enroll the user into any org whose configured
  // auto-join domains match their email domain.
  private async autoJoin(user: User) {
    const domain = user.email.split("@")[1];
    if (!domain) return;
    const orgs = await this.prisma.organization.findMany({
      where: { autoJoinDomains: { not: "" } },
    });
    for (const org of orgs) {
      const domains = org.autoJoinDomains
        .split(",")
        .map((d) => d.trim().toLowerCase())
        .filter(Boolean);
      if (!domains.includes(domain.toLowerCase())) continue;
      await this.prisma.orgMember.upsert({
        where: { orgId_userId: { orgId: org.id, userId: user.id } },
        create: { orgId: org.id, userId: user.id, role: "member" },
        update: {},
      });
    }
  }

  // SSO enforcement: if any of the user's orgs (or an auto-join org matching
  // their domain) requires a specific provider, other sign-in methods fail.
  private async enforceSso(email: string, method: "local" | "google" | "github") {
    const domain = (email.split("@")[1] || "").toLowerCase();
    const orgs = await this.prisma.organization.findMany({
      where: { ssoRequired: true },
      include: { members: { include: { user: { select: { email: true } } } } },
    });
    for (const org of orgs) {
      const domains = org.autoJoinDomains
        .split(",")
        .map((d) => d.trim().toLowerCase())
        .filter(Boolean);
      const isMember = org.members.some((m) => m.user.email === email.toLowerCase());
      const domainMatch = domain && domains.includes(domain);
      if (!isMember && !domainMatch) continue;
      if (org.ssoProvider !== "any" && org.ssoProvider !== method) {
        throw new ForbiddenException(
          `Your organization "${org.name}" requires signing in with ${org.ssoProvider === "google" ? "Google" : "GitHub"}.`
        );
      }
    }
  }

  // Issue a fresh token pair and persist the hashed refresh token for rotation.
  private async issueFor(user: User) {
    const pair = await this.tokens.signTokens({ sub: user.id, email: user.email });
    await this.users.setRefreshHash(user.id, await this.tokens.hashToken(pair.refreshToken));
    return { user: toPublic(user), ...pair };
  }

  async register(dto: RegisterDto) {
    const existing = await this.users.findByEmail(dto.email);
    if (existing) throw new UnauthorizedException("Email already registered");
    await this.enforceSso(dto.email.toLowerCase(), "local");
    const passwordHash = await bcrypt.hash(dto.password, 10);
    const user = await this.users.create({
      email: dto.email,
      name: dto.name ?? null,
      passwordHash,
      provider: "local",
    });
    await this.autoJoin(user);
    return this.issueFor(user);
  }

  async login(dto: LoginDto) {
    const user = await this.users.findByEmail(dto.email);
    if (!user || !user.passwordHash) {
      throw new UnauthorizedException("Invalid email or password");
    }
    const ok = await bcrypt.compare(dto.password, user.passwordHash);
    if (!ok) throw new UnauthorizedException("Invalid email or password");
    await this.enforceSso(user.email, "local");
    await this.autoJoin(user);
    return this.issueFor(user);
  }

  // Find-or-create on OAuth callback, linking by email if the account exists.
  async loginWithOAuth(profile: OAuthProfile) {
    await this.enforceSso(profile.email.toLowerCase(), profile.provider);
    let user = await this.users.findByEmail(profile.email);
    if (!user) {
      user = await this.users.create({
        email: profile.email,
        name: profile.name ?? null,
        avatarUrl: profile.avatarUrl ?? null,
        provider: profile.provider,
        providerId: profile.providerId,
      });
    } else {
      user = await this.users.update(user.id, {
        provider: profile.provider,
        providerId: profile.providerId,
        avatarUrl: user.avatarUrl ?? profile.avatarUrl ?? null,
        name: user.name ?? profile.name ?? null,
      });
    }
    await this.autoJoin(user);
    return this.issueFor(user);
  }

  async refresh(userId: string, refreshToken: string) {
    const user = await this.users.findById(userId);
    if (!user || !user.hashedRefreshToken) throw new ForbiddenException("Access denied");
    const ok = await this.tokens.compareToken(refreshToken, user.hashedRefreshToken);
    if (!ok) throw new ForbiddenException("Access denied");
    return this.issueFor(user); // rotation: new pair + new stored hash
  }

  async logout(userId: string) {
    await this.users.setRefreshHash(userId, null);
    return { success: true };
  }

  async me(userId: string) {
    const user = await this.users.findById(userId);
    if (!user) throw new UnauthorizedException();
    return toPublic(user);
  }
}
