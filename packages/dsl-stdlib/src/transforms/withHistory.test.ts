import { withHistory, History } from "./withHistory";
import { pipe } from "./pipe";

describe("withHistory", () => {
  test("entry returns a History with size 0", () => {
    const h = withHistory("1");
    expect(h).toBeInstanceOf(History);
    expect(h.size()).toBe(0);
    expect(h.peek()).toBe("1");
    expect(h.canUndo()).toBe(false);
    expect(h.canRedo()).toBe(false);
  });

  test("each method pushes one snapshot and increments size", () => {
    const h = withHistory("1")
      .split({ by: "logicalIndex", index: 0 }, { axis: "row", count: 3 });
    expect(h.size()).toBe(1);
    expect(h.canUndo()).toBe(true);
    expect(h.canRedo()).toBe(false);
  });

  test("undo / redo navigate the snapshot stack", () => {
    const h = withHistory("1")
      .split({ by: "logicalIndex", index: 0 }, { axis: "row", count: 3 })
      .addOverlay({ by: "logicalIndex", index: 0 });

    const afterTwo = h.peek();
    const afterOne = h.undo();
    expect(afterOne).not.toBe(afterTwo);
    expect(h.canRedo()).toBe(true);

    const original = h.undo();
    expect(original).toBe("1");
    expect(h.canUndo()).toBe(false);

    const redone = h.redo();
    expect(redone).toBe(afterOne);
    const redoneTwo = h.redo();
    expect(redoneTwo).toBe(afterTwo);
    expect(h.canRedo()).toBe(false);
  });

  test("undo at the floor is a no-op", () => {
    const h = withHistory("1");
    expect(h.undo()).toBe("1");
    expect(h.undo()).toBe("1");
    expect(h.canUndo()).toBe(false);
  });

  test("redo on an empty redo stack is a no-op", () => {
    const h = withHistory("1");
    expect(h.redo()).toBe("1");
    expect(h.canRedo()).toBe(false);
  });

  test("a new step after undo clears the redo stack (branch)", () => {
    const h = withHistory("1")
      .split({ by: "logicalIndex", index: 0 }, { axis: "row", count: 3 });
    h.undo();
    expect(h.canRedo()).toBe(true);

    h.split({ by: "logicalIndex", index: 0 }, { axis: "col", count: 2 });
    expect(h.canRedo()).toBe(false);
  });

  test("matches imperative byte-for-byte at the terminator", () => {
    const m0 = "1";
    const h = withHistory(m0)
      .split({ by: "logicalIndex", index: 0 }, { axis: "row", count: 3 })
      .split({ by: "logicalIndex", index: 1 }, { axis: "col", count: 2 })
      .addOverlay({ by: "logicalIndex", index: 0 });

    const piped = pipe(m0)
      .split({ by: "logicalIndex", index: 0 }, { axis: "row", count: 3 })
      .split({ by: "logicalIndex", index: 1 }, { axis: "col", count: 2 })
      .addOverlay({ by: "logicalIndex", index: 0 })
      .build();

    expect(h.build()).toBe(piped);
  });

  test("errors are wrapped with step index and op name; stacks unchanged", () => {
    const h = withHistory("1")
      .split({ by: "logicalIndex", index: 0 }, { axis: "row", count: 3 });
    const sizeBefore = h.size();
    expect(() =>
      h.addOverlay({ by: "logicalIndex", index: 99 }),
    ).toThrow(/history step 1 \(addOverlay\):/);
    expect(h.size()).toBe(sizeBefore);
  });
});

describe("Pipe.buildWithHistory bridge", () => {
  test("a pipe with no steps returns an empty history", () => {
    const h = pipe("1").buildWithHistory();
    expect(h.size()).toBe(0);
    expect(h.peek()).toBe("1");
  });

  test("a pipe collapses to a single undo entry", () => {
    const m0 = "1";
    const final = pipe(m0)
      .split({ by: "logicalIndex", index: 0 }, { axis: "row", count: 3 })
      .addOverlay({ by: "logicalIndex", index: 0 })
      .buildWithHistory();

    expect(final.size()).toBe(1);
    expect(final.peek()).not.toBe(m0);

    const undone = final.undo();
    expect(undone).toBe(m0);
    expect(final.canUndo()).toBe(false);
    expect(final.canRedo()).toBe(true);
  });
});

describe("History.fromSnapshots (factory)", () => {
  test("rejects an empty input", () => {
    expect(() => History.fromSnapshots([])).toThrow();
  });

  test("a single snapshot has size 0 and no undo", () => {
    const h = History.fromSnapshots(["1"]);
    expect(h.size()).toBe(0);
    expect(h.canUndo()).toBe(false);
  });

  test("two snapshots collapse to one undo step", () => {
    const h = History.fromSnapshots(["1", "2(1,1)"]);
    expect(h.size()).toBe(1);
    expect(h.peek()).toBe("2(1,1)");
    expect(h.undo()).toBe("1");
  });
});
