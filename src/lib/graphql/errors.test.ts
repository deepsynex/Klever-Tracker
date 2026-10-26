import { describe, expect, it } from "vitest";
import { classifyGraphQLErrors, classifyHttpResponse, isUnauthenticatedBody } from "./errors";

describe("classifyGraphQLErrors", () => {
  it("recognises the documented login failure", () => {
    expect(classifyGraphQLErrors([{ message: "Invalid credentials." }]).kind).toBe("invalid_credentials");
  });

  it("separates permission blocks from tenant isolation", () => {
    expect(classifyGraphQLErrors([{ message: "Forbidden." }]).kind).toBe("forbidden");
    expect(classifyGraphQLErrors([{ message: "Not found." }]).kind).toBe("not_found");
  });

  it("detects unauthenticated by message or category", () => {
    expect(classifyGraphQLErrors([{ message: "Unauthenticated." }]).kind).toBe("unauthenticated");
    expect(classifyGraphQLErrors([{ message: "x", extensions: { category: "authentication" } }]).kind).toBe(
      "unauthenticated",
    );
  });

  it("flattens Lighthouse validation paths to field names", () => {
    const error = classifyGraphQLErrors([
      {
        message: "Validation failed for the field [resetPassword].",
        extensions: { validation: { "input.password": ["The password field must be at least 8 characters."] } },
      },
    ]);
    expect(error.kind).toBe("validation");
    expect(error.fields).toEqual({ password: ["The password field must be at least 8 characters."] });
  });
});

describe("classifyHttpResponse", () => {
  it("returns data for a successful GraphQL response", () => {
    expect(classifyHttpResponse(200, '{"data":{"ping":"up"}}')).toEqual({ data: { ping: "up" } });
  });

  it("treats a non-JSON 401 page (basic-auth lock) as api_locked", () => {
    const { error } = classifyHttpResponse(401, "<html><title>401 Authorization Required</title></html>");
    expect(error?.kind).toBe("api_locked");
    expect(error?.status).toBe(401);
  });

  it("treats other non-JSON responses as gateway errors", () => {
    expect(classifyHttpResponse(502, "<html>Bad gateway</html>").error?.kind).toBe("gateway");
  });

  it("treats status 0 as a network failure", () => {
    expect(classifyHttpResponse(0, "").error?.kind).toBe("network");
  });

  it("classifies GraphQL errors inside a 200 response", () => {
    expect(classifyHttpResponse(200, '{"errors":[{"message":"Forbidden."}]}').error?.kind).toBe("forbidden");
  });
});

describe("isUnauthenticatedBody", () => {
  it("is true only for unauthenticated errors", () => {
    expect(isUnauthenticatedBody('{"errors":[{"message":"Unauthenticated."}]}')).toBe(true);
    expect(isUnauthenticatedBody('{"errors":[{"message":"Forbidden."}]}')).toBe(false);
    expect(isUnauthenticatedBody("not json")).toBe(false);
  });
});
