import { makeWarning, M0_WARNING_SPECS } from "./warnings";

describe("makeWarning", () => {
  it("creates a warning with default message", () => {
    const w = makeWarning({ code: "PRECISION_EXCEEDS_NORM" });

    expect(w.severity).toBe("warning");
    expect(w.code).toBe("PRECISION_EXCEEDS_NORM");
    expect(w.message).toBe(
      M0_WARNING_SPECS.PRECISION_EXCEEDS_NORM.defaultMessage
    );
    expect(w.span).toBeNull();
    expect(w.position).toBeNull();
    expect(w.details).toBeUndefined();
    expect("span" in w).toBe(true);
    expect("position" in w).toBe(true);

  });

  it("allows overriding the message", () => {
    const w = makeWarning({
      code: "PRECISION_EXCEEDS_NORM",
      message: "custom message",
    });

    expect(w.message).toBe("custom message");
  });

  it("passes through optional fields", () => {
    const w = makeWarning({
      code: "PRECISION_EXCEEDS_NORM",
      span: { start: 0, end: 5 },
      position: 3,
      details: { norm: 100, maxSplitAny: 256 },
    });

    expect(w.span).toEqual({ start: 0, end: 5 });
    expect(w.position).toBe(3);
    expect(w.details).toEqual({ norm: 100, maxSplitAny: 256 });
    expect("span" in w).toBe(true);
    expect("position" in w).toBe(true);

  });

  it("allows explicitly setting span/position to null", () => {
    const w = makeWarning({
      code: "PRECISION_EXCEEDS_NORM",
      span: null,
      position: null,
    });

    expect(w.span).toBeNull();
    expect(w.position).toBeNull();
    expect("span" in w).toBe(true);
    expect("position" in w).toBe(true);

  });
});
