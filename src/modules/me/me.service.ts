import { Injectable, Logger } from "@nestjs/common";
import { AuthService } from "../auth/auth.service";
import { UpdateMeDto } from "./dto/update-me.dto";
import { LocaleException } from "src/plugins/locale/nest/locale.exception";
import { RemoveMeDto } from "./dto/remove-me.dto";
import { Actor } from "../actor/types/actor.type";
import { AppAbilityFactory } from "src/app-ability/app-ability.factory";
import { PrismaService } from "src/prisma/prisma.service";
import { UserService } from "../user/user.service";

@Injectable()
export class MeService {
  readonly logger = new Logger(MeService.name);

  constructor(
    readonly prismaService: PrismaService,
    readonly authService: AuthService,
    readonly userService: UserService,
    readonly appAbilityFactory: AppAbilityFactory,
  ) {}

  async find(actor: Actor) {
    const { accessContext, session, ...user } = actor;
    const ability = this.appAbilityFactory.createAccessCaslAbility(user);
    return {
      ...user,
      abilityRules: ability.rules,
    };
  }

  async update(updateMeDto: UpdateMeDto, actor: Actor) {
    const { oldPassword, newPassword, ...profile } = updateMeDto;

    // handle password update
    if (newPassword !== undefined) {
      if (oldPassword === undefined) {
        throw LocaleException.badRequest({ message: "module.me.oldPasswordRequired" });
      }

      // verify old password
      try {
        await this.authService.verifyPassword({ userId: actor.id, password: oldPassword });
      } catch (error) {
        // catch unauthorized error and rethrow as bad request so we don't log the user out
        if (error instanceof LocaleException && error.status === 401) {
          throw LocaleException.badRequest({ message: "module.me.incorrectOldPasswordError", cause: error });
        } else {
          throw error;
        }
      }

      // ensure new password is different from old password
      if (newPassword === oldPassword) {
        throw LocaleException.badRequest({ message: "module.me.newPasswordSameAsOldPasswordError" });
      }

      // update password
      await this.authService.updatePassword({
        userId: actor.id,
        password: newPassword,
        keepUserSessionId: actor.session.id,
      });
    }

    // update user preferences and profile
    return await this.userService.update(actor.id, profile, actor);
  }

  async remove({ password }: RemoveMeDto, actor: Actor) {
    // verify password
    try {
      await this.authService.verifyPassword({ userId: actor.id, password });
    } catch (error) {
      // catch unauthorized error and rethrow as bad request so we don't log the user out
      if (error instanceof LocaleException && error.status === 401) {
        throw LocaleException.badRequest({ message: "module.me.incorrectPasswordError", cause: error });
      } else {
        throw error;
      }
    }

    // remove user
    return this.userService.remove(actor.id);
  }
}
