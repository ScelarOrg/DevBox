// stub - macOS-only native module, no-op in browser


/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

export const constants = {
  kFSEventStreamEventFlagNone: 0x00000000,
  kFSEventStreamEventFlagMustScanSubDirs: 0x00000001,
  kFSEventStreamEventFlagUserDropped: 0x00000002,
  kFSEventStreamEventFlagKernelDropped: 0x00000004,
  kFSEventStreamEventFlagEventIdsWrapped: 0x00000008,
  kFSEventStreamEventFlagHistoryDone: 0x00000010,
  kFSEventStreamEventFlagRootChanged: 0x00000020,
  kFSEventStreamEventFlagMount: 0x00000040,
  kFSEventStreamEventFlagUnmount: 0x00000080,
  kFSEventStreamEventFlagItemCreated: 0x00000100,
  kFSEventStreamEventFlagItemRemoved: 0x00000200,
  kFSEventStreamEventFlagItemInodeMetaMod: 0x00000400,
  kFSEventStreamEventFlagItemRenamed: 0x00000800,
  kFSEventStreamEventFlagItemModified: 0x00001000,
  kFSEventStreamEventFlagItemFinderInfoMod: 0x00002000,
  kFSEventStreamEventFlagItemChangeOwner: 0x00004000,
  kFSEventStreamEventFlagItemXattrMod: 0x00008000,
  kFSEventStreamEventFlagItemIsFile: 0x00010000,
  kFSEventStreamEventFlagItemIsDir: 0x00020000,
  kFSEventStreamEventFlagItemIsSymlink: 0x00040000,
};

/* ------------------------------------------------------------------ */
/*  watch                                                              */
/* ------------------------------------------------------------------ */

export function watch(
  _path: string,
  _handler: (filePath: string, flags: number, id: number) => void,
): () => Promise<void> {
  // Return a stop function that resolves immediately.
  return () => Promise.resolve();
}

/* ------------------------------------------------------------------ */
/*  getInfo                                                            */
/* ------------------------------------------------------------------ */

export function getInfo(
  filePath: string,
  flags: number,
): {
  event: string;
  path: string;
  type: string;
  changes: {
    inode: boolean;
    finder: boolean;
    access: boolean;
    xattrs: boolean;
  };
  flags: number;
} {
  return {
    event: "unknown",
    path: filePath,
    type: "file",
    changes: { inode: false, finder: false, access: false, xattrs: false },
    flags,
  };
}

/* ------------------------------------------------------------------ */
/*  Default export                                                     */
/* ------------------------------------------------------------------ */

export default {
  watch,
  getInfo,
  constants,
};
