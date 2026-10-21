# VMark 自动更新功能文档

本项目已配置双重自动更新机制，确保本地安装以及代码库始终与原仓库 [xiaolai/vmark](https://github.com/xiaolai/vmark) 保持同步更新。

---

## 一、本地安装与自动更新（Windows 系统）

### 1. 本地安装路径
- **应用程序安装目录**：`D:\VMark\`
- **主可执行程序**：`D:\VMark\vmark.exe`
- **源码工作区目录**：`D:\vmark-source\`

### 2. 本地自动更新脚本（已配置计划任务）
在 `D:\VMark\` 目录下配置了专用的自动化更新工具：

- **`auto-updater.ps1`**：
  - 自动调用 GitHub API 查询 `xiaolai/vmark` 的最新 Release 版本；
  - 读取当前 `D:\VMark\vmark.exe` 的文件版本；
  - 当发现原仓库有新版本发布时，自动下载 Windows 安装包（`VMark_{version}_x64-setup.exe`）；
  - 静默安装更新至 `D:\VMark\`，并记录更新日志到 `D:\VMark\updater.log`。

- **`install-auto-updater.ps1`**：
  - 已将自动更新注册为 Windows 系统计划任务（Task Name: `VMarkAutoUpdater`）；
  - 触发机制：每次用户登录时自动检查，并在运行期间每 4 小时循环检测一次，一旦发现原仓库有更新便无缝自动更新。

- **`Check-Update.bat`**：
  - 手动双击即可随时执行一次版本检测与更新。

---

## 二、应用内自动更新机制（Tauri 客户端）

1. **上游 Release 源直连**：
   `src-tauri/tauri.conf.json` 中的 `plugins.updater.endpoints` 已将原仓库的 Release 作为第一优先级：
   ```json
   "endpoints": [
     "https://github.com/xiaolai/vmark/releases/latest/download/latest.json",
     "https://log.vmark.app/update/latest.json?target={{target}}&arch={{arch}}&version={{current_version}}"
   ]
   ```

2. **后台周期性自动检测**：
   在 `src/hooks/useUpdateChecker.ts` 中增强了周期性轮询机制（默认运行期间每小时在后台执行一次轻量检查），不再局限于仅在应用启动的一瞬间检查。

3. **下载后安全热重启更新**：
   当新版本下载就绪且当前文档均已保存时，可无缝触发热退出并重启应用新版本。

---

## 三、GitHub Fork 仓库自动同步（GitHub Actions）

在 `.github/workflows/sync-upstream.yml` 中配置了自动化工作流：
- 每 6 小时自动从 `xiaolai/vmark` 拉取最新代码与 Release 标签（Tags）；
- 自动合并到 Fork 仓库的主分支，保持 Fork 仓库与原仓库完全同步。
