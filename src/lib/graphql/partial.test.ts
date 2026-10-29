import { describe, expect, it } from "vitest";
import { can } from "@/lib/permissions";
import { classifyGraphQLErrors } from "./errors";
import { withoutRootFields } from "./partial";

const QUERY = /* GraphQL */ `
  query Page($first: Int!, $id: ID!) {
    companies(first: $first) { data { id name } }
    devices(first: $first) { data { id } paginatorInfo { total } }
    me { id }
    one: vehicle(id: $id) { id }
  }
`;

describe("withoutRootFields", () => {
  it("drops refused fields, gives them empty values and keeps used variables", () => {
    const out = withoutRootFields(QUERY, ["companies", "one"])!;
    expect(out.empty).toEqual({ companies: { data: [], paginatorInfo: { total: 0 } }, one: null });
    expect(out.query).toContain("devices(first: $first)");
    expect(out.query).not.toContain("companies");
    expect(out.query).not.toContain("$id");
    expect(out.query).toContain("$first: Int!");
  });

  it("gives up when nothing would be left, or for mutations", () => {
    expect(withoutRootFields(`query { me { id } }`, ["me"])).toBeNull();
    expect(withoutRootFields(`mutation { a { id } b { id } }`, ["a"])).toBeNull();
    expect(withoutRootFields(QUERY, ["unknown"])).toBeNull();
  });
});

describe("forbidden errors", () => {
  it("lists the refused top-level fields only when every error is one", () => {
    expect(classifyGraphQLErrors([{ message: "Forbidden.", path: ["companies"] }, { message: "Forbidden.", path: ["devices", 0] }])).toEqual({
      kind: "forbidden",
      message: "Forbidden.",
      forbiddenFields: ["companies", "devices"],
    });
    expect(classifyGraphQLErrors([{ message: "Forbidden." }]).forbiddenFields).toBeUndefined();
  });
});

describe("can", () => {
  it("checks module.action strings", () => {
    const me = { permissions: ["vehicles.view", "vehicles.edit"] };
    expect(can(me, "vehicles")).toBe(true);
    expect(can(me, "vehicles", "edit")).toBe(true);
    expect(can(me, "vehicles", "delete")).toBe(false);
    expect(can(undefined, "vehicles")).toBe(false);
  });
});
