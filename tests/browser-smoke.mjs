import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { getDateKey } from "../src/date.js";

const projectRoot = fileURLToPath(new URL("..", import.meta.url));
const chromePath = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const port = Number(process.argv[2] || process.env.TEST_PORT || 4173);
const baseUrl = `http://localhost:${port}`;
const screenshotDirectory = join(projectRoot, "work", "screenshots");

class CdpConnection {
  constructor(process) {
    this.process = process;
    this.input = process.stdio[3];
    this.output = process.stdio[4];
    this.nextId = 1;
    this.pending = new Map();
    this.listeners = new Map();
    this.buffer = "";

    this.output.on("data", (chunk) => this.handleData(chunk));
    process.on("exit", (code) => {
      for (const { reject } of this.pending.values()) {
        reject(new Error(`Chrome exited with code ${code}`));
      }
      this.pending.clear();
    });
  }

  handleData(chunk) {
    this.buffer += chunk.toString("utf8");
    let boundary = this.buffer.indexOf("\0");

    while (boundary !== -1) {
      const messageText = this.buffer.slice(0, boundary);
      this.buffer = this.buffer.slice(boundary + 1);

      if (messageText) {
        this.handleMessage(JSON.parse(messageText));
      }

      boundary = this.buffer.indexOf("\0");
    }
  }

  handleMessage(message) {
    if (message.id) {
      const pending = this.pending.get(message.id);

      if (!pending) {
        return;
      }

      this.pending.delete(message.id);

      if (message.error) {
        pending.reject(new Error(`${message.error.message}: ${JSON.stringify(message.error.data)}`));
      } else {
        pending.resolve(message.result);
      }
      return;
    }

    const listeners = this.listeners.get(message.method) || [];

    for (const listener of listeners) {
      listener(message);
    }
  }

  send(method, params = {}, sessionId) {
    const id = this.nextId++;
    const message = { id, method, params };

    if (sessionId) {
      message.sessionId = sessionId;
    }

    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.input.write(`${JSON.stringify(message)}\0`);
    });
  }

  on(method, listener) {
    const listeners = this.listeners.get(method) || [];
    listeners.push(listener);
    this.listeners.set(method, listeners);
  }

  waitFor(method, sessionId, timeoutMs = 10_000) {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error(`Timed out waiting for ${method}`));
      }, timeoutMs);

      const listener = (message) => {
        if (sessionId && message.sessionId !== sessionId) {
          return;
        }

        clearTimeout(timeout);
        const listeners = this.listeners.get(method) || [];
        this.listeners.set(
          method,
          listeners.filter((candidate) => candidate !== listener),
        );
        resolve(message.params);
      };

      this.on(method, listener);
    });
  }
}

function wait(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function waitForServer() {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    try {
      const response = await fetch(baseUrl);

      if (response.ok) {
        return;
      }
    } catch {
      // The server is still starting.
    }

    await wait(100);
  }

  throw new Error("Static server did not start.");
}

async function waitForValue(evaluate, expression, timeoutMs = 5000) {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    if (await evaluate(expression)) {
      return;
    }

    await wait(50);
  }

  throw new Error(`Timed out waiting for: ${expression}`);
}

async function main() {
  mkdirSync(screenshotDirectory, { recursive: true });

  const server = spawn(process.execPath, ["scripts/serve.mjs"], {
    cwd: projectRoot,
    env: { ...process.env, PORT: String(port) },
    stdio: ["ignore", "pipe", "pipe"],
  });

  let chrome;

  try {
    await waitForServer();
    const profilePath = join(projectRoot, "work", "chrome-profile-browser-test");
    chrome = spawn(
      chromePath,
      [
        "--headless=new",
        "--no-sandbox",
        "--disable-gpu",
        "--in-process-gpu",
        "--disable-software-rasterizer",
        "--disable-dev-shm-usage",
        "--no-first-run",
        "--no-default-browser-check",
        "--remote-debugging-pipe",
        `--user-data-dir=${profilePath}`,
        "about:blank",
      ],
      { stdio: ["ignore", "ignore", "pipe", "pipe", "pipe"] },
    );

    const cdp = new CdpConnection(chrome);
    const runtimeExceptions = [];
    cdp.on("Runtime.exceptionThrown", (message) => {
      runtimeExceptions.push(message.params.exceptionDetails.text);
    });

    const { targetId } = await cdp.send("Target.createTarget", { url: "about:blank" });
    const { sessionId } = await cdp.send("Target.attachToTarget", { targetId, flatten: true });
    await cdp.send("Runtime.enable", {}, sessionId);
    await cdp.send("Page.enable", {}, sessionId);
    await cdp.send(
      "Emulation.setDeviceMetricsOverride",
      {
        width: 1280,
        height: 900,
        deviceScaleFactor: 1,
        mobile: false,
      },
      sessionId,
    );

    async function evaluate(expression, options = {}) {
      const response = await cdp.send(
        "Runtime.evaluate",
        {
          expression,
          awaitPromise: true,
          userGesture: Boolean(options.userGesture),
          returnByValue: true,
        },
        sessionId,
      );

      if (response.exceptionDetails) {
        throw new Error(response.exceptionDetails.exception?.description || response.exceptionDetails.text);
      }

      return response.result.value;
    }

    async function navigate() {
      const loaded = cdp.waitFor("Page.loadEventFired", sessionId);
      await cdp.send("Page.navigate", { url: baseUrl }, sessionId);
      await loaded;
      await waitForValue(evaluate, "document.querySelector('#current-date')?.textContent !== 'Loading date'");
    }

    async function setFormValue(selector, value) {
      await evaluate(`
        (() => {
          const input = document.querySelector(${JSON.stringify(selector)});
          input.value = ${JSON.stringify(value)};
          input.dispatchEvent(new Event("input", { bubbles: true }));
        })()
      `);
    }

    async function addTask(name, hours, minutes) {
      await evaluate("document.querySelector('#open-add-form').click()");
      await setFormValue("#task-name", name);
      await setFormValue("#task-hours", hours);
      await setFormValue("#task-minutes", minutes);
      await evaluate("document.querySelector('#add-task-form').requestSubmit()");
      await waitForValue(
        evaluate,
        `[...document.querySelectorAll('#today-list .task-name')].some((node) => node.textContent === ${JSON.stringify(name)})`,
      );
    }

    async function taskOrder() {
      return evaluate(
        `[...document.querySelectorAll('#today-list .task-name')].map((node) => node.textContent)`,
      );
    }

    async function dragTask(taskName, targetTaskName, position = "before") {
      const coordinates = await evaluate(`
        (() => {
          const sourceName = [...document.querySelectorAll('.task-name')].find(
            (node) => node.textContent === ${JSON.stringify(taskName)}
          );
          const targetName = [...document.querySelectorAll('.task-name')].find(
            (node) => node.textContent === ${JSON.stringify(targetTaskName)}
          );
          const sourceHandle = sourceName.closest('[data-task-id]').querySelector('[data-drag-handle]');
          const sourceRect = sourceHandle.getBoundingClientRect();
          const targetRect = targetName.closest('[data-task-id]').getBoundingClientRect();
          return {
            sourceX: sourceRect.left + sourceRect.width / 2,
            sourceY: sourceRect.top + sourceRect.height / 2,
            targetX: targetRect.left + 120,
            targetY: ${position === "after" ? "targetRect.bottom - 5" : "targetRect.top + 5"},
          };
        })()
      `);

      await cdp.send(
        "Input.dispatchMouseEvent",
        {
          type: "mousePressed",
          x: coordinates.sourceX,
          y: coordinates.sourceY,
          button: "left",
          buttons: 1,
          clickCount: 1,
        },
        sessionId,
      );
      await cdp.send(
        "Input.dispatchMouseEvent",
        {
          type: "mouseMoved",
          x: coordinates.sourceX + 12,
          y: coordinates.sourceY + 12,
          button: "left",
          buttons: 1,
        },
        sessionId,
      );
      await cdp.send(
        "Input.dispatchMouseEvent",
        {
          type: "mouseMoved",
          x: coordinates.targetX,
          y: coordinates.targetY,
          button: "left",
          buttons: 1,
        },
        sessionId,
      );
      await wait(120);
      await cdp.send(
        "Input.dispatchMouseEvent",
        {
          type: "mouseReleased",
          x: coordinates.targetX,
          y: coordinates.targetY,
          button: "left",
          buttons: 0,
          clickCount: 1,
        },
        sessionId,
      );
      await wait(180);
    }

    await navigate();
    await evaluate("localStorage.clear()");
    await navigate();

    assert.match(await evaluate("document.querySelector('#current-date').textContent"), /Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday/);
    assert.equal(await evaluate("document.querySelector('#empty-state').hidden"), false);
    assert.equal(await evaluate("document.querySelector('#start-focus').disabled"), true);

    await addTask("Focus test", "", "1");
    await evaluate("document.querySelector('#start-focus').click()", { userGesture: true });
    await waitForValue(evaluate, "document.querySelector('#focus-view').hidden === false");
    await waitForValue(
      evaluate,
      "document.fullscreenElement?.id === 'focus-view'",
      3000,
    );
    assert.equal(await evaluate("document.querySelector('#focus-task-name').textContent"), "Focus test");
    assert.equal(await evaluate("document.querySelector('#focus-time').textContent"), "01:00");
    assert.equal(await evaluate("document.querySelector('#focus-view').dataset.mode"), "fullscreen");

    const fullscreenFocusScreenshot = await cdp.send(
      "Page.captureScreenshot",
      { format: "png", captureBeyondViewport: false },
      sessionId,
    );
    writeFileSync(
      join(screenshotDirectory, "planner-focus-fullscreen.png"),
      fullscreenFocusScreenshot.data,
      "base64",
    );

    await cdp.send(
      "Input.dispatchKeyEvent",
      {
        type: "keyDown",
        key: "Escape",
        code: "Escape",
        windowsVirtualKeyCode: 27,
        nativeVirtualKeyCode: 27,
      },
      sessionId,
    );
    await cdp.send(
      "Input.dispatchKeyEvent",
      {
        type: "keyUp",
        key: "Escape",
        code: "Escape",
        windowsVirtualKeyCode: 27,
        nativeVirtualKeyCode: 27,
      },
      sessionId,
    );
    await waitForValue(evaluate, "document.fullscreenElement === null");
    assert.equal(await evaluate("document.querySelector('#focus-view').hidden"), false);
    assert.equal(
      await evaluate("JSON.parse(localStorage.getItem('daybook.list.v1')).focusTimer.status"),
      "running",
    );
    assert.equal(
      await evaluate(`
        JSON.parse(localStorage.getItem("daybook.list.v1")).tasks.find(
          (task) => task.name === "Focus test"
        ).completed
      `),
      false,
    );
    const timeBeforeEscapeWait = await evaluate("document.querySelector('#focus-time').textContent");
    await wait(1100);
    const timeAfterEscapeWait = await evaluate("document.querySelector('#focus-time').textContent");
    assert.notEqual(timeAfterEscapeWait, timeBeforeEscapeWait);

    await evaluate("document.querySelector('#focus-mode-toggle').click()", {
      userGesture: true,
    });
    await waitForValue(
      evaluate,
      "document.fullscreenElement?.id === 'focus-view'",
      3000,
    );

    await evaluate("document.querySelector('#focus-mode-toggle').click()", {
      userGesture: true,
    });
    assert.equal(await evaluate("document.querySelector('#focus-view').dataset.mode"), "floating");
    await waitForValue(evaluate, "document.fullscreenElement === null");
    assert.equal(
      await evaluate("JSON.parse(localStorage.getItem('daybook.list.v1')).focusTimer.mode"),
      "floating",
    );
    const floatingFocusScreenshot = await cdp.send(
      "Page.captureScreenshot",
      { format: "png", captureBeyondViewport: false },
      sessionId,
    );
    writeFileSync(
      join(screenshotDirectory, "planner-focus-floating.png"),
      floatingFocusScreenshot.data,
      "base64",
    );
    await evaluate("document.querySelector('#focus-mode-toggle').click()", {
      userGesture: true,
    });
    assert.equal(await evaluate("document.querySelector('#focus-view').dataset.mode"), "fullscreen");
    await waitForValue(
      evaluate,
      "document.fullscreenElement?.id === 'focus-view'",
      3000,
    );

    await evaluate("document.querySelector('#focus-exit').click()");
    assert.equal(await evaluate("document.querySelector('#focus-exit-confirmation').hidden"), false);
    await setFormValue("#focus-exit-input", "Wrong input");
    await evaluate("document.querySelector('#focus-exit-form').requestSubmit()");
    assert.equal(await evaluate("document.querySelector('#focus-exit-error').textContent"), "The sentence does not match.");
    assert.equal(await evaluate("document.querySelector('#focus-view').hidden"), false);
    assert.equal(
      await evaluate("JSON.parse(localStorage.getItem('daybook.list.v1')).focusTimer.status"),
      "running",
    );
    assert.equal(
      await evaluate(`
        JSON.parse(localStorage.getItem("daybook.list.v1")).tasks.find(
          (task) => task.name === "Focus test"
        ).completed
      `),
      false,
    );
    const exitConfirmationScreenshot = await cdp.send(
      "Page.captureScreenshot",
      { format: "png", captureBeyondViewport: false },
      sessionId,
    );
    writeFileSync(
      join(screenshotDirectory, "planner-focus-exit-confirmation.png"),
      exitConfirmationScreenshot.data,
      "base64",
    );

    await setFormValue("#focus-exit-input", "我确认这是我的主动选择，我接受提前结束本次专注。");
    assert.equal(await evaluate("document.querySelector('#focus-exit-confirm').disabled"), false);
    await evaluate("document.querySelector('#focus-exit-form').requestSubmit()");
    await waitForValue(evaluate, "document.querySelector('#focus-view').hidden === true");
    assert.equal(
      await evaluate(`
        [...document.querySelectorAll('#today-list .task-name')]
          .find((node) => node.textContent === "Focus test")
          .closest('[data-task-id]')
          .classList.contains('is-completing')
      `),
      true,
    );
    assert.equal(
      await evaluate(`
        JSON.parse(localStorage.getItem("daybook.list.v1")).tasks.find(
          (task) => task.name === "Focus test"
        ).completed
      `),
      true,
    );
    assert.equal(
      await evaluate("JSON.parse(localStorage.getItem('daybook.list.v1')).focusTimer"),
      null,
    );
    await waitForValue(
      evaluate,
      "![...document.querySelectorAll('#today-list .task-name')].some((node) => node.textContent === 'Focus test')",
      1500,
    );
    assert.equal(await evaluate("document.querySelector('#start-focus').disabled"), true);
    await waitForValue(evaluate, "document.querySelector('#day-complete').hidden === false");
    assert.equal(
      await evaluate("document.querySelector('#day-complete-count').textContent"),
      "1 task completed",
    );
    assert.equal(
      await evaluate("document.querySelector('#day-complete-focused').textContent"),
      "Focused for 1m",
    );
    assert.equal(
      await evaluate("document.querySelector('#day-complete-details').getAttribute('aria-hidden')"),
      "true",
    );
    await wait(1300);
    const dayCompleteScreenshot = await cdp.send(
      "Page.captureScreenshot",
      { format: "png", captureBeyondViewport: false },
      sessionId,
    );
    writeFileSync(
      join(screenshotDirectory, "planner-day-complete.png"),
      dayCompleteScreenshot.data,
      "base64",
    );
    await evaluate("document.querySelector('#day-complete-toggle').click()");
    assert.equal(
      await evaluate("document.querySelector('#day-complete-details').classList.contains('is-open')"),
      true,
    );
    assert.deepEqual(
      await evaluate(
        "[...document.querySelectorAll('#day-complete-list .day-complete-list-name')].map((node) => node.textContent)",
      ),
      ["Focus test"],
    );
    await wait(450);
    const dayCompleteExpandedScreenshot = await cdp.send(
      "Page.captureScreenshot",
      { format: "png", captureBeyondViewport: false },
      sessionId,
    );
    writeFileSync(
      join(screenshotDirectory, "planner-day-complete-expanded.png"),
      dayCompleteExpandedScreenshot.data,
      "base64",
    );
    await evaluate("document.querySelector('#day-complete-toggle').click()");
    assert.equal(
      await evaluate("document.querySelector('#day-complete-details').classList.contains('is-open')"),
      false,
    );
    await evaluate("document.querySelector('#day-complete-moment').click()");
    assert.equal(await evaluate("document.querySelector('#day-complete').hidden"), true);

    await addTask("Timer recovery", "", "1");
    await evaluate("document.querySelector('#start-focus').click()", { userGesture: true });
    await waitForValue(
      evaluate,
      "document.fullscreenElement?.id === 'focus-view'",
      3000,
    );
    await navigate();
    assert.equal(await evaluate("document.querySelector('#focus-view').hidden"), false);
    assert.equal(await evaluate("document.querySelector('#focus-task-name').textContent"), "Timer recovery");
    assert.match(await evaluate("document.querySelector('#focus-time').textContent"), /^0(0:5[9]|1:00)$/);
    assert.equal(
      await evaluate("JSON.parse(localStorage.getItem('daybook.list.v1')).focusTimer.status"),
      "running",
    );
    await evaluate(`
      (() => {
        const storage = JSON.parse(localStorage.getItem("daybook.list.v1"));
        storage.focusTimer.startedAt = new Date(Date.now() - 65000).toISOString();
        localStorage.setItem("daybook.list.v1", JSON.stringify(storage));
      })()
    `);
    await navigate();
    await waitForValue(evaluate, "document.querySelector('#focus-view').hidden === true");
    assert.equal(
      await evaluate(`
        [...document.querySelectorAll('#today-list .task-name')]
          .find((node) => node.textContent === "Timer recovery")
          .closest('[data-task-id]')
          .classList.contains('is-completing')
      `),
      true,
    );
    assert.equal(
      await evaluate(`
        JSON.parse(localStorage.getItem("daybook.list.v1")).tasks.find(
          (task) => task.name === "Timer recovery"
        ).completed
      `),
      true,
    );
    assert.equal(
      await evaluate("JSON.parse(localStorage.getItem('daybook.list.v1')).focusTimer"),
      null,
    );
    await waitForValue(
      evaluate,
      "![...document.querySelectorAll('#today-list .task-name')].some((node) => node.textContent === 'Timer recovery')",
      1500,
    );
    assert.equal(await evaluate("document.querySelector('#start-focus').disabled"), true);
    await waitForValue(evaluate, "document.querySelector('#day-complete').hidden === false");
    assert.equal(
      await evaluate("document.querySelector('#day-complete-count').textContent"),
      "2 tasks completed",
    );
    await evaluate("document.querySelector('#day-complete-more').click()");
    assert.equal(await evaluate("document.querySelector('#day-complete').hidden"), true);
    assert.equal(await evaluate("document.querySelector('#add-task-form').hidden"), false);
    await evaluate("document.querySelector('#cancel-add-form').click()");

    await navigate();
    await waitForValue(evaluate, "document.querySelector('#day-complete').hidden === false");
    assert.equal(
      await evaluate("document.querySelector('#day-complete-count').textContent"),
      "2 tasks completed",
    );
    assert.equal(
      await evaluate(`
        JSON.parse(localStorage.getItem("daybook.list.v1")).tasks.filter(
          (task) => task.completed
        ).length
      `),
      2,
    );
    await evaluate("document.querySelector('#day-complete-moment').click()");

    await addTask("Calculus exercises", "", "45");
    await addTask("History notes", "", "30");
    await addTask("Coding", "1", "");

    await evaluate("document.querySelector('#open-add-form').click()");
    await setFormValue("#task-name", "Invalid zero");
    await setFormValue("#task-hours", "0");
    await setFormValue("#task-minutes", "0");
    await evaluate("document.querySelector('#add-task-form').requestSubmit()");

    assert.equal(await evaluate("document.querySelector('#form-error').textContent"), "Add at least 1 minute.");
    assert.equal(await evaluate("document.querySelectorAll('#today-list .task-row').length"), 3);

    const formScreenshot = await cdp.send(
      "Page.captureScreenshot",
      { format: "png", captureBeyondViewport: false },
      sessionId,
    );
    writeFileSync(join(screenshotDirectory, "planner-add-form.png"), formScreenshot.data, "base64");
    await evaluate("document.querySelector('#cancel-add-form').click()");

    await addTask("Reading", "", "20");
    assert.deepEqual(await taskOrder(), [
      "Calculus exercises",
      "History notes",
      "Coding",
      "Reading",
    ]);
    assert.deepEqual(
      await evaluate(
        "[...document.querySelectorAll('#today-list .task-duration')].map((node) => node.textContent)",
      ),
      ["45m", "30m", "1h", "20m"],
    );

    await addTask("Temporary task", "", "10");
    await evaluate(`
      [...document.querySelectorAll('#today-list .task-name')]
        .find((node) => node.textContent === "Temporary task")
        .closest('[data-task-id]')
        .querySelector('.task-check')
        .click()
    `);
    await wait(80);
    assert.equal(
      await evaluate(`
        [...document.querySelectorAll('#today-list .task-name')]
          .find((node) => node.textContent === "Temporary task")
          .closest('[data-task-id]')
          .classList.contains('is-completed') &&
        [...document.querySelectorAll('#today-list .task-name')]
          .find((node) => node.textContent === "Temporary task")
          .closest('[data-task-id]')
          .classList.contains('is-completing')
      `),
      true,
    );
    assert.equal(
      await evaluate(`
        JSON.parse(localStorage.getItem("daybook.list.v1")).tasks.find(
          (task) => task.name === "Temporary task"
        ).completed
      `),
      true,
    );
    await waitForValue(
      evaluate,
      "![...document.querySelectorAll('#today-list .task-name')].some((node) => node.textContent === 'Temporary task')",
      1500,
    );
    assert.deepEqual(await taskOrder(), [
      "Calculus exercises",
      "History notes",
      "Coding",
      "Reading",
    ]);

    await navigate();
    assert.equal(
      await evaluate(`
        [...document.querySelectorAll('#today-list .task-name')]
          .some((node) => node.textContent === "Temporary task")
      `),
      false,
    );
    assert.equal(
      await evaluate(`
        JSON.parse(localStorage.getItem("daybook.list.v1")).tasks.find(
          (task) => task.name === "Temporary task"
        ).completed
      `),
      true,
    );

    await dragTask("Coding", "Calculus exercises");
    assert.deepEqual(await taskOrder(), [
      "Coding",
      "Calculus exercises",
      "History notes",
      "Reading",
    ]);

    await navigate();
    assert.deepEqual(await taskOrder(), [
      "Coding",
      "Calculus exercises",
      "History notes",
      "Reading",
    ]);

    const readingCoordinates = await evaluate(`
      (() => {
        const name = [...document.querySelectorAll('.task-name')].find(
          (node) => node.textContent === "Reading"
        );
        const rect = name.getBoundingClientRect();
        return { x: rect.left + 10, y: rect.top + rect.height / 2 };
      })()
    `);

    await cdp.send(
      "Input.dispatchMouseEvent",
      {
        type: "mousePressed",
        x: readingCoordinates.x,
        y: readingCoordinates.y,
        button: "left",
        buttons: 1,
        clickCount: 1,
      },
      sessionId,
    );
    await wait(300);
    await cdp.send(
      "Input.dispatchMouseEvent",
      {
        type: "mouseReleased",
        x: readingCoordinates.x,
        y: readingCoordinates.y,
        button: "left",
        buttons: 0,
        clickCount: 1,
      },
      sessionId,
    );
    await wait(100);
    assert.equal(await evaluate("Boolean(document.querySelector('.task-confirmation'))"), false);

    await cdp.send(
      "Input.dispatchMouseEvent",
      {
        type: "mousePressed",
        x: readingCoordinates.x,
        y: readingCoordinates.y,
        button: "left",
        buttons: 1,
        clickCount: 1,
      },
      sessionId,
    );
    await wait(900);
    await cdp.send(
      "Input.dispatchMouseEvent",
      {
        type: "mouseReleased",
        x: readingCoordinates.x,
        y: readingCoordinates.y,
        button: "left",
        buttons: 0,
        clickCount: 1,
      },
      sessionId,
    );
    await waitForValue(evaluate, "Boolean(document.querySelector('.task-confirmation'))");
    await evaluate("document.querySelector('.confirmation-button.delete').click()");
    await waitForValue(
      evaluate,
      "![...document.querySelectorAll('#today-list .task-name')].some((node) => node.textContent === 'Reading')",
    );

    const yesterdayKey = getDateKey(new Date(Date.now() - 24 * 60 * 60 * 1000));
    await evaluate(`
      (() => {
        const storage = JSON.parse(localStorage.getItem("daybook.list.v1"));
        storage.tasks.find((task) => task.name === "Calculus exercises").date = ${JSON.stringify(yesterdayKey)};
        localStorage.setItem("daybook.list.v1", JSON.stringify(storage));
      })()
    `);
    await navigate();

    assert.equal(await evaluate("document.querySelector('#yesterday-section').hidden"), false);
    assert.deepEqual(
      await evaluate(
        "[...document.querySelectorAll('#yesterday-list .task-name')].map((node) => node.textContent)",
      ),
      ["Calculus exercises"],
    );
    assert.deepEqual(await taskOrder(), ["Coding", "History notes"]);

    await dragTask("Calculus exercises", "History notes");
    assert.deepEqual(await taskOrder(), ["Coding", "Calculus exercises", "History notes"]);
    assert.equal(await evaluate("document.querySelector('#yesterday-section').hidden"), true);

    const carriedTask = await evaluate(`
      JSON.parse(localStorage.getItem("daybook.list.v1")).tasks.find(
        (task) => task.name === "Calculus exercises"
      )
    `);
    assert.equal(carriedTask.date, getDateKey());

    await navigate();
    assert.deepEqual(await taskOrder(), ["Coding", "Calculus exercises", "History notes"]);

    const desktopScreenshot = await cdp.send(
      "Page.captureScreenshot",
      { format: "png", captureBeyondViewport: false },
      sessionId,
    );
    writeFileSync(join(screenshotDirectory, "planner-desktop.png"), desktopScreenshot.data, "base64");

    await cdp.send(
      "Emulation.setDeviceMetricsOverride",
      {
        width: 390,
        height: 844,
        deviceScaleFactor: 1,
        mobile: true,
      },
      sessionId,
    );
    await navigate();
    assert.equal(
      await evaluate("document.documentElement.scrollWidth <= window.innerWidth + 1"),
      true,
    );

    const mobileScreenshot = await cdp.send(
      "Page.captureScreenshot",
      { format: "png", captureBeyondViewport: false },
      sessionId,
    );
    writeFileSync(join(screenshotDirectory, "planner-mobile.png"), mobileScreenshot.data, "base64");

    await evaluate("document.querySelector('#open-add-form').click()");
    await setFormValue("#task-name", "Prepare tomorrow");
    await setFormValue("#task-hours", "1");
    await setFormValue("#task-minutes", "30");
    assert.equal(
      await evaluate("document.documentElement.scrollWidth <= window.innerWidth + 1"),
      true,
    );
    const mobileFormScreenshot = await cdp.send(
      "Page.captureScreenshot",
      { format: "png", captureBeyondViewport: false },
      sessionId,
    );
    writeFileSync(
      join(screenshotDirectory, "planner-mobile-form.png"),
      mobileFormScreenshot.data,
      "base64",
    );
    await evaluate("document.querySelector('#cancel-add-form').click()");
    await cdp.send(
      "Emulation.setTouchEmulationEnabled",
      {
        enabled: true,
        maxTouchPoints: 1,
      },
      sessionId,
    );

    const touchTargets = await evaluate(`
      (() => {
        const getPoint = (name) => {
          const node = [...document.querySelectorAll('.task-name')].find(
            (candidate) => candidate.textContent === name
          );
          const rect = node.closest('[data-task-id]').getBoundingClientRect();
          return { x: rect.left + 40, y: rect.top + rect.height / 2 };
        };
        const history = [...document.querySelectorAll('.task-name')].find(
          (candidate) => candidate.textContent === "History notes"
        );
        const historyRect = history.closest('[data-task-id]').getBoundingClientRect();
        return {
          history: getPoint("History notes"),
          dragTarget: { x: historyRect.left + 100, y: historyRect.bottom - 5 },
        };
      })()
    `);

    await cdp.send(
      "Input.dispatchTouchEvent",
      {
        type: "touchStart",
        touchPoints: [{ ...touchTargets.history, id: 1 }],
      },
      sessionId,
    );
    await wait(900);
    await cdp.send(
      "Input.dispatchTouchEvent",
      {
        type: "touchEnd",
        touchPoints: [],
      },
      sessionId,
    );
    await waitForValue(evaluate, "Boolean(document.querySelector('.task-confirmation'))");
    await evaluate("document.querySelector('.confirmation-button:not(.delete)').click()");

    const touchDrag = await evaluate(`
      (() => {
        const source = [...document.querySelectorAll('.task-name')].find(
          (node) => node.textContent === "Coding"
        ).closest('[data-task-id]').querySelector('[data-drag-handle]');
        const rect = source.getBoundingClientRect();
        return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
      })()
    `);
    await cdp.send(
      "Input.dispatchTouchEvent",
      {
        type: "touchStart",
        touchPoints: [{ ...touchDrag, id: 2 }],
      },
      sessionId,
    );
    await cdp.send(
      "Input.dispatchTouchEvent",
      {
        type: "touchMove",
        touchPoints: [{ x: touchDrag.x + 12, y: touchDrag.y + 12, id: 2 }],
      },
      sessionId,
    );
    await cdp.send(
      "Input.dispatchTouchEvent",
      {
        type: "touchMove",
        touchPoints: [{ ...touchTargets.dragTarget, id: 2 }],
      },
      sessionId,
    );
    await wait(120);
    await cdp.send(
      "Input.dispatchTouchEvent",
      {
        type: "touchEnd",
        touchPoints: [],
      },
      sessionId,
    );
    await wait(180);
    assert.deepEqual(await taskOrder(), ["Calculus exercises", "History notes", "Coding"]);

    await evaluate("document.querySelector('#start-focus').click()");
    await waitForValue(evaluate, "document.querySelector('#focus-view').hidden === false");
    assert.equal(await evaluate("document.querySelector('#focus-view').dataset.mode"), "fullscreen");
    assert.equal(
      await evaluate("document.documentElement.scrollWidth <= window.innerWidth + 1"),
      true,
    );
    const mobileFullscreenFocusScreenshot = await cdp.send(
      "Page.captureScreenshot",
      { format: "png", captureBeyondViewport: false },
      sessionId,
    );
    writeFileSync(
      join(screenshotDirectory, "planner-mobile-focus-fullscreen.png"),
      mobileFullscreenFocusScreenshot.data,
      "base64",
    );
    await evaluate("document.querySelector('#focus-mode-toggle').click()");
    assert.equal(await evaluate("document.querySelector('#focus-view').dataset.mode"), "floating");
    assert.equal(
      await evaluate("document.documentElement.scrollWidth <= window.innerWidth + 1"),
      true,
    );
    const mobileFloatingFocusScreenshot = await cdp.send(
      "Page.captureScreenshot",
      { format: "png", captureBeyondViewport: false },
      sessionId,
    );
    writeFileSync(
      join(screenshotDirectory, "planner-mobile-focus-floating.png"),
      mobileFloatingFocusScreenshot.data,
      "base64",
    );

    assert.deepEqual(runtimeExceptions, []);

    console.log("Browser smoke test passed.");
    console.log("Checked Day Complete, expandable details, both actions, fullscreen recovery, timer persistence, and responsive layout.");
  } finally {
    chrome?.kill();
    server.kill();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
