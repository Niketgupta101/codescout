import { Injectable, Logger } from "@nestjs/common";
import { CreateUserDto } from "./dto/create-user.dto";
import { UpdateUserDto } from "./dto/update-user.dto";
import { Prisma } from "@prisma/client";
import { LocaleException } from "src/plugins/locale/nest/locale.exception";
import { FindAllUsersDto } from "./dto/find-all-users.dto";
import { randomUUID } from "crypto";
import { pickModifiedKeys } from "src/utils/object.util";
import { formatName } from "src/utils/name.util";
import { Actor } from "../actor/types/actor.type";
import { PrismaService } from "src/prisma/prisma.service";

@Injectable()
export class UserService {
  readonly logger = new Logger(UserService.name);

  constructor(readonly prismaService: PrismaService) {}

  _getInclude() {
    return {
      password: true,
    } satisfies Prisma.UserInclude;
  }

  async create(createUserDto: CreateUserDto, _actor: Actor) {
    const { email, ...rest } = createUserDto;

    // check if user with email already exists
    const existingUser = await this.prismaService.user.findUnique({
      where: {
        email: email.toLowerCase(),
      },
    });
    if (existingUser) {
      throw LocaleException.conflict({ message: "module.user.userWithEmailAlreadyExistsError" });
    }

    const user = await this.prismaService.user.create({
      data: {
        ...rest,
        enabled: true,
        id: randomUUID(),
        name: formatName(rest),
        email: email.toLowerCase(),
      },
      include: this._getInclude(),
    });

    return user;
  }

  async findAll({ enabled, contains, orderBy, orderDirection, take, skip }: FindAllUsersDto, actor: Actor) {
    const args: Pick<Prisma.UserFindManyArgs, "where" | "orderBy"> = {
      where: {
        ...(enabled !== undefined && { enabled }),
        ...(contains && {
          OR: [{ name: { contains, mode: "insensitive" } }, { email: { contains, mode: "insensitive" } }],
        }),
        AND: [actor.accessContext.getWhereInputFor("read", "User")],
      },
      orderBy: {
        [orderBy ?? "createdAt"]: orderDirection ?? "desc",
      },
    };

    const total = await this.prismaService.user.count(args);
    const items = await this.prismaService.user.findMany({
      ...args,
      ...(take !== undefined && { take }),
      ...(skip !== undefined && { skip }),
      include: this._getInclude(),
    });

    return { total, items };
  }

  async findOne(userId: string) {
    const user = await this.prismaService.user.findUnique({
      where: {
        id: userId,
      },
      include: this._getInclude(),
    });
    if (!user) {
      throw LocaleException.notFound();
    }
    return user;
  }

  async update(userId: string, updateUserDto: UpdateUserDto, _actor: Actor) {
    const userCurrent = await this.findOne(userId);

    const userUpdated = await this.prismaService.$transaction(async (tx) => {
      // delete user sessions if user disabled
      if (updateUserDto.enabled === false && userCurrent.enabled !== updateUserDto.enabled) {
        const userSessions = await tx.userSession.findMany({
          where: { userId },
        });

        if (userSessions.length) {
          await tx.userSession.deleteMany({
            where: { id: { in: userSessions.map((it) => it.id) } },
          });
        }
      }

      // update name if first name or last name changed
      let name;
      if (updateUserDto.firstName !== undefined || updateUserDto.lastName !== undefined) {
        name = formatName({
          firstName: updateUserDto.firstName ?? userCurrent.firstName,
          lastName: updateUserDto.lastName ?? userCurrent.lastName,
        });
      }

      const data = pickModifiedKeys({ ...updateUserDto, name }, userCurrent);

      if (data) {
        const userUpdated = await tx.user.update({
          where: { id: userId },
          data,
          include: this._getInclude(),
        });

        return userUpdated;
      } else {
        return userCurrent;
      }
    });

    return userUpdated;
  }

  async remove(userId: string) {
    const userCurrent = await this.prismaService.user.findUniqueOrThrow({
      where: {
        id: userId,
      },
      include: {
        password: true,
        sessions: true,
      },
    });

    return this.prismaService.$transaction(async (tx) => {
      // delete user credential
      if (userCurrent.password) {
        await tx.userPassword.delete({
          where: { id: userCurrent.password.id },
        });
      }

      // delete user sessions
      if (userCurrent.sessions) {
        await tx.userSession.deleteMany({
          where: { id: { in: userCurrent.sessions.map((it) => it.id) } },
        });
      }

      // delete user
      const userDeleted = await tx.user.update({
        where: { id: userId },
        data: {
          name: "",
          firstName: "",
          lastName: "",
          email: `${userId}@deleted.local`,
          enabled: false,
          deleted: true,
          deletedAt: new Date(),
        },
        include: this._getInclude(),
      });

      return userDeleted;
    });
  }
}
