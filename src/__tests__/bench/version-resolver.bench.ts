import { describe, bench } from "vitest";
import {
  parseSemver,
  compareSemver,
  satisfiesRange,
  pickBestMatch,
} from "../../packages/version-resolver";

const VERSIONS = [
  "1.0.0", "1.0.1", "1.1.0", "1.2.0", "1.2.3",
  "2.0.0", "2.0.1", "2.1.0", "2.3.4",
  "3.0.0-alpha.1", "3.0.0-beta.1", "3.0.0", "3.1.0", "3.2.1",
  "4.0.0", "4.1.0", "4.2.0", "4.3.0", "4.4.0", "4.5.0",
  "5.0.0", "5.1.0", "5.2.0", "5.3.0", "5.4.0", "5.5.0",
];

describe("parseSemver", () => {
  bench("simple version", () => {
    parseSemver("3.2.1");
  });

  bench("with prerelease", () => {
    parseSemver("3.0.0-alpha.1");
  });

  bench("invalid (returns null)", () => {
    parseSemver("not-a-version");
  });
});

describe("compareSemver", () => {
  bench("equal versions", () => {
    compareSemver("1.2.3", "1.2.3");
  });

  bench("different major", () => {
    compareSemver("1.2.3", "2.0.0");
  });

  bench("different patch", () => {
    compareSemver("1.2.3", "1.2.4");
  });

  bench("with prerelease", () => {
    compareSemver("3.0.0-alpha.1", "3.0.0-beta.1");
  });
});

describe("satisfiesRange", () => {
  bench("caret: ^1.2.0", () => {
    satisfiesRange("1.5.0", "^1.2.0");
  });

  bench("tilde: ~1.2.0", () => {
    satisfiesRange("1.2.5", "~1.2.0");
  });

  bench("compound: >=2.0.0 <4.0.0", () => {
    satisfiesRange("3.1.0", ">=2.0.0 <4.0.0");
  });

  bench("OR union: ^1.0.0 || ^2.0.0", () => {
    satisfiesRange("2.1.0", "^1.0.0 || ^2.0.0");
  });

  bench("x-range: 1.x", () => {
    satisfiesRange("1.5.0", "1.x");
  });

  bench("wildcard: *", () => {
    satisfiesRange("5.0.0", "*");
  });

  bench("exact: 1.2.3", () => {
    satisfiesRange("1.2.3", "1.2.3");
  });
});

describe("pickBestMatch", () => {
  bench("^1.0.0 from 26 versions", () => {
    pickBestMatch(VERSIONS, "^1.0.0");
  });

  bench(">=2.0.0 <5.0.0 from 26 versions", () => {
    pickBestMatch(VERSIONS, ">=2.0.0 <5.0.0");
  });

  bench("* from 26 versions", () => {
    pickBestMatch(VERSIONS, "*");
  });

  bench("no match: ^99.0.0", () => {
    pickBestMatch(VERSIONS, "^99.0.0");
  });
});
