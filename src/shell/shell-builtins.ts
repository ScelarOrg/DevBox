// Assembles all builtin commands from category modules into one map.

import type { BuiltinFn } from "./shell-types";
import { fileOpsCommands } from "./commands/file-ops";
import { directoryCommands } from "./commands/directory";
import { textProcessingCommands } from "./commands/text-processing";
import { searchCommands } from "./commands/search";
import { shellEnvCommands, setBuiltinsRef } from "./commands/shell-env";

export const builtins = new Map<string, BuiltinFn>([
  ...fileOpsCommands,
  ...directoryCommands,
  ...textProcessingCommands,
  ...searchCommands,
  ...shellEnvCommands,
]);

// shell-env needs the builtins ref for `which` and `type`
setBuiltinsRef(builtins);
