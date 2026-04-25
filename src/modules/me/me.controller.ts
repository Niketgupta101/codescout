import { Body, Controller, Get, Patch, Post } from "@nestjs/common";
import { Entity } from "src/decorators/entity.decorator";
import { UpdateMeDto } from "./dto/update-me.dto";
import { UseActor } from "../actor/decorators/use-actor.decorator";
import { Actor } from "../actor/types/actor.type";
import { MeService } from "./me.service";
import { RemoveMeDto } from "./dto/remove-me.dto";
import { Condition, Enforce } from "src/libraries/access";
import { MeInRequest } from "./me.informer";
import { MeEntity } from "./entities/me.entity";

@Controller("me")
@Entity({ type: MeEntity })
export class MeController {
  constructor(readonly meService: MeService) {}

  @Get()
  async find(@UseActor() actor: Actor) {
    return this.meService.find(actor);
  }

  @Patch()
  async update(@Body() updateMeDto: UpdateMeDto, @UseActor() actor: Actor) {
    return this.meService.update(updateMeDto, actor);
  }

  @Post("remove")
  @Enforce(Condition({ can: "delete", one: MeInRequest }))
  async remove(@Body() removeMeDto: RemoveMeDto, @UseActor() actor: Actor) {
    return this.meService.remove(removeMeDto, actor);
  }
}
