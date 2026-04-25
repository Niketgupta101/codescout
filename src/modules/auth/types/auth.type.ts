export type AuthRefreshCredentials = {
  refreshToken: string;
  refreshTokenExpiresAt: Date;
};

export type AuthExchangeCredentials = {
  exchangeToken: string;
  exchangeTokenExpiresAt: Date;
};

export type AuthAccessCredentials = {
  id: string;
  accessToken: string;
  accessTokenExpiresAt: Date;
};
