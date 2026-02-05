import * as vscode from 'vscode';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

const CLAUDE_ICON = '\u2726'; // ✦

interface ModelBreakdown {
  modelName: string;
  inputTokens: number;
  outputTokens: number;
  cacheCreationTokens: number;
  cacheReadTokens: number;
  cost: number;
}

interface DailyUsage {
  date: string;
  inputTokens: number;
  outputTokens: number;
  cacheCreationTokens: number;
  cacheReadTokens: number;
  totalTokens: number;
  totalCost: number;
  modelsUsed: string[];
  modelBreakdowns: ModelBreakdown[];
}

interface MonthlyUsage {
  month: string;
  inputTokens: number;
  outputTokens: number;
  cacheCreationTokens: number;
  cacheReadTokens: number;
  totalTokens: number;
  totalCost: number;
  modelsUsed: string[];
  modelBreakdowns: ModelBreakdown[];
}

interface BlockUsage {
  blockStart: string;
  blockEnd: string;
  inputTokens: number;
  outputTokens: number;
  cacheCreationTokens: number;
  cacheReadTokens: number;
  totalTokens: number;
  totalCost: number;
  isActiveBlock: boolean;
  modelsUsed: string[];
  modelBreakdowns: ModelBreakdown[];
}

interface DailyResponse {
  daily: DailyUsage[];
}

interface MonthlyResponse {
  monthly: MonthlyUsage[];
}

interface BlocksResponse {
  blocks: BlockUsage[];
}

let statusBarItem: vscode.StatusBarItem;
let refreshInterval: NodeJS.Timeout | undefined;
let outputChannel: vscode.OutputChannel;

export function activate(context: vscode.ExtensionContext) {
  outputChannel = vscode.window.createOutputChannel('CCUsage');

  statusBarItem = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Right,
    100
  );
  statusBarItem.command = 'ccusage.showDaily';
  context.subscriptions.push(statusBarItem);

  const refreshCommand = vscode.commands.registerCommand('ccusage.refresh', () => {
    updateStatusBar();
  });

  const showDailyCommand = vscode.commands.registerCommand('ccusage.showDaily', async () => {
    await showUsageDetails('daily');
  });

  const showMonthlyCommand = vscode.commands.registerCommand('ccusage.showMonthly', async () => {
    await showUsageDetails('monthly');
  });

  const showBlocksCommand = vscode.commands.registerCommand('ccusage.showBlocks', async () => {
    await showUsageDetails('blocks');
  });

  context.subscriptions.push(refreshCommand, showDailyCommand, showMonthlyCommand, showBlocksCommand);

  vscode.workspace.onDidChangeConfiguration((e) => {
    if (e.affectsConfiguration('ccusage')) {
      setupRefreshInterval();
      updateStatusBar();
    }
  });

  statusBarItem.show();
  updateStatusBar();
  setupRefreshInterval();

  outputChannel.appendLine('CCUsage extension activated');
}

function setupRefreshInterval() {
  if (refreshInterval) {
    clearInterval(refreshInterval);
  }

  const config = vscode.workspace.getConfiguration('ccusage');
  const intervalSeconds = config.get<number>('refreshInterval', 300);

  refreshInterval = setInterval(() => {
    updateStatusBar();
  }, intervalSeconds * 1000);
}

async function runCcusage(command: string): Promise<string> {
  try {
    const { stdout } = await execAsync(`npx ccusage@latest ${command} --json`, {
      timeout: 30000,
      env: { ...process.env, NO_COLOR: '1' }
    });
    return stdout;
  } catch (error) {
    outputChannel.appendLine(`Error running ccusage: ${error}`);
    throw error;
  }
}

function formatTokens(tokens: number): string {
  if (tokens >= 1000000) {
    return `${(tokens / 1000000).toFixed(1)}M`;
  } else if (tokens >= 1000) {
    return `${(tokens / 1000).toFixed(1)}K`;
  }
  return tokens.toString();
}

function formatCost(cost: number): string {
  return `$${cost.toFixed(2)}`;
}

function getStartOfWeek(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  d.setDate(diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

function calculateDailyUsage(dailyData: DailyUsage[]): { cost: number; tokens: number } {
  const today = new Date().toISOString().slice(0, 10);

  for (const day of dailyData) {
    if (day.date === today) {
      return { cost: day.totalCost, tokens: day.totalTokens };
    }
  }

  return { cost: 0, tokens: 0 };
}

function calculateWeeklyUsage(dailyData: DailyUsage[]): { cost: number; tokens: number } {
  const now = new Date();
  const startOfWeek = getStartOfWeek(now);

  let weeklyCost = 0;
  let weeklyTokens = 0;

  for (const day of dailyData) {
    const dayDate = new Date(day.date);
    if (dayDate >= startOfWeek) {
      weeklyCost += day.totalCost;
      weeklyTokens += day.totalTokens;
    }
  }

  return { cost: weeklyCost, tokens: weeklyTokens };
}

async function updateStatusBar() {
  const config = vscode.workspace.getConfiguration('ccusage');
  const showCost = config.get<boolean>('showCost', true);
  const showTokens = config.get<boolean>('showTokens', true);

  statusBarItem.text = `${CLAUDE_ICON} loading...`;

  try {
    const [dailyOutput, monthlyOutput] = await Promise.all([
      runCcusage('daily'),
      runCcusage('monthly')
    ]);

    const dailyData: DailyResponse = JSON.parse(dailyOutput);
    const monthlyData: MonthlyResponse = JSON.parse(monthlyOutput);

    const daily = calculateDailyUsage(dailyData.daily || []);
    const weekly = calculateWeeklyUsage(dailyData.daily || []);

    let monthlyCost = 0;
    let monthlyTokens = 0;
    if (monthlyData.monthly && monthlyData.monthly.length > 0) {
      const thisMonth = monthlyData.monthly[monthlyData.monthly.length - 1];
      monthlyCost = thisMonth.totalCost;
      monthlyTokens = thisMonth.totalTokens;
    }

    // Build compact status bar text
    const dayParts: string[] = [];
    if (showTokens) { dayParts.push(formatTokens(daily.tokens)); }
    if (showCost) { dayParts.push(formatCost(daily.cost)); }

    const weekParts: string[] = [];
    if (showTokens) { weekParts.push(formatTokens(weekly.tokens)); }
    if (showCost) { weekParts.push(formatCost(weekly.cost)); }

    const monthParts: string[] = [];
    if (showTokens) { monthParts.push(formatTokens(monthlyTokens)); }
    if (showCost) { monthParts.push(formatCost(monthlyCost)); }

    statusBarItem.text = `${CLAUDE_ICON} D: ${dayParts.join(' ')} | W: ${weekParts.join(' ')} | M: ${monthParts.join(' ')}`;
    statusBarItem.tooltip = buildTooltip(daily, weekly, monthlyCost, monthlyTokens);
    statusBarItem.backgroundColor = undefined;

  } catch (error) {
    statusBarItem.text = `${CLAUDE_ICON} error`;
    statusBarItem.backgroundColor = new vscode.ThemeColor('statusBarItem.errorBackground');
    statusBarItem.tooltip = 'Failed to load usage data. Click to retry.';
    outputChannel.appendLine(`Failed to update status bar: ${error}`);
  }
}

function buildTooltip(
  daily: { cost: number; tokens: number },
  weekly: { cost: number; tokens: number },
  monthlyCost: number,
  monthlyTokens: number
): vscode.MarkdownString {
  const md = new vscode.MarkdownString();
  md.isTrusted = true;
  md.supportHtml = true;

  md.appendMarkdown(`### ${CLAUDE_ICON} Claude Code Usage\n\n`);
  md.appendMarkdown(`| | Tokens | Cost |\n`);
  md.appendMarkdown(`|---|---|---|\n`);
  md.appendMarkdown(`| **Today** | ${formatTokens(daily.tokens)} | ${formatCost(daily.cost)} |\n`);
  md.appendMarkdown(`| **Week** | ${formatTokens(weekly.tokens)} | ${formatCost(weekly.cost)} |\n`);
  md.appendMarkdown(`| **Month** | ${formatTokens(monthlyTokens)} | ${formatCost(monthlyCost)} |\n\n`);
  md.appendMarkdown(`---\n`);
  md.appendMarkdown(`[Daily](command:ccusage.showDaily) · [Monthly](command:ccusage.showMonthly) · [Blocks](command:ccusage.showBlocks) · [Refresh](command:ccusage.refresh)`);

  return md;
}

async function showUsageDetails(mode: 'daily' | 'monthly' | 'blocks') {
  const panel = vscode.window.createWebviewPanel(
    'ccusageDetails',
    `${CLAUDE_ICON} CCUsage - ${mode.charAt(0).toUpperCase() + mode.slice(1)}`,
    vscode.ViewColumn.One,
    { enableScripts: true }
  );

  panel.webview.html = getLoadingHtml();

  try {
    const output = await runCcusage(mode);
    const data = JSON.parse(output);
    panel.webview.html = getDetailsHtml(mode, data);
  } catch (error) {
    panel.webview.html = getErrorHtml(error);
  }
}

function getLoadingHtml(): string {
  return `<!DOCTYPE html>
<html>
<head>
  <style>
    body {
      font-family: var(--vscode-font-family);
      padding: 20px;
      color: var(--vscode-foreground);
      background: var(--vscode-editor-background);
      display: flex;
      justify-content: center;
      align-items: center;
      height: 100vh;
    }
    .loader { font-size: 18px; }
  </style>
</head>
<body>
  <div class="loader">${CLAUDE_ICON} Loading usage data...</div>
</body>
</html>`;
}

function getErrorHtml(error: unknown): string {
  return `<!DOCTYPE html>
<html>
<head>
  <style>
    body {
      font-family: var(--vscode-font-family);
      padding: 20px;
      color: var(--vscode-foreground);
      background: var(--vscode-editor-background);
    }
    .error { color: var(--vscode-errorForeground); }
  </style>
</head>
<body>
  <h2 class="error">Error loading usage data</h2>
  <p>${error instanceof Error ? error.message : String(error)}</p>
  <p>Make sure ccusage is available: <code>npx ccusage@latest daily</code></p>
</body>
</html>`;
}

function getDetailsHtml(mode: string, data: DailyResponse | MonthlyResponse | BlocksResponse): string {
  let rows = '';
  let items: Array<DailyUsage | MonthlyUsage | BlockUsage> = [];
  let dateHeader = 'Date';

  if (mode === 'daily' && 'daily' in data) {
    items = data.daily;
    dateHeader = 'Date';
  } else if (mode === 'monthly' && 'monthly' in data) {
    items = data.monthly;
    dateHeader = 'Month';
  } else if (mode === 'blocks' && 'blocks' in data) {
    items = data.blocks;
    dateHeader = 'Block';
  }

  let totalCost = 0;
  let totalTokens = 0;

  for (const item of items.slice().reverse()) {
    totalCost += item.totalCost;
    totalTokens += item.totalTokens;

    let dateValue = '';
    let highlight = '';

    if ('date' in item) {
      dateValue = item.date;
    } else if ('month' in item) {
      dateValue = item.month;
    } else if ('blockStart' in item) {
      dateValue = `${item.blockStart.slice(0, 16)} - ${item.blockEnd.slice(11, 16)}`;
      if (item.isActiveBlock) {
        highlight = 'class="active"';
      }
    }

    rows += `
      <tr ${highlight}>
        <td>${dateValue}</td>
        <td>${formatTokens(item.totalTokens)}</td>
        <td>${formatTokens(item.inputTokens)}</td>
        <td>${formatTokens(item.outputTokens)}</td>
        <td>${formatTokens(item.cacheReadTokens)}</td>
        <td>${formatCost(item.totalCost)}</td>
        <td>${item.modelsUsed.map(m => m.replace('claude-', '').replace(/-\d+$/, '')).join(', ')}</td>
      </tr>
    `;
  }

  return `<!DOCTYPE html>
<html>
<head>
  <style>
    body {
      font-family: var(--vscode-font-family);
      padding: 20px;
      color: var(--vscode-foreground);
      background: var(--vscode-editor-background);
    }
    h1 {
      color: var(--vscode-foreground);
      border-bottom: 1px solid var(--vscode-panel-border);
      padding-bottom: 10px;
    }
    .claude-icon {
      color: #D97757;
      font-size: 28px;
      vertical-align: middle;
    }
    .summary {
      display: flex;
      gap: 30px;
      margin-bottom: 20px;
      padding: 15px;
      background: var(--vscode-editor-inactiveSelectionBackground);
      border-radius: 5px;
    }
    .summary-item {
      text-align: center;
    }
    .summary-value {
      font-size: 24px;
      font-weight: bold;
      color: var(--vscode-textLink-foreground);
    }
    .summary-label {
      font-size: 12px;
      color: var(--vscode-descriptionForeground);
    }
    table {
      width: 100%;
      border-collapse: collapse;
      margin-top: 20px;
    }
    th, td {
      padding: 10px;
      text-align: left;
      border-bottom: 1px solid var(--vscode-panel-border);
    }
    th {
      background: var(--vscode-editor-inactiveSelectionBackground);
      font-weight: 600;
    }
    tr:hover {
      background: var(--vscode-list-hoverBackground);
    }
    tr.active {
      background: var(--vscode-editor-selectionBackground);
    }
  </style>
</head>
<body>
  <h1><span class="claude-icon">${CLAUDE_ICON}</span> Claude Code Usage - ${mode.charAt(0).toUpperCase() + mode.slice(1)}</h1>

  <div class="summary">
    <div class="summary-item">
      <div class="summary-value">${formatCost(totalCost)}</div>
      <div class="summary-label">Total Cost</div>
    </div>
    <div class="summary-item">
      <div class="summary-value">${formatTokens(totalTokens)}</div>
      <div class="summary-label">Total Tokens</div>
    </div>
    <div class="summary-item">
      <div class="summary-value">${items.length}</div>
      <div class="summary-label">${mode === 'blocks' ? 'Blocks' : mode === 'monthly' ? 'Months' : 'Days'}</div>
    </div>
  </div>

  <table>
    <thead>
      <tr>
        <th>${dateHeader}</th>
        <th>Total Tokens</th>
        <th>Input</th>
        <th>Output</th>
        <th>Cache Read</th>
        <th>Cost</th>
        <th>Models</th>
      </tr>
    </thead>
    <tbody>
      ${rows}
    </tbody>
  </table>
</body>
</html>`;
}

export function deactivate() {
  if (refreshInterval) {
    clearInterval(refreshInterval);
  }
  statusBarItem.dispose();
  outputChannel.dispose();
}
