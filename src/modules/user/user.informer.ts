import { Injectable } from "@nestjs/common";
import { AccessCaslPrismaSubjectModel, AccessSubjectInstanceInformer } from "src/libraries/access";
import { UserService } from "./user.service";
import { Request } from "express";
import { subject } from "@casl/ability";

export const UserWithId = (param: string) => {
  @Injectable()
  class UserInformer implements AccessSubjectInstanceInformer {
    constructor(readonly userService: UserService) {}

    async informAccessSubjectInstance(request: Request): Promise<AccessCaslPrismaSubjectModel> {
      return subject("User", await this.userService.findOne(request.params[param]));
    }
  }
  return UserInformer;
};
