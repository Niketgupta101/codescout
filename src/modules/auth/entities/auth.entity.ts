import { Expose } from "class-transformer";

@Expose()
export class AuthEntity {
  id: string;
  accessToken: string;
  accessTokenExpiresAt: Date;
  refreshToken?: string;
  refreshTokenExpiresAt?: Date;
}
