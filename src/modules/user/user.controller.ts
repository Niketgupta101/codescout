import { Controller, Get, Post, Body, Patch, Param, Delete, Query } from "@nestjs/common";
import { UserService } from "./user.service";
import { CreateUserDto } from "./dto/create-user.dto";
import { UpdateUserDto } from "./dto/update-user.dto";
import { UserEntity } from "./entities/user.entity";
import { FindAllUsersDto } from "./dto/find-all-users.dto";
import { UserPageEntity } from "./entities/user-page.entity";
import { Entity } from "src/decorators/entity.decorator";
import { UseActor } from "../actor/decorators/use-actor.decorator";
import { Actor } from "../actor/types/actor.type";
import { Condition, Enforce, FieldsInRequest, ResourceInRequest } from "src/libraries/access";
import { UserWithId } from "./user.informer";

@Controller("user")
@Entity({ type: UserEntity })
export class UserController {
  constructor(readonly userService: UserService) {}

  @Post()
  @Enforce(Condition({ can: "create", one: ResourceInRequest("User"), with: FieldsInRequest() }))
  async create(@Body() createUserDto: CreateUserDto, @UseActor() actor: Actor) {
    return await this.userService.create(createUserDto, actor);
  }

  @Get()
  @Entity({ type: UserPageEntity })
  @Enforce(Condition({ can: "read", any: "User" }))
  async findAll(@Query() findAllUsersDto: FindAllUsersDto, @UseActor() actor: Actor) {
    return await this.userService.findAll(findAllUsersDto, actor);
  }

  @Get(":userId")
  @Enforce(Condition({ can: "read", one: UserWithId("userId") }))
  async findOne(@Param("userId") userId: string) {
    return await this.userService.findOne(userId);
  }

  @Patch(":userId")
  @Enforce(Condition({ can: "update", one: UserWithId("userId"), with: FieldsInRequest() }))
  async update(@Param("userId") userId: string, @Body() updateUserDto: UpdateUserDto, @UseActor() actor: Actor) {
    return await this.userService.update(userId, updateUserDto, actor);
  }

  @Delete(":userId")
  @Enforce(Condition({ can: "delete", one: UserWithId("userId"), with: FieldsInRequest() }))
  async remove(@Param("userId") userId: string) {
    return await this.userService.remove(userId);
  }
}
