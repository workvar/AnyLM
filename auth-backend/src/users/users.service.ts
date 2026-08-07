import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { User } from "@prisma/client";

// Profile shape returned to clients (never includes secrets).
export type PublicUser = Pick<
  User,
  "id" | "email" | "name" | "avatarUrl" | "provider" | "createdAt"
>;

export function toPublic(u: User): PublicUser {
  return {
    id: u.id,
    email: u.email,
    name: u.name,
    avatarUrl: u.avatarUrl,
    provider: u.provider,
    createdAt: u.createdAt,
  };
}

@Injectable()
export class UsersService {
  constructor(private prisma: PrismaService) {}

  findById(id: string) {
    return this.prisma.user.findUnique({ where: { id } });
  }

  findByEmail(email: string) {
    return this.prisma.user.findUnique({ where: { email: email.toLowerCase() } });
  }

  create(data: {
    email: string;
    name?: string | null;
    avatarUrl?: string | null;
    passwordHash?: string | null;
    provider?: string;
    providerId?: string | null;
  }) {
    return this.prisma.user.create({
      data: { ...data, email: data.email.toLowerCase() },
    });
  }

  update(id: string, data: Partial<User>) {
    return this.prisma.user.update({ where: { id }, data });
  }

  setRefreshHash(id: string, hashedRefreshToken: string | null) {
    return this.prisma.user.update({ where: { id }, data: { hashedRefreshToken } });
  }
}
