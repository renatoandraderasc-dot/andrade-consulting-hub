import { describe, expect, it } from "vitest";
import { readPresentationAssetUrl } from "./assetPointer";

describe("presentation asset pointer recovery", () => {
  it("does not crash on an empty or partially written media pointer", () => {
    for (const raw of ["", " ", "{", '{"url":', undefined]) {
      expect(readPresentationAssetUrl(raw)).toBeUndefined();
    }
  });
  it("does not crash on valid JSON with an invalid pointer shape", () => {
    for (const raw of ["null", "[]", "42", "{}", '{"url":5}']) {
      expect(readPresentationAssetUrl(raw)).toBeUndefined();
    }
  });
  it("returns the CDN path of a valid saved pointer", () => {
    expect(readPresentationAssetUrl('{"url":"/__l5e/assets-v1/example/photo.jpg"}'))
      .toBe("/__l5e/assets-v1/example/photo.jpg");
  });
  it("rejects non-media and executable URLs", () => {
    expect(readPresentationAssetUrl('{"url":"javascript:alert(1)"}')).toBeUndefined();
    expect(readPresentationAssetUrl('{"url":"https://untrusted.example/photo.jpg"}')).toBeUndefined();
  });
});