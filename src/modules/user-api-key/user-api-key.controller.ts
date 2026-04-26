import { Body, Controller, Delete, Get, Param, Post } from "@nestjs/common";
import { Actor } from "../actor/types/actor.type";
import { UseActor } from "../actor/decorators/use-actor.decorator";
import { Entity } from "src/decorators/entity.decorator";
import { UserApiKeyCreateDto } from "./dto/user-api-key-create.dto";
import { UserApiKeyEntity } from "./entities/user-api-key.entity";
import { UserApiKeyWithSecretEntity } from "./entities/user-api-key-with-secret.entity";
import { UserApiKeyService } from "./user-api-key.service";

@Controller("user-api-keys")
@Entity({ type: UserApiKeyEntity })
export class UserApiKeyController {
  constructor(readonly userApiKeyService: UserApiKeyService) {}

  @Post()
  @Entity({ type: UserApiKeyWithSecretEntity })
  async create(@Body() userApiKeyCreateDto: UserApiKeyCreateDto, @UseActor() actor: Actor) {
    return this.userApiKeyService.create(userApiKeyCreateDto, actor);
  }

  @Get()
  async findAll(@UseActor() actor: Actor) {
    return this.userApiKeyService.findAll(actor);
  }

  @Delete(":userApiKeyId")
  async revoke(@Param("userApiKeyId") userApiKeyId: string, @UseActor() actor: Actor) {
    return this.userApiKeyService.revoke(userApiKeyId, actor);
  }
}
