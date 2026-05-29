//! 文件系统便捷操作。

use std::fs;
use std::io;
use std::path::Path;

/// 递归创建目录（等同于 `mkdir -p`）。
pub fn ensure_dir(path: impl AsRef<Path>) -> io::Result<()> {
    fs::create_dir_all(path)
}

/// 拷贝文件，目标目录不存在时自动创建。
pub fn copy_file(src: impl AsRef<Path>, dest: impl AsRef<Path>) -> io::Result<u64> {
    if let Some(parent) = dest.as_ref().parent() {
        fs::create_dir_all(parent)?;
    }
    fs::copy(src, dest)
}
