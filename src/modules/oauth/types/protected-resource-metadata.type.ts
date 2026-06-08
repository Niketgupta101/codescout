// rfc 9728 protected resource metadata advertised at /.well-known/oauth-protected-resource
export type OAuthProtectedResourceMetadata = {
  resource: string;
  authorization_servers: string[];
  scopes_supported: string[];
  bearer_methods_supported: string[];
};
