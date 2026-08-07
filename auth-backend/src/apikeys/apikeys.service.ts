import { Injectable, NotFoundException, UnauthorizedException } from "@nestjs/common";
import { createHash, randomBytes } from "crypto";
import { PrismaService } from "../prisma/prisma.service";

function hash(key: string): string {
  return createHash("sha256").update(key).digest("hex");
}

@Injectable()
export class ApiKeysService {
  constructor(private prisma: PrismaService) {}

  // Create a key; the full secret is returned exactly once.
  async create(userId: string, name: string) {
    const secret = `anylm_${randomBytes(24).toString("hex")}`;
    const record = await this.prisma.apiKey.create({
      data: {
        userId,
        name: name || "Unnamed key",
        prefix: secret.slice(0, 12),
        keyHash: hash(secret),
      },
    });
    return { id: record.id, name: record.name, prefix: record.prefix, key: secret };
  }

  list(userId: string) {
    return this.prisma.apiKey.findMany({
      where: { userId },
      select: {
        id: true,
        name: true,
        prefix: true,
        revoked: true,
        createdAt: true,
        lastUsedAt: true,
      },
      orderBy: { createdAt: "desc" },
    });
  }

  async revoke(userId: string, keyId: string) {
    const key = await this.prisma.apiKey.findUnique({ where: { id: keyId } });
    if (!key || key.userId !== userId) throw new NotFoundException("Key not found");
    await this.prisma.apiKey.update({ where: { id: keyId }, data: { revoked: true } });
    return { success: true };
  }

  // Resolve a bearer key to its owning user (for the /v1 proxy).
  async authenticate(bearer: string | undefined): Promise<string> {
    const key = (bearer || "").replace(/^Bearer\s+/i, "").trim();
    if (!key.startsWith("anylm_")) throw new UnauthorizedException("Invalid API key");
    const record = await this.prisma.apiKey.findUnique({ where: { keyHash: hash(key) } });
    if (!record || record.revoked) throw new UnauthorizedException("Invalid API key");
    this.prisma.apiKey
      .update({ where: { id: record.id }, data: { lastUsedAt: new Date() } })
      .catch(() => {});
    return record.userId;
  }
}
