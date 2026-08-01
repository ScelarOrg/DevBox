// OS/filesystem constants (deprecated in Node.js, use os.constants instead)


export const SIGKILL = 9;
export const SIGTERM = 15;
export const SIGINT = 2;
export const SIGHUP = 1;
export const SIGQUIT = 3;
export const SIGABRT = 6;
export const SIGALRM = 14;
export const SIGUSR1 = 10;
export const SIGUSR2 = 12;
export const SIGPIPE = 13;
export const SIGCHLD = 17;
export const SIGCONT = 18;
export const SIGSTOP = 19;
export const SIGTSTP = 20;

// File access constants
export const F_OK = 0;
export const R_OK = 4;
export const W_OK = 2;
export const X_OK = 1;

// File open constants
export const O_RDONLY = 0;
export const O_WRONLY = 1;
export const O_RDWR = 2;
export const O_CREAT = 64;
export const O_EXCL = 128;
export const O_TRUNC = 512;
export const O_APPEND = 1024;
export const O_DIRECTORY = 65536;
export const O_NOFOLLOW = 131072;
export const O_SYNC = 1052672;

// File type constants
export const S_IFMT = 61440;
export const S_IFREG = 32768;
export const S_IFDIR = 16384;
export const S_IFCHR = 8192;
export const S_IFBLK = 24576;
export const S_IFIFO = 4096;
export const S_IFLNK = 40960;
export const S_IFSOCK = 49152;

// Errno constants
export const EACCES = -13;
export const EEXIST = -17;
export const EISDIR = -21;
export const EMFILE = -24;
export const ENOENT = -2;
export const ENOTDIR = -20;
export const ENOTEMPTY = -39;
export const EPERM = -1;
export const EBADF = -9;

export const os = {
  constants: {
    signals: {
      SIGKILL,
      SIGTERM,
      SIGINT,
      SIGHUP,
      SIGQUIT,
      SIGABRT,
      SIGALRM,
      SIGUSR1,
      SIGUSR2,
      SIGPIPE,
      SIGCHLD,
      SIGCONT,
      SIGSTOP,
      SIGTSTP,
    },
    errno: {
      EACCES,
      EEXIST,
      EISDIR,
      EMFILE,
      ENOENT,
      ENOTDIR,
      ENOTEMPTY,
      EPERM,
      EBADF,
    },
  },
};

export const fs = {
  constants: {
    F_OK,
    R_OK,
    W_OK,
    X_OK,
    O_RDONLY,
    O_WRONLY,
    O_RDWR,
    O_CREAT,
    O_EXCL,
    O_TRUNC,
    O_APPEND,
    O_DIRECTORY,
    O_NOFOLLOW,
    O_SYNC,
    S_IFMT,
    S_IFREG,
    S_IFDIR,
    S_IFCHR,
    S_IFBLK,
    S_IFIFO,
    S_IFLNK,
    S_IFSOCK,
  },
};

export default {
  ...os.constants.signals,
  ...os.constants.errno,
  ...fs.constants,
  os,
  fs,
};
