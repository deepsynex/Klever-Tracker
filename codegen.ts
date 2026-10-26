import type { CodegenConfig } from "@graphql-codegen/cli";

/**
 * Generates typed GraphQL documents from the Klever schema.
 * Needs schema.graphql in this folder (api-alignment.md B2), produced on the backend with:
 *   php artisan lighthouse:print-schema > schema.graphql
 */
const config: CodegenConfig = {
  schema: "./schema.graphql",
  documents: ["src/**/*.{ts,tsx}", "!src/gql/**/*"],
  ignoreNoDocuments: true,
  generates: {
    "./src/gql/": {
      preset: "client",
      config: {
        documentMode: "string",
        enumsAsTypes: true,
        useTypeImports: true,
      },
    },
  },
};

export default config;
