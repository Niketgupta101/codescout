import { IsString } from "class-validator";

export class UpdateConversationDto {
  @IsString()
  title: string;
}
