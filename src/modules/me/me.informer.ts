import { Injectable } from "@nestjs/common";
import { AccessCaslPrismaSubjectModel, AccessSubjectInstanceInformer } from "src/libraries/access";
import { subject } from "@casl/ability";
import { RequestWithUser } from "../auth/types/request-with-user.type";

@Injectable()
export class MeInRequest implements AccessSubjectInstanceInformer {
  async informAccessSubjectInstance(request: RequestWithUser): Promise<AccessCaslPrismaSubjectModel> {
    if (!request.user) {
      throw new Error("Request does not contain authorized user");
    }
    return subject("User", request.user);
  }
}
