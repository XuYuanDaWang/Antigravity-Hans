import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const source = fs.readFileSync(new URL('../antigravity-hans-overlay.js', import.meta.url), 'utf8');
const context = { window: { addEventListener() {}, removeEventListener() {}, location: { pathname: '/', href: 'http://127.0.0.1/' } }, document: { readyState: 'loading' } };
vm.createContext(context);
vm.runInContext(source.replace('  function run() {', '  globalThis.translateForTest = translate; globalThis.translateElementForTest = translateElement; globalThis.translateNodeForTest = translateNode;\n  function run() {'), context);
const translate = context.translateForTest;

test('updated overlays replace their observer and use the requested fingerprint', () => {
  const fresh = { window: { addEventListener() {}, removeEventListener() {} }, document: { readyState: 'loading' } };
  vm.createContext(fresh);
  fresh.window.__antigravityZhPatchRequestedFingerprint = 'first';
  vm.runInContext(source, fresh);
  const previousCleanup = fresh.window.__antigravityZhPatchCleanup;
  fresh.window.__antigravityZhPatchRequestedFingerprint = 'second';
  vm.runInContext(source, fresh);
  assert.equal(fresh.window.__antigravityZhPatchFingerprint, 'second');
  assert.notEqual(fresh.window.__antigravityZhPatchCleanup, previousCleanup);
  const currentCleanup = fresh.window.__antigravityZhPatchCleanup;
  vm.runInContext(source, fresh);
  assert.equal(fresh.window.__antigravityZhPatchCleanup, currentCleanup, 'same version installed a duplicate observer');
});

test('permission targets survive both initial translation and observer reprocessing', () => {
  const targets = ['/workspace/10 files/30 minutes.txt', "rm -rf '/tmp/10 files'", 'https://example.test/10 files?q=30 minutes', "printf '$& $$ $` $\u0027'", "tool('10 files')\nnext command", '复制中文和10 files', 'Last 7 days', 'Last 7 天'];
  for (const target of targets) {
    const inputs = [
      `Requesting permission to running this command outside the sandbox ${target}`,
      `Requesting permission to read access to this path ${target}`,
      `Requesting permission to using this MCP tool ${target}`,
      `Requesting permission to run (unsandboxed) ${target}`,
      `Requesting permission to read ${target}`,
      `Agent needs permission to execute JavaScript on ${target}`,
      `Agent needs permission to act on ${target}`,
      `Yes, save rule for '${target}' in this conversation`,
      `Yes, save rule for '${target}' in this project`,
      `Yes, and always allow '${target}' in this conversation`,
      `Yes, and always allow '${target}' in this workspace`,
      `Conflicts with your configured Ask permission: ${target}`,
      `Requires manual confirmation: ${target}`,
      `Allow ${target}`,
    ];
    for (const input of inputs) {
      const result = translate(input);
      assert.ok(result.includes(target), `${input} -> ${result}`);
      assert.equal(translate(result), result, 'observer reprocessing changed an authorization target');
      assert.ok(!result.includes('在在'), 'scope prefix duplicated');
    }
  }
  assert.equal(translate('Requesting permission to running this command outside the sandbox echo ok'), '正在请求权限：在沙盒外运行此命令 echo ok');
  const unknown = 'Requesting permission to unknown new action /10 files';
  assert.equal(translate(unknown), unknown);
});

test('2.23.0 normal app controls and safety policies are localized', () => {
  for (const [input, expected] of [
    ['Code Search', '代码搜索'], ['Add to Chat', '添加到对话'], ['Chief of Staff', '统筹助手'],
    ['Manage Hooks', '管理钩子'], ['Sandbox Allow Network', '允许沙盒访问网络'],
    ['Agent always asks for review.', '智能体始终请求审核。'], ['Reject Step', '拒绝此步骤'],
    ['New Window', '新建窗口'], ['Select branch', '选择分支'],
    ['Vetted (Preview)', '安全审核（预览）'], ['Automatic Check for Updates', '自动检查更新'],
    ['Browser Actuation Permissions', '浏览器操作权限'], ['Terms of Service & Data Use', '服务条款与数据使用'],
    ['Allow read access to this path?', '允许读取此路径？'], ['Save rule to always allow running this command?', '保存规则以始终允许运行此命令？'],
    ['Explored, ran command', '已探索，已运行命令'], ['Explored, edited files', '已探索，已编辑文件'],
    ['Worked for 1h 20m', '已工作 1 小时 20 分钟'], ['Stopped after 45s', '工作 45 秒后停止'],
    ['Thinking for 3s', '已思考 3 秒'], ['3 files changed', '3 个文件已更改'],
  ]) assert.equal(translate(input), expected);
});

test('2.26.0 normal app settings and popovers are localized', () => {
  for (const [input, expected] of [
    ['Give Feedback', '提供反馈'],
    ['Open Editor Settings', '打开编辑器设置'],
    ['Inherit Global', '继承全局设置'],
    ['Strong', '严格'],
    ['Volume', '音量'],
    ['Notice', '提示'],
    ['Unavailable', '不可用'],
    ['View Usage', '查看用量'],
    ['View plans', '查看套餐'],
    ['Use Global Settings', '使用全局设置'],
    ['Search Projects', '搜索项目'],
    ['Other Customizations', '其他自定义项'],
    ['tokens (', 'Token ('],
    ['Inherits your Global Permissions when working in these conversations.', '在这些对话中工作时继承您的全局权限。'],
    ['Select project, current: No Project', '选择项目，当前：无项目'],
    ['Agent permissions preset selector, current: Default', '智能体权限预设选择器，当前：默认'],
    ['Select model, current: Gemini 3.8 Flash High', '选择模型，当前：Gemini 3.8 Flash 高'],
    ['Rules: 540 tokens', '规则：540 个 Token'],
    ['Skills: 170 tokens', '技能：170 个 Token'],
    ['Delete plugin', '删除插件'],
    ['Toggle Android CLI', '切换 Android CLI'],
    ['Windows Subsystem for Linux', '适用于 Linux 的 Windows 子系统'],
    ['5mo', '5 个月前'],
    ['See 6 more', '查看其余 6 个'],
    ['Install Google Docs', '安装 Google Docs'],
    ['More actions for Android CLI', 'Android CLI 的更多操作'],
  ]) assert.equal(translate(input), expected);
});

test('WSL provisioning translates status while preserving the distro name', () => {
  const name = 'Ubuntu 10 files';
  for (const input of [`Setting up WSL: ${name}`, `Installing into ${name}…`]) {
    const output = translate(input);
    assert.ok(output.includes(name));
    assert.equal(translate(output), output);
  }
  assert.equal(translate('Downloading the Antigravity binary…'), '正在下载 Antigravity 程序…');
});

test('recent-day filters translate fully and repair partially translated labels', () => {
  for (const input of ['Last 7 days', 'Last 7 天', 'Last 1 day', 'Last 30 days', ' Last 30 天 ']) {
    const count = input.match(/\d+/)[0];
    const expected = input.replace(input.trim(), `最近 ${count} 天`);
    const output = translate(input);
    assert.equal(output, expected);
    assert.equal(translate(output), output, 'observer reprocessing changed a translated time filter');
  }
  assert.equal(translate('Last Updated'), '最近更新');
  assert.equal(translate('Last Prompt'), '上次提示词');
});

test('attribute mutations inside skipped code/user content are not translated', () => {
  context.Node = { ELEMENT_NODE: 1, TEXT_NODE: 3 };
  let altered = false;
  const element = { nodeType: 1, closest(selector) { return selector.includes('script, style') ? this : null; }, getAttribute() { return 'Code Search'; }, setAttribute() { altered = true; } };
  context.translateElementForTest(element);
  assert.equal(altered, false);

  const attrs = new Map([['placeholder', '(tell the agent what to do instead)'], ['aria-label', 'Edit permission target']]);
  const textarea = {
    nodeType: 1,
    parentElement: { closest() { return null; } },
    closest() { return null; },
    getAttribute(name) { return attrs.get(name); },
    setAttribute(name, val) { attrs.set(name, val); },
  };
  context.translateElementForTest(textarea);
  assert.equal(attrs.get('placeholder'), '（告诉智能体改做什么）');
  assert.equal(attrs.get('aria-label'), '编辑权限目标');
});

test('split Also includes prompt is reordered while keeping links', () => {
  context.Node = { ELEMENT_NODE: 1, TEXT_NODE: 3 };
  const textA = { nodeType: 3, nodeValue: 'Also includes ' };
  const link = { nodeType: 1 };
  const textB = { nodeType: 3, nodeValue: ' ' };
  const textC = { nodeType: 3, nodeValue: 'when working ' };
  const textD = { nodeType: 3, nodeValue: 'in these conversations' };
  const textE = { nodeType: 3, nodeValue: '.' };
  const element = {
    nodeType: 1,
    textContent: 'Also includes Global Permissions when working in these conversations. Learn more.',
    childNodes: [textA, link, textB, textC, textD, textE],
    closest() { return null; },
    getAttribute() { return null; },
    setAttribute() {},
  };
  context.translateElementForTest(element);
  assert.equal(textA.nodeValue, '在这些对话中工作时，还包括');
  assert.equal(textC.nodeValue, '');
  assert.equal(textD.nodeValue, '');
  assert.equal(textE.nodeValue, '。');
});

test('lint catches untranslated words and permission polarity reversals', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'agy-lexicon-test-'));
  try {
    const file = path.join(dir, 'fixture.js');
    fs.writeFileSync(file, "const phrases = new Map([\n    ['Test label', 'untranslated'],\n  ]);\n");
    const result = spawnSync(process.execPath, [fileURLToPath(new URL('./lint-overlay.mjs', import.meta.url)), file], { encoding: 'utf8' });
    assert.equal(result.status, 0);
    assert.match(result.stdout, /译文残留英文 untranslated/);
    fs.writeFileSync(file, "const phrases = new Map([\n    ['Short', '短'],\n    ['Longer label', '更长的标签'],\n  ]);\n");
    const unsorted = spawnSync(process.execPath, [fileURLToPath(new URL('./lint-overlay.mjs', import.meta.url)), file], { encoding: 'utf8' });
    assert.equal(unsorted.status, 1);
    assert.match(unsorted.stdout, /未按源文长度倒序/);
    fs.writeFileSync(file, "const phrases = new Map([\n    ['Deny', '允许'],\n  ]);\n");
    const denied = spawnSync(process.execPath, [fileURLToPath(new URL('./lint-overlay.mjs', import.meta.url)), file], { encoding: 'utf8' });
    assert.equal(denied.status, 1);
    assert.match(denied.stdout, /语义反转/);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('issue 12 remaining settings labels and descriptions are localized', () => {
  for (const [input, expected] of [
    ['Manage project folders, agent settings, and permissions.', '管理项目文件夹、智能体设置和权限。'],
    ['Danger Zone', '危险操作'],
    ['Gemini 4 Argon Weekly Limit', 'Gemini 4 Argon 周额度'],
    ['Check availability, schedule events, and RSVP.', '查看空闲时间、安排活动并回复活动邀请。'],
    ['Read, draft, and edit docs.', '阅读、起草和编辑文档。'],
    ['Search, upload, download, and share files.', '搜索、上传、下载和共享文件。'],
    ['Read, write, and format spreadsheets.', '读取、写入电子表格并设置格式。'],
    ['Read, edit, and export presentations.', '阅读、编辑和导出演示文稿。'],
  ]) {
    assert.equal(translate(input), expected);
    assert.equal(translate(expected), expected);
  }
  for (const name of ['Google Calendar', 'Google Docs', 'Google Drive', 'Google Sheets', 'Google Slides', 'Gemini 4 Argon']) {
    assert.equal(translate(name), name);
  }
  assert.equal(translate('Gemini 99 Future Weekly Limit'), 'Gemini 99 Future Weekly Limit');
});

test('project deletion preserves arbitrary names and counts through repeated passes', () => {
  for (const name of ['明明研究中心', 'Last 7 days', '10 files', 'Inherit Global', 'Danger Zone', "a $& $$ $` $'", 'a including 2 active conversations.', 'a\nb', 'a“b”']) {
    for (const [count, noun] of [['0', 'conversations'], ['1', 'conversation'], ['3', 'conversations'], ['1000', 'conversations']]) {
      const input = ` Permanently delete ${name} including ${count} active ${noun}. `;
      const output = ` 永久删除项目“${name}”及其中的 ${count} 个活跃对话。 `;
      assert.equal(translate(input), output);
      assert.equal(translate(output), output);
    }
  }
  assert.equal(translate('Permanently delete Example including unknown active conversations.'), 'Permanently delete Example including unknown active conversations.');
});

function projectPermissionFixture(parts, label = 'Global Permissions', skipped = false) {
  context.Node = { ELEMENT_NODE: 1, TEXT_NODE: 3 };
  const link = { nodeType: 1, textContent: label, href: '/settings/permissions', onclick() {} };
  const more = { nodeType: 1, textContent: ' Learn more.', href: '/docs/permissions' };
  const nodes = parts.map(value => value === null ? link : { nodeType: 3, nodeValue: value });
  nodes.push(more);
  return {
    nodeType: 1, childNodes: nodes, link, more,
    get textContent() { return nodes.map(n => n.nodeType === 3 ? n.nodeValue : n.textContent).join(''); },
    closest(selector) { return skipped && selector.includes('script, style') ? this : null; },
    getAttribute() { return null; }, setAttribute() {},
  };
}

test('project permissions preserve link identity, destinations and handlers', () => {
  for (const label of ['Global Permissions', '全局权限']) {
    for (const parts of [
      ['Also includes ', null, ' when working in this project.'],
      ['Also includes ', null, ' ', 'when working ', 'in this project', '.'],
    ]) {
      const el = projectPermissionFixture(parts, label);
      const originalNodes = [...el.childNodes];
      const handler = el.link.onclick;
      context.translateElementForTest(el);
      assert.equal(el.textContent, `在此项目中工作时，还包括${label}。 Learn more.`);
      assert.deepEqual(el.childNodes, originalNodes);
      assert.equal(el.link.onclick, handler);
      assert.equal(el.link.href, '/settings/permissions');
      assert.equal(el.more.href, '/docs/permissions');
      context.translateElementForTest(el);
      assert.equal(el.textContent, `在此项目中工作时，还包括${label}。 Learn more.`);
    }
  }
});

test('unknown project permission layouts and skipped content remain untouched', () => {
  for (const el of [
    projectPermissionFixture(['Also includes ', null, ' when working in this workspace.']),
    projectPermissionFixture(['Also includes ', null, ' when working in this project.'], 'Custom Permissions'),
    projectPermissionFixture(['Also includes ', null, ' when working in this project.'], 'Global Permissions', true),
  ]) {
    const original = el.textContent;
    context.translateElementForTest(el);
    assert.equal(el.textContent, original);
  }
  for (const selectorFragment of ['script, style', 'contenteditable', 'user-input-step']) {
    const text = { nodeType: 3, nodeValue: 'Danger Zone', parentElement: {
      closest(selector) { return selector.includes(selectorFragment) ? this : null; },
    } };
    context.translateNodeForTest(text);
    assert.equal(text.nodeValue, 'Danger Zone');
    assert.equal(text.__zh_patched, undefined);
  }
});
