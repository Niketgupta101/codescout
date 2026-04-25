export type FileFilterConfig = {
  include?: string[]; // glob patterns like ['**/*.ts', '**/*.js']
  exclude?: string[]; // patterns like ['node_modules/**', 'dist/**']
  respectGitignore?: boolean;
};
