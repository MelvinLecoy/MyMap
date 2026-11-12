import test from "node:test";
import assert from "node:assert/strict";
import { parseStatusOverrides } from "../src/lib/status-storage.js";

test("saved statuses retain supported choices and ignore invalid entries", () => {
  assert.deepEqual(
    parseStatusOverrides(
      JSON.stringify({
        moscow: "Complete",
        warsaw: "Update",
        prague: "Unfinished",
        helsinki: "Not Started",
        invalid: "Finished",
        number: 1,
        nested: { status: "Complete" },
        "": "Complete",
      }),
    ),
    {
      moscow: "Complete",
      warsaw: "Update",
      prague: "Unfinished",
      helsinki: "Not Started",
    },
  );
});

test("missing or damaged saved data falls back to imported statuses", () => {
  for (const value of [null, "{broken", "null", "[]", '"Complete"', "17"]) {
    assert.deepEqual(parseStatusOverrides(value), {});
  }
});
