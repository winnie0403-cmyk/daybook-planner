# Planner 项目交接说明

更新时间：2026-09-29

## 新对话开场提示

请先阅读本文件，然后继续带我完成 GitHub Pages 发布。当前最重要的事情不是继续开发功能，而是确认我的 `daybook-planner` 仓库是否正确上传了文件，并开启 GitHub Pages，让我得到一个可以发给朋友的网址。

我刚开始学习 GitHub，请一次只带我做一个步骤，用中文解释，不要默认我理解 GitHub 术语，也不要一次给出太多操作。

## 项目位置

项目目录：

`C:\Users\winni\Documents\Codex\2026-09-29\v1-list-calculus-exercises-45m-history`

主要应用文件：

- `index.html`
- `styles.css`
- `src/app.js`
- `src/tasks.js`
- `src/date.js`
- `src/store.js`
- `src/drag-controller.js`
- `src/focus.js`
- `src/fullscreen.js`

测试文件：

- `tests/tasks.test.js`
- `tests/store.test.js`
- `tests/focus.test.js`
- `tests/browser-smoke.mjs`

本地开发服务器：

`node scripts/serve.mjs`

默认地址：

`http://localhost:4173`

当前工作区不是 Git 仓库。这个项目一直没有使用 Git 命令，发布计划是使用 GitHub 网页界面上传文件，然后开启 GitHub Pages。

## 当前完成的功能

这是一个无框架的静态网页应用，使用原生 HTML、CSS 和 ES Modules。数据保存在浏览器 `localStorage` 中，没有后端、账号、数据库或云同步。

已经实现：

1. List 计划本页面。
2. 添加任务，Hours 和 Minutes 独立输入。
3. 任务时长校验，0 时长和负数不允许创建。
4. 完成任务淡出动画。
5. 拖动排序。
6. 长按删除确认。
7. 浏览器本地保存。
8. 昨天未完成任务显示在 `YESTERDAY · UNFINISHED`。
9. 将昨天任务拖入 TODAY。
10. Focus Timer。
11. 真正的浏览器 Fullscreen API。
12. Esc 退出浏览器全屏后 Timer 继续运行。
13. Fullscreen 与 Floating Focus 模式。
14. 提前退出 Focus 的中文确认句验证。
15. Day Complete 页面。
16. Day Complete 完成任务详情展开与收起。
17. Day Complete 庆祝彩带效果。
18. 桌面和手机响应式布局。

## 重要设计约束

继续开发时请保持以下约束：

- 高级、极简、安静的设计语言。
- 不要重新设计已经稳定的 List 页面。
- 不要随意修改任务排序逻辑。
- 不要破坏完成任务淡出动画。
- 不要修改 localStorage 中已有任务数据格式，除非用户明确要求。
- 不要添加用户没有要求的新功能。
- 保持 Focus 逻辑独立，不要全部塞回主页组件。
- 用户使用中文沟通。
- 用户正在学习 Codex 和 GitHub，需要一步一步指导。
- 用户不希望每次看到大量技术细节或一次收到过多操作步骤。

当前任务数据结构字段：

- `id`
- `name`
- `estimatedHours`
- `estimatedMinutes`
- `date`
- `completed`
- `createdAt`
- `completedAt`
- `carriedAt`

localStorage 主键：

`daybook.list.v1`

状态中另有：

- `focusTimer`

`focusTimer` 字段：

- `taskId`
- `startedAt`
- `plannedSeconds`
- `status`
- `mode`

## 测试状态

纯逻辑测试命令：

`node --test tests/*.test.js`

当前逻辑测试数量：16

浏览器完整测试命令：

`node tests/browser-smoke.mjs 4181`

浏览器测试会使用独立端口，不会影响正在运行的 `4173` 预览。

浏览器测试覆盖：

- 添加任务
- 时长校验
- 拖动排序
- 刷新持久化
- 长按删除
- 昨日任务与跨日逻辑
- Timer 恢复
- 真正 Fullscreen
- Esc 后 Timer 继续
- 提前退出确认
- Day Complete
- 详情展开与收起
- 两个 Day Complete 按钮
- 手机宽度无横向溢出

最近一次测试结果：16 项逻辑测试通过，完整浏览器测试通过。

## 发布包

已经准备了只包含发布文件的干净目录：

`C:\Users\winni\Documents\Codex\2026-09-29\v1-list-calculus-exercises-45m-history\outputs\planner-site`

其中包含：

- `index.html`
- `styles.css`
- `src/`

同时准备了 ZIP：

`C:\Users\winni\Documents\Codex\2026-09-29\v1-list-calculus-exercises-45m-history\outputs\planner-site.zip`

注意：

- GitHub Pages 发布时不要上传 ZIP 后就结束，GitHub 不会自动解压。
- GitHub 仓库根目录必须直接看到 `index.html`。
- 不要上传 `planner-site` 外层文件夹本身，应该上传它的内容。
- 当前浏览器已打开：

`file:///C:/Users/winni/Documents/Codex/2026-09-29/v1-list-calculus-exercises-45m-history/outputs/planner-site/index.html`

直接用 `file://` 打开时，ES Modules 可能受到浏览器安全限制，推荐使用本地服务器或正式发布的 HTTPS 网址。

## GitHub Pages 发布进度

用户计划发布到 GitHub Pages。

已知信息：

- 用户已经表示仓库似乎是存在的。
- 用户被引导创建名为 `daybook-planner` 的公开仓库。
- 用户随后表示只看到 `Set up GitHub Copilot`。
- 尚未确认用户是否真正进入仓库页面。
- 尚未确认网页文件是否上传成功。
- 尚未确认 GitHub Pages 是否开启。
- 尚无最终可分享的 GitHub Pages 网址。

最终网址格式预计为：

`https://用户的GitHub用户名.github.io/daybook-planner/`

## 下一步应该怎么带用户

不要重新讲一遍 GitHub 注册流程。先确认当前状态。

第一步：

- 让用户点击 GitHub 右上角头像。
- 点击 `Your repositories`。
- 点击 `daybook-planner`。
- 让用户查看地址栏，正确地址应类似：

`https://github.com/用户名/daybook-planner`

如果用户仍在 `https://github.com/`，说明还没有进入仓库。

第二步：

进入仓库后，确认根目录是否有这些文件和文件夹：

- `index.html`
- `styles.css`
- `src`

如果没有，上传：

1. 点击 `Add file`
2. 点击 `Upload files`
3. 打开上面的 `outputs\planner-site` 文件夹
4. 拖动 `index.html`
5. 拖动 `styles.css`
6. 拖动整个 `src` 文件夹
7. 点击 `Commit changes`

第三步：

进入 `Settings` → `Pages`：

- `Source` 选择 `Deploy from a branch`
- 分支选择 `main`
- 文件夹选择 `/ (root)`
- 点击 `Save`

第四步：

等待 1 到 3 分钟，在 `Settings` → `Pages` 页面取得网址。

第五步：

让用户用电脑和手机分别打开网址确认。

## 和用户沟通时的建议

- 一次只让用户做一个动作。
- 每一步都告诉用户应该看到什么。
- 如果用户说“只有某个按钮”，先确认用户所在页面的完整网址。
- 不要责怪用户点错。
- 不要一次贴很长教程。
- 如果用户发截图，根据截图直接指出下一步要点的位置。
- 如果用户问“然后呢”，只回答紧接着的一步。

## 发布后的后续工作

GitHub Pages 发布成功后，可以再讨论：

- 如何更新 GitHub 仓库文件。
- 如何使用 GitHub Desktop，而不是网页拖拽。
- 如何自定义网址名称。
- 后续功能开发。

在用户明确要求前，不要开始新的功能开发。
