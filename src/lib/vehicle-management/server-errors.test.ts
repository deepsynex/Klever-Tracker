import { describe, expect, it } from "vitest";
import { ApiRequestError } from "@/lib/graphql/client";
import { classifyHttpResponse } from "@/lib/graphql/errors";
import { errorLabel, serverFieldErrors } from "./use-vm";

/** The API's real error shape for a rejected mutation. */
function apiError(validation: Record<string, string[]>) {
  const body = JSON.stringify({ errors: [{ message: "Validation failed for the field [updateVehicle].", extensions: { validation } }] });
  return new ApiRequestError(classifyHttpResponse(200, body).error!);
}

describe("API validation errors on forms", () => {
  it("maps each argument to its form field as a server message", () => {
    const err = apiError({ downPayment: ["Down payment cannot be more than total cost."] });
    expect(serverFieldErrors(err)).toEqual({ downPayment: "server:Down payment cannot be more than total cost." });
  });

  it("renames arguments that the form calls differently", () => {
    const err = apiError({ logDate: ["Already logged."], stopOdometerKm: ["Too low."] });
    expect(serverFieldErrors(err, { logDate: "date", stopOdometerKm: "stop" })).toEqual({
      date: "server:Already logged.",
      stop: "server:Too low.",
    });
  });

  it("ignores errors that aren't validation errors", () => {
    const forbidden = new ApiRequestError(classifyHttpResponse(200, JSON.stringify({ errors: [{ message: "Forbidden." }] })).error!);
    expect(serverFieldErrors(forbidden)).toBeNull();
    expect(serverFieldErrors(new Error("network"))).toBeNull();
  });

  it("shows API text as-is and translates our own keys", () => {
    const tv = (key: string) => `t:${key}`;
    expect(errorLabel(tv, "server:Plate exists.")).toBe("Plate exists.");
    expect(errorLabel(tv, "required")).toBe("t:required");
  });
});
