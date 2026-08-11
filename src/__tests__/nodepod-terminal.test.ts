import { describe, expect, it } from "vitest";
import { NodepodTerminal } from "../sdk/nodepod-terminal";

class FakeTerminal {
  static instances: FakeTerminal[] = [];
  readonly writes: string[] = [];

  constructor(_options: unknown) {
    FakeTerminal.instances.push(this);
  }

  open(): void {}
  loadAddon(): void {}
  focus(): void {}
  dispose(): void {}

  write(text: string): void {
    this.writes.push(text);
  }

  onData(): { dispose(): void } {
    return { dispose() {} };
  }
}

class FakeSerializeAddon {
  serialize(): string {
    return "restored output";
  }
}

describe("NodepodTerminal initial prompt", () => {
  it("shows the default prompt when first attached", () => {
    FakeTerminal.instances = [];
    const terminal = new NodepodTerminal({ Terminal: FakeTerminal });
    terminal.setCwd("/project");

    terminal.attach({} as HTMLElement);

    expect(FakeTerminal.instances[0].writes).toEqual([
      "\x1b[36mnodepod\x1b[0m:\x1b[34m/project\x1b[0m$ ",
    ]);
  });

  it("allows startup output to defer the first prompt", () => {
    FakeTerminal.instances = [];
    const terminal = new NodepodTerminal({
      Terminal: FakeTerminal,
      autoPrompt: false,
    });

    terminal.attach({} as HTMLElement);

    expect(FakeTerminal.instances[0].writes).toEqual([]);
  });

  it("restores serialized output without adding another prompt", () => {
    FakeTerminal.instances = [];
    const terminal = new NodepodTerminal({
      Terminal: FakeTerminal,
      SerializeAddon: FakeSerializeAddon,
    });

    terminal.attach({} as HTMLElement);
    terminal.detach();
    terminal.attach({} as HTMLElement);

    expect(FakeTerminal.instances[1].writes).toEqual(["restored output"]);
  });
});
