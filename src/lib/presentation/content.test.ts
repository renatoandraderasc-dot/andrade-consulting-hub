import { describe, expect, it } from "vitest";
import { nextSlideIndex, readSlideIndex } from "./content";
import { presentationFileKind } from "./media";

describe("presentation navigation", () => {
  it("restores a shared slide URL using one-based coordinates", () => {
    expect(readSlideIndex("6", 15)).toBe(5);
    expect(readSlideIndex("15", 15)).toBe(14);
  });
  it("rejects invalid slide coordinates", () => {
    for (const value of ["0", "-1", "16", "1.5", "oops", null]) expect(readSlideIndex(value, 15)).toBe(0);
  });
  it("does not pass the first or last slide", () => {
    expect(nextSlideIndex(0, -1, 15)).toBe(0);
    expect(nextSlideIndex(14, 1, 15)).toBe(14);
    expect(nextSlideIndex(3, 1, 15)).toBe(4);
  });
});

describe("presentation media", () => {
  it("accepts bitmap logos but rejects active SVG and video as a logo", () => {
    expect(presentationFileKind("image/png", true)).toBe("image");
    expect(presentationFileKind("image/svg+xml", true)).toBeNull();
    expect(presentationFileKind("video/mp4", true)).toBeNull();
  });
  it("accepts playable media and rejects other files", () => {
    expect(presentationFileKind("video/mp4")).toBe("video");
    expect(presentationFileKind("image/jpeg")).toBe("image");
    expect(presentationFileKind("text/html")).toBeNull();
  });
});