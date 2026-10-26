/**
 * Auth operations exactly as documented in the Klever Tracker guide.
 *
 * These are typed by hand until the backend shares schema.graphql (api-alignment.md B2).
 * Then run `npm run codegen` and switch to the generated `graphql()` documents in src/gql.
 */

export const PING = /* GraphQL */ `
  query Ping {
    ping
  }
`;
export type PingResult = { ping: string };

export const LOGIN = /* GraphQL */ `
  mutation Login($email: String!, $password: String!) {
    login(email: $email, password: $password) {
      token
      user {
        id
        name
        email
      }
    }
  }
`;
export type LoginVariables = { email: string; password: string };
export type LoginResult = { login: { token: string; user: { id: string; name: string; email: string } } };

export const FORGOT_PASSWORD = /* GraphQL */ `
  mutation ForgotPassword($email: String!) {
    forgotPassword(email: $email)
  }
`;
export type ForgotPasswordResult = { forgotPassword: boolean };

export const RESET_PASSWORD = /* GraphQL */ `
  mutation ResetPassword($token: String!, $email: String!, $password: String!) {
    resetPassword(token: $token, email: $email, password: $password)
  }
`;
export type ResetPasswordVariables = { token: string; email: string; password: string };
export type ResetPasswordResult = { resetPassword: boolean };
