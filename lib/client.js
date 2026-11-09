/**
 * dsh-todo：浏览器侧。
 *
 * 结构：
 *  - 注册侧边栏入口（sidebar.panellist，id "dsh-todo"）与主面板（main，key "dsh-todo"）；
 *  - 主面板自绘：顶部胶囊 + 视图导航 + 任务列表 + 详情抽屉 + 日历 + 番茄钟；
 *  - 数据全部走同源 `/todo/api/*`，番茄钟状态只落 localStorage；
 *  - 所有文案走 DICT（zh / en），无 locale 服务时按浏览器语言兜底；
 *  - 样式一次性注入，颜色/圆角/阴影只用宿主 `--dsw-*` token。
 */
window.__ModuleLoader__.load({
  id: "dsh-todo",
  factory(require) {
    const React = require("react");
    const h = React.createElement;
    const {
      useState,
      useEffect,
      useMemo,
      useRef,
      useCallback,
      useReducer,
    } = React;

    const NS = "dsh-todo";
    const PANEL_ID = "dsh-todo";
    const API = "todo/api/";
    const STORAGE_KEY = "dsh-todo/pomodoro";

    /* ============================ 文案（中/英） ============================ */

    const DICT = {
      zh: {
        "panel.title": "待办",
        "panel.subtitle": "任务、项目、日历与番茄钟",

        "view.today": "今天",
        "view.upcoming": "即将到来",
        "view.inbox": "收件箱",
        "view.completed": "已完成",
        "view.projects": "项目",
        "view.calendar": "日历",
        "view.pomodoro": "番茄钟",
        "view.search": "搜索",

        "group.overdue": "逾期",
        "group.today": "今天",
        "group.upcoming": "即将到来",
        "group.inbox": "收件箱",
        "group.project": "项目",
        "group.completed": "已完成",
        "group.calendar": "日历",
        "group.pomodoro": "番茄钟",
        "group.searchResults": "搜索结果",
        "group.completedSection": "已完成",
        "group.noDueDate": "无日期",

        "nav.title": "视图",
        "nav.projects": "项目",
        "nav.addProject": "新建项目",
        "nav.projectPlaceholder": "项目名称",
        "nav.projectDelete": "删除项目",
        "nav.projectDeleteConfirm": "删除项目「{name}」？其中的任务会移到收件箱。",
        "nav.projectColor": "更换颜色",
        "nav.collapsed": "视图",
        "nav.rename": "双击重命名",
        "nav.noProjects": "还没有项目。",

        "topbar.day": "第 {n} 天",
        "topbar.progress": "今日 {done}/{total}",
        "topbar.allDone": "今天的任务都完成了",
        "topbar.today": "今天",
        "topbar.searchPlaceholder": "搜索标题、备注、标签…",
        "topbar.searchAria": "搜索任务",
        "topbar.priorityFilter": "优先级筛选",
        "topbar.clearFilter": "清除筛选",
        "topbar.refresh": "刷新",
        "topbar.sync": "同步中…",
        "topbar.error": "数据加载失败：{message}",
        "topbar.retry": "重试",

        "quick.placeholder": "添加任务：明天 15:00 写周报 #工作 !p1 ~weekly",
        "quick.placeholderSimple": "添加任务…",
        "quick.add": "添加",
        "quick.aria": "快速添加任务",
        "quick.hint": "Enter 添加 · Esc 清空",
        "quick.parsedDue": "{date}",
        "quick.parsedTime": "{date} {time}",
        "quick.parsedProject": "#{name}",
        "quick.parsedLabels": "标签 {labels}",
        "quick.invalid": "标题不能为空",
        "quick.newProject": "将新建项目 {name}",

        "empty.today": "今天没有任务，享受这份清静。",
        "empty.upcoming": "接下来没有排期。",
        "empty.inbox": "收件箱是空的。",
        "empty.completed": "还没有完成的任务。",
        "empty.project": "这个项目还没有任务。",
        "empty.search": "没有匹配的任务。",
        "empty.day": "这一天没有任务。",
        "empty.filtered": "当前筛选下没有任务。",
        "empty.loading": "读取中…",
        "empty.calendar": "本月没有任务。",

        "task.toggleDone": "标记完成",
        "task.toggleUndone": "标记未完成",
        "task.open": "打开详情",
        "task.moveUp": "上移",
        "task.moveDown": "下移",
        "task.subtasks": "子任务 {done}/{total}",
        "task.subtasksToggle": "展开 / 收起子任务",
        "task.recurring": "重复任务",
        "task.pomodoros": "{n} 个番茄",
        "task.focus": "开始专注",
        "task.inbox": "收件箱",
        "task.noDue": "无日期",
        "task.priority": "优先级 {n}",

        "toast.completed": "已完成「{title}」",
        "toast.next": "下一次：{date}",
        "toast.deleted": "已删除「{title}」",
        "toast.projectDeleted": "已删除项目「{name}」",
        "toast.undo": "撤销",
        "toast.dismiss": "关闭",
        "toast.added": "已添加「{title}」",
        "toast.error": "操作失败：{message}",

        "pom.mode.focus": "专注",
        "pom.mode.short": "短休",
        "pom.mode.long": "长休",
        "pom.start": "开始",
        "pom.pause": "暂停",
        "pom.resume": "继续",
        "pom.abandon": "放弃",
        "pom.skip": "跳过",
        "pom.capsule": "番茄钟",
        "pom.open": "打开番茄钟",
        "shortcut.togglePomodoro": "开始 / 暂停番茄钟",
        "shortcut.openPanel": "打开待办面板",
        "pom.immersive": "沉浸模式",
        "pom.exitImmersive": "退出沉浸",
        "pom.bindTask": "绑定任务",
        "pom.noTask": "未绑定任务",
        "pom.cycle": "第 {n}/{total} 个专注",
        "pom.cycleDone": "已完成 {n} 个专注",
        "pom.idleHint": "选一个任务，开始 25 分钟专注。",
        "pom.finishedFocus": "这个番茄结束了，休息一下。",
        "pom.finishedBreak": "休息结束，回到专注吧。",
        "pom.today": "今日番茄",
        "pom.todayMinutes": "今日专注",
        "pom.goal": "目标 {n}",
        "pom.goalDone": "今日目标达成",
        "pom.week": "近 7 天",
        "pom.streak": "连续 {n} 天",
        "pom.settings": "番茄设置",
        "pom.settingsHint": "修改后从下一个番茄开始生效。",
        "pom.notifyTitleFocus": "专注结束",
        "pom.notifyBodyFocus": "休息 5 分钟，或者直接开始下一个番茄。",
        "pom.notifyTitleBreak": "休息结束",
        "pom.notifyBodyBreak": "回来继续专注吧。",
        "pom.noTaskBound": "未绑定任务",
        "pom.bindFirst": "先绑定一个任务再开始专注。",
        "pom.sessions": "专注记录",
        "pom.sessionRow": "{minutes} 分钟 · {time}",
        "pom.emptySessions": "还没有专注记录。",
        "pom.minutesShort": "{n} 分钟",
        "pom.minutesUnit": "分钟",

        "detail.title": "任务详情",
        "detail.close": "关闭",
        "detail.taskTitle": "标题",
        "detail.note": "备注",
        "detail.notePlaceholder": "补充说明、链接、验收标准…",
        "detail.due": "截止时间",
        "detail.dueDate": "日期",
        "detail.dueTime": "时刻",
        "detail.clearDue": "清除日期",
        "detail.priority": "优先级",
        "detail.priorityNone": "无",
        "detail.project": "项目",
        "detail.projectNone": "收件箱",
        "detail.labels": "标签",
        "detail.labelsPlaceholder": "用逗号分隔，如：工作, 汇报",
        "detail.recurrence": "重复",
        "detail.recurrenceInterval": "间隔",
        "detail.subtasks": "子任务",
        "detail.subtaskPlaceholder": "添加子任务…",
        "detail.subtaskAdd": "添加子任务",
        "detail.delete": "删除任务",
        "detail.deleteConfirm": "删除「{title}」？",
        "detail.created": "创建于 {date}",
        "detail.pomodoros": "已累计 {n} 个番茄",
        "detail.startFocus": "开始专注此任务",
        "detail.saveHint": "修改会自动保存",
        "detail.saving": "保存中…",
        "detail.saved": "已保存",

        "rec.none": "不重复",
        "rec.daily": "每天",
        "rec.weekday": "工作日",
        "rec.weekly": "每周",
        "rec.monthly": "每月",
        "rec.everyDays": "每 {n} 天",
        "rec.everyWeeks": "每 {n} 周",
        "rec.everyMonths": "每 {n} 个月",
        "rec.interval": "间隔 {n}",

        "cal.prev": "上个月",
        "cal.next": "下个月",
        "cal.today": "回到今天",
        "cal.month": "{year} 年 {month} 月",
        "cal.dayTasks": "{date} 的任务",
        "cal.more": "+{n} 项",
        "cal.pick": "选择日期",
        "cal.selected": "已选 {date}",

        "project.name": "项目名称",
        "project.create": "创建",
        "project.cancel": "取消",
        "project.color.tomato": "红",
        "project.color.amber": "橙",
        "project.color.lime": "绿",
        "project.color.sky": "蓝",
        "project.color.grape": "紫",
        "project.color.slate": "灰",

        "settings.focusMinutes": "专注时长（分钟）",
        "settings.shortBreakMinutes": "短休（分钟）",
        "settings.longBreakMinutes": "长休（分钟）",
        "settings.longBreakEvery": "每几个专注后长休",
        "settings.autoStartNext": "自动开始下一段",
        "settings.sound": "结束提示音",
        "settings.dailyGoal": "每日番茄目标",

        "error.load": "无法连接宿主：{message}",
        "error.invalid-title": "标题不能为空",
        "error.title-too-long": "标题太长",
        "error.invalid-due": "日期格式不对",
        "error.invalid-priority": "优先级不合法",
        "error.invalid-labels": "标签不合法",
        "error.invalid-parent": "子任务层级不合法",
        "error.invalid-recurrence": "重复规则不合法",
        "error.invalid-id": "任务 id 不合法",
        "error.invalid-body": "请求内容不合法",
        "error.invalid-project": "项目不合法",
        "error.invalid-settings": "设置不合法",
        "error.invalid-session": "专注记录不合法",
        "error.not-found": "找不到这条记录",
        "error.method-not-allowed": "不支持这个操作",
        "error.already-exists": "已经存在",
        "error.tasks-limit": "任务数已达上限",
        "error.projects-limit": "项目数已达上限",
        "error.project-not-empty": "项目里还有任务",
        "error.body-too-large": "内容太大",
        "error.internal": "宿主内部错误",
        "error.network": "网络请求失败",
        "error.unknown": "未知错误",

        "weekday.0": "日",
        "weekday.1": "一",
        "weekday.2": "二",
        "weekday.3": "三",
        "weekday.4": "四",
        "weekday.5": "五",
        "weekday.6": "六",
        "weekday.short.1": "周一",
        "weekday.short.2": "周二",
        "weekday.short.3": "周三",
        "weekday.short.4": "周四",
        "weekday.short.5": "周五",
        "weekday.short.6": "周六",
        "weekday.short.0": "周日",
        "date.today": "今天",
        "date.tomorrow": "明天",
        "date.yesterday": "昨天",
        "date.monthDay": "{month} 月 {day} 日",
        "date.monthDayWeekday": "{month} 月 {day} 日 {weekday}",
        "date.yearMonthDay": "{year} 年 {month} 月 {day} 日",
        "date.monthShort.1": "1",
        "date.monthShort.2": "2",
        "date.monthShort.3": "3",
        "date.monthShort.4": "4",
        "date.monthShort.5": "5",
        "date.monthShort.6": "6",
        "date.monthShort.7": "7",
        "date.monthShort.8": "8",
        "date.monthShort.9": "9",
        "date.monthShort.10": "10",
        "date.monthShort.11": "11",
        "date.monthShort.12": "12",
      },
      en: {
        "panel.title": "To-do",
        "panel.subtitle": "Tasks, projects, calendar and pomodoro",

        "view.today": "Today",
        "view.upcoming": "Upcoming",
        "view.inbox": "Inbox",
        "view.completed": "Completed",
        "view.projects": "Projects",
        "view.calendar": "Calendar",
        "view.pomodoro": "Pomodoro",
        "view.search": "Search",

        "group.overdue": "Overdue",
        "group.today": "Today",
        "group.upcoming": "Upcoming",
        "group.inbox": "Inbox",
        "group.project": "Project",
        "group.completed": "Completed",
        "group.calendar": "Calendar",
        "group.pomodoro": "Pomodoro",
        "group.searchResults": "Results",
        "group.completedSection": "Completed",
        "group.noDueDate": "No date",

        "nav.title": "Views",
        "nav.projects": "Projects",
        "nav.addProject": "New project",
        "nav.projectPlaceholder": "Project name",
        "nav.projectDelete": "Delete project",
        "nav.projectDeleteConfirm": "Delete project “{name}”? Its tasks move to the inbox.",
        "nav.projectColor": "Change colour",
        "nav.collapsed": "Views",
        "nav.rename": "Double-click to rename",
        "nav.noProjects": "No projects yet.",

        "topbar.day": "Day {n}",
        "topbar.progress": "Today {done}/{total}",
        "topbar.allDone": "All of today is done",
        "topbar.today": "Today",
        "topbar.searchPlaceholder": "Search titles, notes, labels…",
        "topbar.searchAria": "Search tasks",
        "topbar.priorityFilter": "Filter by priority",
        "topbar.clearFilter": "Clear filters",
        "topbar.refresh": "Refresh",
        "topbar.sync": "Syncing…",
        "topbar.error": "Could not load data: {message}",
        "topbar.retry": "Retry",

        "quick.placeholder": "Add a task: tomorrow 15:00 write report #work !p1 ~weekly",
        "quick.placeholderSimple": "Add a task…",
        "quick.add": "Add",
        "quick.aria": "Quick add a task",
        "quick.hint": "Enter to add · Esc to clear",
        "quick.parsedDue": "{date}",
        "quick.parsedTime": "{date} {time}",
        "quick.parsedProject": "#{name}",
        "quick.parsedLabels": "labels {labels}",
        "quick.invalid": "A title is required",
        "quick.newProject": "New project {name}",

        "empty.today": "Nothing due today. Enjoy the quiet.",
        "empty.upcoming": "Nothing scheduled ahead.",
        "empty.inbox": "Your inbox is empty.",
        "empty.completed": "No completed tasks yet.",
        "empty.project": "No tasks in this project yet.",
        "empty.search": "No matching tasks.",
        "empty.day": "Nothing on this day.",
        "empty.filtered": "Nothing matches the current filters.",
        "empty.loading": "Loading…",
        "empty.calendar": "No tasks this month.",

        "task.toggleDone": "Mark done",
        "task.toggleUndone": "Mark not done",
        "task.open": "Open details",
        "task.moveUp": "Move up",
        "task.moveDown": "Move down",
        "task.subtasks": "Subtasks {done}/{total}",
        "task.subtasksToggle": "Show / hide subtasks",
        "task.recurring": "Recurring task",
        "task.pomodoros": "{n} pomodoros",
        "task.focus": "Start focus",
        "task.inbox": "Inbox",
        "task.noDue": "No date",
        "task.priority": "Priority {n}",

        "toast.completed": "Done “{title}”",
        "toast.next": "Next: {date}",
        "toast.deleted": "Deleted “{title}”",
        "toast.projectDeleted": "Deleted project “{name}”",
        "toast.undo": "Undo",
        "toast.dismiss": "Dismiss",
        "toast.added": "Added “{title}”",
        "toast.error": "Action failed: {message}",

        "pom.mode.focus": "Focus",
        "pom.mode.short": "Short break",
        "pom.mode.long": "Long break",
        "pom.start": "Start",
        "pom.pause": "Pause",
        "pom.resume": "Resume",
        "pom.abandon": "Give up",
        "pom.skip": "Skip",
        "pom.capsule": "Pomodoro",
        "pom.open": "Open pomodoro",
        "shortcut.togglePomodoro": "Start or pause the pomodoro",
        "shortcut.openPanel": "Open the to-do panel",
        "pom.immersive": "Immersive",
        "pom.exitImmersive": "Leave immersive",
        "pom.bindTask": "Linked task",
        "pom.noTask": "No linked task",
        "pom.cycle": "Focus {n}/{total}",
        "pom.cycleDone": "{n} focus sessions done",
        "pom.idleHint": "Pick a task and start a 25 minute focus.",
        "pom.finishedFocus": "Focus finished. Take a break.",
        "pom.finishedBreak": "Break over. Back to focus.",
        "pom.today": "Pomodoros today",
        "pom.todayMinutes": "Focused today",
        "pom.goal": "Goal {n}",
        "pom.goalDone": "Daily goal reached",
        "pom.week": "Last 7 days",
        "pom.streak": "{n} day streak",
        "pom.settings": "Pomodoro settings",
        "pom.settingsHint": "Changes apply from the next pomodoro.",
        "pom.notifyTitleFocus": "Focus finished",
        "pom.notifyBodyFocus": "Take five, or start the next pomodoro.",
        "pom.notifyTitleBreak": "Break finished",
        "pom.notifyBodyBreak": "Time to focus again.",
        "pom.noTaskBound": "No linked task",
        "pom.bindFirst": "Link a task before starting focus.",
        "pom.sessions": "Focus log",
        "pom.sessionRow": "{minutes} min · {time}",
        "pom.emptySessions": "No focus sessions yet.",
        "pom.minutesShort": "{n} min",
        "pom.minutesUnit": "min",

        "detail.title": "Task details",
        "detail.close": "Close",
        "detail.taskTitle": "Title",
        "detail.note": "Notes",
        "detail.notePlaceholder": "Context, links, acceptance criteria…",
        "detail.due": "Due",
        "detail.dueDate": "Date",
        "detail.dueTime": "Time",
        "detail.clearDue": "Clear date",
        "detail.priority": "Priority",
        "detail.priorityNone": "None",
        "detail.project": "Project",
        "detail.projectNone": "Inbox",
        "detail.labels": "Labels",
        "detail.labelsPlaceholder": "Comma separated, e.g. work, report",
        "detail.recurrence": "Repeat",
        "detail.recurrenceInterval": "Interval",
        "detail.subtasks": "Subtasks",
        "detail.subtaskPlaceholder": "Add a subtask…",
        "detail.subtaskAdd": "Add subtask",
        "detail.delete": "Delete task",
        "detail.deleteConfirm": "Delete “{title}”?",
        "detail.created": "Created {date}",
        "detail.pomodoros": "{n} pomodoros so far",
        "detail.startFocus": "Focus on this task",
        "detail.saveHint": "Changes save automatically",
        "detail.saving": "Saving…",
        "detail.saved": "Saved",

        "rec.none": "No repeat",
        "rec.daily": "Daily",
        "rec.weekday": "Weekdays",
        "rec.weekly": "Weekly",
        "rec.monthly": "Monthly",
        "rec.everyDays": "Every {n} days",
        "rec.everyWeeks": "Every {n} weeks",
        "rec.everyMonths": "Every {n} months",
        "rec.interval": "every {n}",

        "cal.prev": "Previous month",
        "cal.next": "Next month",
        "cal.today": "Back to today",
        "cal.month": "{month} {year}",
        "cal.dayTasks": "Tasks on {date}",
        "cal.more": "+{n} more",
        "cal.pick": "Pick a date",
        "cal.selected": "Selected {date}",

        "project.name": "Project name",
        "project.create": "Create",
        "project.cancel": "Cancel",
        "project.color.tomato": "Red",
        "project.color.amber": "Orange",
        "project.color.lime": "Green",
        "project.color.sky": "Blue",
        "project.color.grape": "Purple",
        "project.color.slate": "Grey",

        "settings.focusMinutes": "Focus length (min)",
        "settings.shortBreakMinutes": "Short break (min)",
        "settings.longBreakMinutes": "Long break (min)",
        "settings.longBreakEvery": "Focuses before a long break",
        "settings.autoStartNext": "Auto-start the next session",
        "settings.sound": "Completion sound",
        "settings.dailyGoal": "Daily pomodoro goal",

        "error.load": "Cannot reach the host: {message}",
        "error.invalid-title": "A title is required",
        "error.title-too-long": "Title is too long",
        "error.invalid-due": "Invalid date",
        "error.invalid-priority": "Invalid priority",
        "error.invalid-labels": "Invalid labels",
        "error.invalid-parent": "Invalid subtask nesting",
        "error.invalid-recurrence": "Invalid repeat rule",
        "error.invalid-id": "Invalid task id",
        "error.invalid-body": "Invalid request body",
        "error.invalid-project": "Invalid project",
        "error.invalid-settings": "Invalid settings",
        "error.invalid-session": "Invalid focus session",
        "error.not-found": "Not found",
        "error.method-not-allowed": "Unsupported action",
        "error.already-exists": "Already exists",
        "error.tasks-limit": "Task limit reached",
        "error.projects-limit": "Project limit reached",
        "error.project-not-empty": "Project still has tasks",
        "error.body-too-large": "Payload too large",
        "error.internal": "Host error",
        "error.network": "Network request failed",
        "error.unknown": "Unknown error",

        "weekday.0": "Sun",
        "weekday.1": "Mon",
        "weekday.2": "Tue",
        "weekday.3": "Wed",
        "weekday.4": "Thu",
        "weekday.5": "Fri",
        "weekday.6": "Sat",
        "weekday.short.1": "Mon",
        "weekday.short.2": "Tue",
        "weekday.short.3": "Wed",
        "weekday.short.4": "Thu",
        "weekday.short.5": "Fri",
        "weekday.short.6": "Sat",
        "weekday.short.0": "Sun",
        "date.today": "Today",
        "date.tomorrow": "Tomorrow",
        "date.yesterday": "Yesterday",
        "date.monthDay": "{month} {day}",
        "date.monthDayWeekday": "{month} {day}, {weekday}",
        "date.yearMonthDay": "{month} {day}, {year}",
        "date.monthShort.1": "Jan",
        "date.monthShort.2": "Feb",
        "date.monthShort.3": "Mar",
        "date.monthShort.4": "Apr",
        "date.monthShort.5": "May",
        "date.monthShort.6": "Jun",
        "date.monthShort.7": "Jul",
        "date.monthShort.8": "Aug",
        "date.monthShort.9": "Sep",
        "date.monthShort.10": "Oct",
        "date.monthShort.11": "Nov",
        "date.monthShort.12": "Dec",
      },
    };

    /** 宿主 locale 服务；apply 时注入。 */
    let localeApi = null;
    /** 宿主 Client Context，仅用于「打开待办面板」这类导航。 */
    let clientCtx = null;
    /** 宿主 bind 出来的翻译函数；缺失时用本地表兜底。 */
    let boundTranslate = null;
    /** 预览页强制语言（"zh" | "en"），只在初始化时读一次。 */
    let previewLocale = null;

    function interpolate(template, vars) {
      if (!vars) return String(template);
      return String(template).replace(/\{(\w+)\}/g, (whole, key) =>
        Object.prototype.hasOwnProperty.call(vars, key) ? String(vars[key]) : whole,
      );
    }

    /** 当前界面语言：预览强制 > 宿主 locale > navigator > 中文。 */
    function activeLocale() {
      if (previewLocale) return previewLocale;
      try {
        const snapshot = localeApi && localeApi.getSnapshot ? localeApi.getSnapshot() : null;
        const tag = snapshot && typeof snapshot.active === "string" ? snapshot.active : "";
        if (tag) return tag.toLowerCase().startsWith("zh") ? "zh" : "en";
      } catch {
        /* 宿主 locale 服务形态变化时忽略 */
      }
      const nav =
        typeof navigator !== "undefined" && typeof navigator.language === "string"
          ? navigator.language
          : "zh";
      return nav.toLowerCase().startsWith("en") ? "en" : "zh";
    }

    /** 取一条文案；宿主 bind 的结果为空或等于键名时回落到本地表。 */
    function t(key, vars) {
      let text;
      if (boundTranslate) {
        try {
          text = boundTranslate(key, vars);
        } catch {
          text = undefined;
        }
      }
      if (typeof text !== "string" || text === "" || text === key) {
        const dict = DICT[activeLocale()] || DICT.zh;
        text = dict[key] != null ? dict[key] : DICT.zh[key] != null ? DICT.zh[key] : key;
        text = interpolate(text, vars);
      }
      return text;
    }

    /* ============================ 日期工具 ============================ */

    const MS_DAY = 86400000;
    const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
    const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;

    function pad2(value) {
      return String(value).padStart(2, "0");
    }

    /** epoch-ms → 本地日期字符串（YYYY-MM-DD）。 */
    function localDate(ms) {
      const date = new Date(typeof ms === "number" ? ms : Date.now());
      return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
    }

    function isValidDate(value) {
      if (typeof value !== "string" || !DATE_RE.test(value)) return false;
      const [, y, m, d] = value.match(DATE_RE);
      const date = new Date(Number(y), Number(m) - 1, Number(d));
      return date.getFullYear() === Number(y) && date.getMonth() === Number(m) - 1 && date.getDate() === Number(d);
    }

    function isValidTime(value) {
      return typeof value === "string" && TIME_RE.test(value);
    }

    /** 日期字符串 → UTC 零点毫秒（只做日期算术，不受时区影响）。 */
    function dateToMs(date) {
      const [, y, m, d] = date.match(DATE_RE);
      return Date.UTC(Number(y), Number(m) - 1, Number(d));
    }

    function msToDate(ms) {
      const date = new Date(ms);
      return `${date.getUTCFullYear()}-${pad2(date.getUTCMonth() + 1)}-${pad2(date.getUTCDate())}`;
    }

    function addDays(date, days) {
      return msToDate(dateToMs(date) + days * MS_DAY);
    }

    function addMonths(date, months) {
      const [, y, m, d] = date.match(DATE_RE);
      const year = Number(y);
      const month = Number(m) - 1 + months;
      const targetYear = year + Math.floor(month / 12);
      const targetMonth = ((month % 12) + 12) % 12;
      const lastDay = new Date(Date.UTC(targetYear, targetMonth + 1, 0)).getUTCDate();
      return `${targetYear}-${pad2(targetMonth + 1)}-${pad2(Math.min(Number(d), lastDay))}`;
    }

    /** 0 = 周日 … 6 = 周六。 */
    function weekdayOf(date) {
      return new Date(dateToMs(date)).getUTCDay();
    }

    function diffDays(from, to) {
      return Math.round((dateToMs(to) - dateToMs(from)) / MS_DAY);
    }

    /** 周一为一周开始。 */
    function startOfWeek(date) {
      const weekday = weekdayOf(date);
      return addDays(date, -((weekday + 6) % 7));
    }

    function daysInMonth(year, month /* 1..12 */) {
      return new Date(Date.UTC(year, month, 0)).getUTCDate();
    }

    function monthKeyOf(date) {
      return typeof date === "string" && DATE_RE.test(date) ? date.slice(0, 7) : localDate().slice(0, 7);
    }

    function shiftMonth(monthKey, delta) {
      const [y, m] = monthKey.split("-").map(Number);
      const index = y * 12 + (m - 1) + delta;
      return `${Math.floor(index / 12)}-${pad2((index % 12) + 1)}`;
    }

    function formatMonthYear(monthKey) {
      const [y, m] = monthKey.split("-").map(Number);
      return t("cal.month", { year: y, month: t(`date.monthShort.${m}`) });
    }

    /** 日期标签：今天/明天/昨天/周几/月日（跨年份带年份）。 */
    function formatDue(date, today) {
      if (!isValidDate(date)) return "";
      const base = isValidDate(today) ? today : localDate();
      const delta = diffDays(base, date);
      if (delta === 0) return t("date.today");
      if (delta === 1) return t("date.tomorrow");
      if (delta === -1) return t("date.yesterday");
      const [, , month, day] = date.match(DATE_RE);
      const sameYear = date.slice(0, 4) === base.slice(0, 4);
      if (!sameYear) {
        return t("date.yearMonthDay", {
          year: date.slice(0, 4),
          month: t(`date.monthShort.${Number(month)}`),
          day: Number(day),
        });
      }
      if (delta > 1 && delta < 7) {
        return t("date.monthDayWeekday", {
          month: t(`date.monthShort.${Number(month)}`),
          day: Number(day),
          weekday: t(`weekday.short.${weekdayOf(date)}`),
        });
      }
      return t("date.monthDay", { month: t(`date.monthShort.${Number(month)}`), day: Number(day) });
    }

    function formatDateTime(due, today) {
      if (!due || !due.date) return "";
      const label = formatDue(due.date, today);
      return due.time ? `${label} ${due.time}` : label;
    }

    function dueSortValue(due) {
      if (!due || !due.date) return Number.MAX_SAFE_INTEGER;
      return dateToMs(due.date) + (due.time ? Number(due.time.slice(0, 2)) * 3600000 + Number(due.time.slice(3)) * 60000 : 0);
    }

    function isOverdue(due, today) {
      if (!due || !due.date || !isValidDate(due.date)) return false;
      if (due.date < today) return true;
      if (due.date > today) return false;
      if (!due.time) return false;
      const now = new Date();
      return `${pad2(now.getHours())}:${pad2(now.getMinutes())}` > due.time;
    }

    /* ============================ 快速添加解析 ============================ */

    /**
     * 自然语言解析的词汇表。`# 解析词汇：仅用于输入解析，不是界面文案。`
     * 这里的中文词是用户输入的关键词，不属于界面文案。
     */
    const PARSE_WORDS = {
      today: ["今天", "今日", "today"],
      tomorrow: ["明天", "明日", "tomorrow"],
      dayAfter: ["后天"],
      yesterday: ["昨天", "yesterday"],
      weekdays: {
        0: ["周日", "周天", "星期日", "星期天", "sun", "sunday"],
        1: ["周一", "星期一", "mon", "monday"],
        2: ["周二", "星期二", "tue", "tuesday"],
        3: ["周三", "星期三", "wed", "wednesday"],
        4: ["周四", "星期四", "thu", "thursday"],
        5: ["周五", "星期五", "fri", "friday"],
        6: ["周六", "星期六", "sat", "saturday"],
      },
      recurrence: {
        daily: ["~daily", "每天", "每日", "天天"],
        weekday: ["~weekday", "~weekdays", "每个工作日", "工作日"],
        weekly: ["~weekly", "每周"],
        monthly: ["~monthly", "每月"],
      },
      priority: ["!p1", "!p2", "!p3", "!p4", "!1", "!2", "!3", "!4", "!high", "!medium", "!low"],
      label: ["#"],
      project: ["#"],
    };

    /** 从文本里摘一个词，返回 [命中的词, 去掉后的文本]。 */
    function takeWord(text, word) {
      const index = text.toLowerCase().indexOf(word.toLowerCase());
      if (index < 0) return [null, text];
      return [text.slice(index, index + word.length), `${text.slice(0, index)} ${text.slice(index + word.length)}`];
    }

    function normalizeTime(label, hour, minute) {
      let hh = hour;
      const marker = (label || "").toLowerCase();
      const isPm = marker === "pm" || marker === "下午" || marker === "晚上" || marker === "傍晚" || marker === "傍晚";
      const isNoon = marker === "中午";
      if (marker === "pm") {
        if (hh < 12) hh += 12;
      } else if (isPm) {
        if (hh < 12) hh += 12;
      } else if (marker === "am") {
        if (hh === 12) hh = 0;
      } else if (marker === "凌晨" || marker === "早上" || marker === "上午") {
        if (hh === 12) hh = 0;
      } else if (isNoon) {
        hh = 12;
      }
      if (hh > 23) hh = 0;
      return `${pad2(hh)}:${pad2(minute || 0)}`;
    }

    function nextWeekday(today, weekday, nextWeek) {
      const start = nextWeek ? addDays(startOfWeek(today), 7) : today;
      const base = weekdayOf(start);
      let delta = (weekday - base + 7) % 7;
      if (delta === 0 && !nextWeek) delta = 7;
      return addDays(start, delta);
    }

    /**
     * 解析快速添加输入。
     * `明天 15:00 写周报 #工作 !p1 ~weekly` → { title: "写周报", due: {date,time}, project: "工作", priority: 1, recurrence: {freq:"weekly",interval:1} }
     * 无法识别的部分原样留在标题里；只给时刻不给日期时默认今天。
     */
    function parseQuickAdd(input, options) {
      const opts = options || {};
      const today = isValidDate(opts.today) ? opts.today : localDate();
      const original = String(input == null ? "" : input);
      let text = ` ${original} `;
      let dueTime = null;
      let dueDate = null;
      let priority = null;
      let recurrence = null;
      const projectTokens = [];
      const labelTokens = [];

      // 1) 优先级：!p1 / !1 / !high
      const priorityMatch = text.match(/(?:^|\s)!(?:p|P)?([1-4])(?=\s|$)/);
      if (priorityMatch) {
        priority = Number(priorityMatch[1]);
        text = text.replace(priorityMatch[0], " ");
      } else {
        const named = [
          [/!high/i, 1],
          [/!medium/i, 2],
          [/!low/i, 4],
        ];
        for (const [re, value] of named) {
          const match = text.match(re);
          if (match) {
            priority = value;
            text = text.replace(match[0], " ");
            break;
          }
        }
      }

      // 2) 重复：# 与 ~ 两种写法（多个写法命中时只取第一个，其余照样从标题里摘掉）
      for (const [freq, words] of Object.entries(PARSE_WORDS.recurrence)) {
        for (const word of words) {
          const flags = word.startsWith("~") ? "" : "i";
          const matched = new RegExp(`(?:^|\\s)${word.replace(/[~]/g, "\\~")}(?=\\s|$)`, flags).exec(text);
          if (!matched) continue;
          if (!recurrence) recurrence = { freq, interval: 1 };
          text = text.replace(matched[0], " ");
        }
      }

      // 3) 时间：HH:mm / 3pm / 3:30pm / 下午 3 点 / 15 点
      const timePatterns = [
        /(?:^|\s)(\d{1,2}):(\d{2})\s?(am|pm|AM|PM)?(?=\s|$)/,
        /(?:^|\s)(\d{1,2})\s?(am|pm|AM|PM)(?=\s|$)/,
        /(?:^|\s)(凌晨|早上|上午|中午|下午|晚上)?\s?(\d{1,2})\s?[点时](?:\s?(\d{1,2})\s?分)?/,
      ];
      for (const pattern of timePatterns) {
        const match = text.match(pattern);
        if (!match) continue;
        if (pattern === timePatterns[0]) {
          dueTime = normalizeTime(match[3], Number(match[1]), Number(match[2]));
        } else if (pattern === timePatterns[1]) {
          dueTime = normalizeTime(match[2], Number(match[1]), 0);
        } else {
          dueTime = normalizeTime(match[1], Number(match[2]), match[3] ? Number(match[3]) : 0);
        }
        text = text.replace(match[0], " ");
        break;
      }

      // 4) 日期：今天 / 明天 / 后天 / 周五 / 下周一 / 2026-11-12 / 11月12日 / 11/12
      const useDate = (candidate) => {
        if (!dueDate && isValidDate(candidate)) dueDate = candidate;
      };
      const consume = (regex, resolve) => {
        const match = regex.exec(text);
        if (!match) return;
        useDate(resolve(match));
        text = text.replace(match[0], " ");
      };
      consume(/(?:^|\s)(\d{4})-(\d{1,2})-(\d{1,2})(?=\s|$)/, (match) =>
        `${match[1]}-${pad2(match[2])}-${pad2(match[3])}`,
      );
      consume(/(?:^|\s)(?:(\d{4})\s?年\s?)?(\d{1,2})\s?月\s?(\d{1,2})\s?[日号]/, (match) => {
        const year = match[1] ? Number(match[1]) : Number(today.slice(0, 4));
        const candidate = `${year}-${pad2(match[2])}-${pad2(match[3])}`;
        if (!match[1] && candidate < today) return addMonths(candidate, 12);
        return candidate;
      });
      consume(/(?:^|\s)(\d{1,2})\/(\d{1,2})(?=\s|$)/, (match) =>
        `${today.slice(0, 4)}-${pad2(match[1])}-${pad2(match[2])}`,
      );
      consume(/(?:^|\s)(下个?月)?\s?(\d{1,2})\s?号/, (match) => {
        const offset = match[1] ? 1 : 0;
        const day = Number(match[2]);
        if (day < 1 || day > 31) return "";
        let year = Number(today.slice(0, 4));
        let month = Number(today.slice(5, 7)) + offset;
        year += Math.floor((month - 1) / 12);
        month = ((month - 1) % 12 + 12) % 12 + 1;
        const candidate = `${year}-${pad2(month)}-${pad2(Math.min(day, daysInMonth(year, month)))}`;
        return offset === 0 && candidate < today ? addMonths(candidate, 1) : candidate;
      });

      const keywordGroups = [
        [PARSE_WORDS.today, () => today],
        [PARSE_WORDS.tomorrow, () => addDays(today, 1)],
        [PARSE_WORDS.dayAfter, () => addDays(today, 2)],
        [PARSE_WORDS.yesterday, () => addDays(today, -1)],
      ];
      keywordGroups.forEach(([words, resolve]) => {
        for (const word of words) {
          const [hit, rest] = takeWord(text, word);
          if (!hit) continue;
          useDate(resolve());
          text = rest;
          break;
        }
      });

      const WEEKDAYS = { 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 日: 0, 天: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6, sun: 0 };
      consume(/(?:^|\s)(下周|下星期|next\s+week)\s?([一二三四五六日天]|mon|tue|wed|thu|fri|sat|sun)/i, (match) =>
        nextWeekday(today, WEEKDAYS[match[2].toLowerCase()], true),
      );
      consume(/(?:^|\s)(?:周|星期|礼拜)([一二三四五六日天])(?=\s|$)/, (match) =>
        nextWeekday(today, WEEKDAYS[match[1]], false),
      );
      consume(/(?:^|\s)next\s+(mon|tue|wed|thu|fri|sat|sun)(?:day)?(?=\s|$)/i, (match) =>
        nextWeekday(today, WEEKDAYS[match[1].toLowerCase()], true),
      );
      consume(/(?:^|\s)(mon|tue|wed|thu|fri|sat|sun)(?:day)?(?=\s|$)/i, (match) =>
        nextWeekday(today, WEEKDAYS[match[1].toLowerCase()], false),
      );

      // 5) 标签与项目：#项目（第一个）与 @标签
      const knownProjects = Array.isArray(opts.projects) ? opts.projects.filter(Boolean) : [];
      let projectToken = null;
      const hashMatches = [...text.matchAll(/(?:^|\s)([#@])([^\s#@]+)/g)];
      for (const match of hashMatches) {
        const value = match[2];
        const known = knownProjects.find((name) => name.toLowerCase() === value.toLowerCase());
        if (match[1] === "#" && !projectToken) projectToken = known || value;
        else labelTokens.push(value);
        text = text.replace(match[0], " ");
      }
      if (!projectToken && opts.project) projectToken = opts.project;

      const labels = [...new Set(labelTokens.map((label) => label.trim()).filter(Boolean))].slice(0, 10);
      const title = text.replace(/\s+/g, " ").trim();
      if (dueTime && !dueDate) dueDate = today;
      if (recurrence && !dueDate) dueDate = today;

      return {
        title,
        due: dueDate ? { date: dueDate, time: dueTime } : null,
        priority,
        project: projectToken,
        labels,
        recurrence,
      };
    }

    /* ============================ 番茄钟状态机 ============================ */

    const DEFAULT_SETTINGS = {
      focusMinutes: 25,
      shortBreakMinutes: 5,
      longBreakMinutes: 15,
      longBreakEvery: 4,
      autoStartNext: false,
      sound: true,
      dailyGoal: 8,
    };

    const MODE_KEYS = { focus: "pom.mode.focus", short: "pom.mode.short", long: "pom.mode.long" };

    function normalizedSettings(settings) {
      const merged = { ...DEFAULT_SETTINGS, ...(settings || {}) };
      const clamp = (value, min, max, fallback) => {
        const number = Number(value);
        if (!Number.isFinite(number)) return fallback;
        return Math.min(max, Math.max(min, Math.round(number)));
      };
      return {
        focusMinutes: clamp(merged.focusMinutes, 1, 180, 25),
        shortBreakMinutes: clamp(merged.shortBreakMinutes, 1, 60, 5),
        longBreakMinutes: clamp(merged.longBreakMinutes, 1, 120, 15),
        longBreakEvery: clamp(merged.longBreakEvery, 2, 12, 4),
        autoStartNext: Boolean(merged.autoStartNext),
        sound: merged.sound !== false,
        dailyGoal: clamp(merged.dailyGoal, 1, 40, 8),
      };
    }

    function modeMinutes(mode, settings) {
      const resolved = normalizedSettings(settings);
      if (mode === "short") return resolved.shortBreakMinutes;
      if (mode === "long") return resolved.longBreakMinutes;
      return resolved.focusMinutes;
    }

    function freshPomodoro(settings) {
      return {
        mode: "focus",
        endsAt: null,
        remainingMs: modeMinutes("focus", settings) * 60000,
        running: false,
        taskId: null,
        cycle: 0,
      };
    }

    /** 读 localStorage 的状态；字段不合法时退回初始状态。 */
    function normalizePomodoro(raw, settings) {
      const base = freshPomodoro(settings);
      if (!raw || typeof raw !== "object") return base;
      const mode = raw.mode === "short" || raw.mode === "long" ? raw.mode : "focus";
      const full = modeMinutes(mode, settings) * 60000;
      const remaining = Number(raw.remainingMs);
      const endsAt = Number(raw.endsAt);
      const running = Boolean(raw.running) && Number.isFinite(endsAt) && endsAt > 0;
      return {
        mode,
        endsAt: running ? endsAt : null,
        remainingMs: Number.isFinite(remaining) ? Math.max(0, Math.min(remaining, full)) : full,
        running,
        taskId: typeof raw.taskId === "string" && raw.taskId ? raw.taskId : null,
        cycle: Number.isFinite(Number(raw.cycle)) ? Math.max(0, Math.floor(Number(raw.cycle))) : 0,
      };
    }

    const POMO_INITIAL = { type: "load" };

    /**
     * 番茄钟 reducer（纯函数）。
     * 动作：load / start / pause / resume / toggle / tick / skip / abandon /
     *       setMode / bind / configure。
     * tick 到点只做状态切换，不碰副作用。
     */
    function pomodoroReducer(state, action) {
      const settings = action && action.settings;
      const now = action && Number.isFinite(action.now) ? action.now : Date.now();
      const fullMs = modeMinutes(state.mode, settings) * 60000;
      switch (action && action.type) {
        case "load":
          return normalizePomodoro(action.alarm, settings);
        case "start":
        case "resume": {
          if (state.running) return state;
          const remaining = state.remainingMs > 0 ? state.remainingMs : fullMs;
          return { ...state, running: true, remainingMs: remaining, endsAt: now + remaining };
        }
        case "pause": {
          if (!state.running) return state;
          const remaining = Math.max(0, state.endsAt - now);
          return { ...state, running: false, endsAt: null, remainingMs: remaining };
        }
        case "toggle":
          return state.running
            ? pomodoroReducer(state, { type: "pause", now, settings })
            : pomodoroReducer(state, { type: "start", now, settings });
        case "tick": {
          if (!state.running) return state;
          const remaining = Math.max(0, state.endsAt - now);
          if (remaining > 0) return { ...state, remainingMs: remaining };
          const nextMode = state.mode === "focus" ? "break" : "focus";
          const cycle = state.mode === "focus" ? state.cycle + 1 : state.cycle;
          const mode =
            nextMode === "break"
              ? cycle % normalizedSettings(settings).longBreakEvery === 0
                ? "long"
                : "short"
              : "focus";
          const duration = modeMinutes(mode, settings) * 60000;
          const autoStart = Boolean(normalizedSettings(settings).autoStartNext);
          return {
            ...state,
            mode,
            cycle,
            running: autoStart,
            endsAt: autoStart ? now + duration : null,
            remainingMs: duration,
          };
        }
        case "skip": {
          const cycle = state.mode === "focus" ? state.cycle + 1 : state.cycle;
          const mode =
            state.mode === "focus"
              ? cycle % normalizedSettings(settings).longBreakEvery === 0
                ? "long"
                : "short"
              : "focus";
          const duration = modeMinutes(mode, settings) * 60000;
          return { ...state, mode, cycle, running: false, endsAt: null, remainingMs: duration };
        }
        case "abandon":
          return {
            ...state,
            mode: "focus",
            running: false,
            endsAt: null,
            remainingMs: modeMinutes("focus", settings) * 60000,
          };
        case "setMode": {
          const mode = action.mode === "short" || action.mode === "long" ? action.mode : "focus";
          return {
            ...state,
            mode,
            running: false,
            endsAt: null,
            remainingMs: modeMinutes(mode, settings) * 60000,
          };
        }
        case "bind":
          return { ...state, taskId: typeof action.taskId === "string" && action.taskId ? action.taskId : null };
        case "configure": {
          const nextFull = modeMinutes(state.mode, settings) * 60000;
          if (state.running) return state;
          const idle = state.remainingMs >= fullMs || state.remainingMs <= 0;
          return { ...state, remainingMs: idle ? nextFull : Math.min(state.remainingMs, nextFull) };
        }
        default:
          return state;
      }
    }

    function pomodoroRemaining(state, now) {
      if (state.running && Number.isFinite(state.endsAt)) return Math.max(0, state.endsAt - now);
      return Math.max(0, state.remainingMs);
    }

    function pomodoroFinished(state, now) {
      return Boolean(state.running) && Number.isFinite(state.endsAt) && now >= state.endsAt;
    }

    function formatClock(ms) {
      const total = Math.max(0, Math.ceil(ms / 1000));
      const minutes = Math.floor(total / 60);
      return `${pad2(minutes)}:${pad2(total % 60)}`;
    }

    /* ============================ 提示音与通知 ============================ */

    let audioContext = null;

    /** 合成两段提示音，不依赖音频文件。 */
    function playChime() {
      try {
        const Ctor = typeof window !== "undefined" && (window.AudioContext || window.webkitAudioContext);
        if (!Ctor) return;
        if (!audioContext) audioContext = new Ctor();
        const ctx = audioContext;
        if (ctx.state === "suspended" && typeof ctx.resume === "function") ctx.resume();
        const now = ctx.currentTime;
        const notes = [
          { at: 0, frequency: 660 },
          { at: 0.18, frequency: 880 },
          { at: 0.42, frequency: 990 },
        ];
        notes.forEach((note) => {
          const oscillator = ctx.createOscillator();
          const gain = ctx.createGain();
          oscillator.type = "sine";
          oscillator.frequency.value = note.frequency;
          gain.gain.setValueAtTime(0.0001, now + note.at);
          gain.gain.exponentialRampToValueAtTime(0.14, now + note.at + 0.02);
          gain.gain.exponentialRampToValueAtTime(0.0001, now + note.at + 0.34);
          oscillator.connect(gain);
          gain.connect(ctx.destination);
          oscillator.start(now + note.at);
          oscillator.stop(now + note.at + 0.36);
        });
      } catch {
        /* 音频被浏览器策略拦住时静默失败 */
      }
    }

    function canNotify() {
      return typeof window !== "undefined" && typeof window.Notification === "function";
    }

    /** 只有用户点了开始才请求权限，不在页面加载时弹。 */
    function requestNotifyPermission() {
      try {
        if (canNotify() && window.Notification.permission === "default") {
          window.Notification.requestPermission().catch(() => {});
        }
      } catch {
        /* 忽略权限请求失败 */
      }
    }

    function sendNotification(title, body) {
      try {
        if (canNotify() && window.Notification.permission === "granted") {
          new window.Notification(title, { body, tag: `${NS}-pomodoro` });
        }
      } catch {
        /* 系统通知失败不影响页内提示 */
      }
    }

    /* ============================ 番茄钟引擎 ============================ */

    /**
     * 番茄钟不绑在组件上：切视图、收起面板都继续走，刷新后按 endsAt 续算。
     * retain/release 让 apply() 与页面各持有一份，全部释放才停表。
     */
    function createPomodoroEngine() {
      let state = freshPomodoro(DEFAULT_SETTINGS);
      let hydrated = false;
      let timer = null;
      let retainCount = 0;
      const listeners = new Set();
      const settingsRef = { current: DEFAULT_SETTINGS };
      const tasksRef = { current: [] };
      let storageListener = null;

      function emit() {
        listeners.forEach((listener) => {
          try {
            listener(state);
          } catch {
            /* 单个订阅者出错不拖垮其他订阅者 */
          }
        });
      }

      function persist() {
        try {
          localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
        } catch {
          /* 隐私模式写不进去时只保留内存状态 */
        }
      }

      function readStorage() {
        try {
          const raw = localStorage.getItem(STORAGE_KEY);
          return raw ? JSON.parse(raw) : null;
        } catch {
          return null;
        }
      }

      function settingsSnapshot() {
        return normalizedSettings(settingsRef.current);
      }

      function setSettings(settings) {
        settingsRef.current = settings || DEFAULT_SETTINGS;
        dispatch({ type: "configure" }, { skipPersist: true });
      }

      /** 结束时记录一条会话，并给绑定任务 +1 番茄。 */
      function completeSession(finishedState, finishedAt) {
        const minutes = Math.round(modeMinutes("focus", settingsSnapshot()));
        const startedAt = finishedAt - minutes * 60000;
        const taskId = finishedState.taskId;
        if (dataStore) {
          dataStore.recordSession({ taskId, startedAt, endedAt: finishedAt, minutes }).catch(() => {});
        }
        const settings = settingsSnapshot();
        if (settings.sound) playChime();
        const isFocus = finishedState.mode === "focus";
        sendNotification(
          isFocus ? t("pom.notifyTitleFocus") : t("pom.notifyTitleBreak"),
          isFocus ? t("pom.notifyBodyFocus") : t("pom.notifyBodyBreak"),
        );
        if (dataStore) {
          dataStore.toast(isFocus ? t("pom.finishedFocus") : t("pom.finishedBreak"));
        }
        return taskId;
      }

      function dispatch(action, options) {
        const opts = options || {};
        if (!hydrated && action.type !== "load") {
          hydrated = true;
          state = normalizePomodoro(readStorage(), settingsSnapshot());
        }
        const previous = state;
        const next = pomodoroReducer(state, { ...action, settings: settingsSnapshot() });
        if (next === previous) return previous;
        state = next;
        if (!opts.skipPersist) persist();
        ensureTimer();
        emit();
        return next;
      }

      function tick() {
        if (!state.running) return;
        const now = Date.now();
        if (pomodoroFinished(state, now)) {
          const finished = state;
          // 多标签页打开时，以最先写入 localStorage 的那个为准，避免重复记一次会话。
          const stored = readStorage();
          const someoneElseFinished =
            stored && typeof stored === "object" && stored.endsAt === finished.endsAt && stored.running === false;
          if (someoneElseFinished) {
            state = normalizePomodoro(stored, settingsSnapshot());
            emit();
            return;
          }
          completeSession(finished, now);
          dispatch({ type: "tick", now });
          return;
        }
        state = { ...state, remainingMs: Math.max(0, state.endsAt - now) };
        ensureTimer();
        emit();
      }

      function ensureTimer() {
        if (state.running && !timer) {
          timer = setInterval(tick, 1000);
        } else if (!state.running && timer) {
          clearInterval(timer);
          timer = null;
        }
      }

      function onStorage(event) {
        if (event && event.key !== STORAGE_KEY) return;
        state = normalizePomodoro(readStorage(), settingsSnapshot());
        ensureTimer();
        emit();
      }

      function retain() {
        retainCount += 1;
        if (retainCount === 1) {
          hydrated = true;
          state = normalizePomodoro(readStorage(), settingsSnapshot());
          if (typeof window !== "undefined" && typeof window.addEventListener === "function") {
            storageListener = onStorage;
            window.addEventListener("storage", storageListener);
          }
          ensureTimer();
          emit();
        }
        return () => {
          retainCount = Math.max(0, retainCount - 1);
          if (retainCount === 0) {
            if (timer) clearInterval(timer);
            timer = null;
            if (storageListener) {
              window.removeEventListener("storage", storageListener);
              storageListener = null;
            }
          }
        };
      }

      return {
        get: () => state,
        settings: () => settingsSnapshot(),
        subscribe(listener) {
          listeners.add(listener);
          return () => listeners.delete(listener);
        },
        dispatch,
        retain,
        tick,
        setSettings,
        setTasks(tasks) {
          tasksRef.current = Array.isArray(tasks) ? tasks : [];
        },
        getTasks: () => tasksRef.current,
        remaining: (now) => pomodoroRemaining(state, typeof now === "number" ? now : Date.now()),
        hasTimer: () => timer !== null,
        listenerCount: () => listeners.size,
      };
    }

    /* ============================ API 与数据 store ============================ */

    class ApiError extends Error {
      constructor(code, message) {
        super(message || code);
        this.code = code || "unknown";
      }
    }

    function apiUrl(path) {
      const base = API.endsWith("/") ? API : `${API}/`;
      try {
        return new URL(`${base}${path}`, document.baseURI).toString();
      } catch {
        return `${base}${path}`;
      }
    }

    function apiErrorText(error) {
      const code = error && error.code ? String(error.code) : "unknown";
      const key = `error.${code}`;
      const dict = DICT[activeLocale()] || DICT.zh;
      if (dict[key] || DICT.zh[key]) return t(key);
      return error && error.message ? String(error.message) : t("error.unknown");
    }

    async function request(path, body) {
      const url = apiUrl(path);
      let response;
      try {
        response = await fetch(url, {
          method: body === undefined ? "GET" : "POST",
          headers: body === undefined ? undefined : { "content-type": "application/json" },
          body: body === undefined ? undefined : JSON.stringify(body),
          cache: "no-store",
          credentials: "same-origin",
        });
      } catch (cause) {
        throw new ApiError("network", cause && cause.message ? cause.message : "");
      }
      let payload = null;
      try {
        payload = await response.json();
      } catch {
        payload = null;
      }
      if (!payload || payload.ok !== true) {
        const code = payload && payload.error ? payload.error : response.ok ? "unknown" : `http-${response.status}`;
        throw new ApiError(code, payload && payload.message ? payload.message : `HTTP ${response.status}`);
      }
      return payload;
    }

    function sortTasks(tasks) {
      const priority = (task) => (typeof task.priority === "number" ? task.priority : 5);
      const order = (task) => (Number.isFinite(task.order) ? task.order : 0);
      return tasks.slice().sort((a, b) => priority(a) - priority(b) || order(a) - order(b) || String(a.id).localeCompare(String(b.id)));
    }

    function createDataStore() {
      let state = { tasks: [], projects: [], sessions: [], settings: DEFAULT_SETTINGS };
      let today = localDate();
      let status = "idle";
      let error = null;
      let toast = null;
      const listeners = new Set();
      const toastTimer = { id: null };

      function emit() {
        listeners.forEach((listener) => {
          try {
            listener();
          } catch {
            /* 忽略单个订阅者异常 */
          }
        });
      }

      function setToast(nextToast, options) {
        const opts = options || {};
        if (toastTimer.id !== null) {
          clearTimeout(toastTimer.id);
          toastTimer.id = null;
        }
        toast = nextToast;
        emit();
        if (nextToast && opts.duration !== 0) {
          const duration = Number.isFinite(opts.duration) ? opts.duration : 6000;
          toastTimer.id = setTimeout(() => {
            toastTimer.id = null;
            toast = null;
            emit();
          }, duration);
        }
      }

      function fail(cause, fallbackKey) {
        setToast({ message: apiErrorText(cause) || t(fallbackKey || "error.unknown"), tone: "error" });
      }

      function upsertTasks(nextTasks) {
        const map = new Map(state.tasks.map((task) => [task.id, task]));
        nextTasks.forEach((task) => {
          if (task && task.id) map.set(task.id, { ...map.get(task.id), ...task });
        });
        state = { ...state, tasks: [...map.values()] };
      }

      function removeTasks(ids) {
        const drop = new Set(ids);
        state = { ...state, tasks: state.tasks.filter((task) => !drop.has(task.id)) };
      }

      async function load() {
        status = "loading";
        error = null;
        emit();
        try {
          const payload = await request("state");
          const next = payload.state || {};
          state = {
            tasks: Array.isArray(next.tasks) ? next.tasks : [],
            projects: Array.isArray(next.projects) ? next.projects : [],
            sessions: Array.isArray(next.sessions) ? next.sessions : [],
            settings: { ...DEFAULT_SETTINGS, ...(next.settings || {}) },
          };
          today = isValidDate(payload.today) ? payload.today : localDate();
          status = "ready";
          pomodoroEngine.setSettings(state.settings);
          pomodoroEngine.setTasks(state.tasks);
          emit();
          return payload;
        } catch (cause) {
          status = "error";
          error = apiErrorText(cause);
          emit();
          throw cause;
        }
      }

      async function createTask(input) {
        try {
          const payload = await request("tasks/create", input);
          upsertTasks([payload.task]);
          emit();
          return payload.task;
        } catch (cause) {
          fail(cause);
          throw cause;
        }
      }

      async function updateTask(id, changes) {
        try {
          const payload = await request("tasks/update", { id, ...changes });
          upsertTasks([payload.task]);
          emit();
          return payload.task;
        } catch (cause) {
          fail(cause);
          throw cause;
        }
      }

      async function toggleTask(task, done) {
        try {
          const payload = await request("tasks/toggle", done === undefined ? { id: task.id } : { id: task.id, done });
          upsertTasks([payload.task]);
          if (payload.next) upsertTasks([payload.next]);
          if (Array.isArray(payload.clones) && payload.clones.length) upsertTasks(payload.clones);
          emit();
          if (payload.task && payload.task.done) {
            const message = t("toast.completed", { title: payload.task.title });
            if (payload.next && payload.next.due) {
              setToast({
                message,
                detail: t("toast.next", { date: formatDue(payload.next.due.date, today) }),
                tone: "ok",
              });
            } else {
              setToast({ message, tone: "ok" });
            }
          }
          return payload;
        } catch (cause) {
          fail(cause);
          throw cause;
        }
      }

      async function deleteTask(task) {
        try {
          const payload = await request("tasks/delete", { id: task.id });
          const deleted = Array.isArray(payload.tasks) ? payload.tasks : [task];
          removeTasks(deleted.map((item) => item.id));
          emit();
          setToast({
            message: t("toast.deleted", { title: task.title }),
            actionLabel: t("toast.undo"),
            onAction: async () => {
              try {
                const restored = await request("tasks/restore", { tasks: deleted });
                upsertTasks(Array.isArray(restored.tasks) ? restored.tasks : deleted);
                emit();
              } catch (cause) {
                fail(cause);
              }
            },
          });
        } catch (cause) {
          fail(cause);
          throw cause;
        }
      }

      async function moveTask(task, beforeId) {
        try {
          const payload = await request("tasks/move", { id: task.id, beforeId: beforeId === undefined ? null : beforeId });
          upsertTasks(Array.isArray(payload.tasks) ? payload.tasks : []);
          emit();
        } catch (cause) {
          fail(cause);
        }
      }

      async function createProject(name, color) {
        try {
          const payload = await request("projects/create", { name, color });
          state = { ...state, projects: [...state.projects, payload.project] };
          emit();
          return payload.project;
        } catch (cause) {
          fail(cause);
          throw cause;
        }
      }

      async function updateProject(id, changes) {
        try {
          const payload = await request("projects/update", { id, ...changes });
          state = { ...state, projects: state.projects.map((project) => (project.id === id ? payload.project : project)) };
          emit();
          return payload.project;
        } catch (cause) {
          fail(cause);
          throw cause;
        }
      }

      async function deleteProject(project) {
        const affected = state.tasks.filter((task) => task.projectId === project.id).map((task) => task.id);
        try {
          const payload = await request("projects/delete", { id: project.id, mode: "tasks-to-inbox" });
          state = {
            ...state,
            projects: state.projects.filter((item) => item.id !== project.id),
            tasks: state.tasks.map((task) =>
              task.projectId === project.id ? { ...task, projectId: null } : task,
            ),
          };
          emit();
          setToast({
            message: t("toast.projectDeleted", { name: project.name }),
            actionLabel: t("toast.undo"),
            onAction: async () => {
              try {
                const restored = await createProject(project.name, project.color);
                await Promise.all(affected.map((id) => updateTask(id, { projectId: restored.id })));
              } catch {
                /* 撤销失败时 store 已经弹过错误提示 */
              }
            },
          });
          return payload;
        } catch (cause) {
          fail(cause);
          throw cause;
        }
      }

      async function updateSettings(changes) {
        const payload = await request("settings", changes);
        state = { ...state, settings: { ...DEFAULT_SETTINGS, ...(payload.settings || {}) } };
        pomodoroEngine.setSettings(state.settings);
        emit();
        return payload.settings;
      }

      async function recordSession(input) {
        const payload = await request("sessions/record", input);
        state = {
          ...state,
          sessions: [...state.sessions, payload.session],
          tasks: payload.task
            ? state.tasks.map((task) => (task.id === payload.task.id ? payload.task : task))
            : state.tasks,
        };
        emit();
        return payload;
      }

      function ensureProject(name, color) {
        const existing = state.projects.find((project) => project.name.toLowerCase() === String(name).toLowerCase());
        if (existing) return Promise.resolve(existing);
        return createProject(name, color || "tomato");
      }

      return {
        getState: () => state,
        getToday: () => today,
        getStatus: () => status,
        getError: () => error,
        getToast: () => toast,
        subscribe(listener) {
          listeners.add(listener);
          return () => listeners.delete(listener);
        },
        load,
        createTask,
        updateTask,
        toggleTask,
        deleteTask,
        moveTask,
        createProject,
        updateProject,
        deleteProject,
        updateSettings,
        recordSession,
        ensureProject,
        setToast,
        toast: (message, options) => setToast({ message, tone: "info" }, options),
        dismissToast: () => setToast(null),
        fail,
        dispose() {
          if (toastTimer.id !== null) clearTimeout(toastTimer.id);
          toastTimer.id = null;
          listeners.clear();
          toast = null;
        },
      };
    }

    const pomodoroEngine = createPomodoroEngine();
    const dataStore = createDataStore();

    /* ============================ 派生：分组、筛选、统计 ============================ */

    function childrenOf(task, tasks) {
      return tasks
        .filter((item) => item.parentId === task.id)
        .sort((a, b) => (Number(a.order) || 0) - (Number(b.order) || 0));
    }

    function subtaskProgress(task, tasks) {
      const children = childrenOf(task, tasks);
      return { done: children.filter((child) => child.done).length, total: children.length };
    }

    function projectOf(task, projects) {
      return projects.find((project) => project.id === task.projectId) || null;
    }

    function priorityOf(task) {
      return typeof task.priority === "number" && task.priority >= 1 && task.priority <= 4 ? task.priority : 0;
    }

    function matchesQuery(task, query, projects) {
      if (!query) return true;
      const project = projectOf(task, projects);
      const haystack = [
        task.title,
        task.note,
        ...(Array.isArray(task.labels) ? task.labels : []),
        project ? project.name : "",
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(query.toLowerCase());
    }

    function matchesPriorities(task, priorities) {
      if (!priorities || priorities.length === 0) return true;
      return priorities.includes(priorityOf(task));
    }

    /**
     * 视图派生（UI 一致性规则见 contract 第 5 节）：
     * today 分逾期/今天两组；upcoming 按日期分组；inbox 无日期；
     * completed 按完成时间倒序取 200；project 只列该项目活跃任务；
     * calendar 返回所选日期（含已完成）的任务。
     */
    function deriveView(options) {
      const { tasks, projects, view, today, query, priorities, selectedDate } = options;
      const top = tasks.filter((task) => !task.parentId);
      const passes = (task) => matchesQuery(task, query, projects) && matchesPriorities(task, priorities);
      const groups = [];
      const push = (key, label, tone, list) => groups.push({ key, label, tone, tasks: list });

      if (view === "today") {
        const overdue = sortTasks(top.filter((task) => !task.done && task.due && task.due.date < today && passes(task)));
        const dueToday = sortTasks(top.filter((task) => !task.done && task.due && task.due.date === today && passes(task)));
        if (overdue.length) push("overdue", t("group.overdue"), "danger", overdue);
        if (dueToday.length) push("today", t("group.today"), "accent", dueToday);
      } else if (view === "upcoming") {
        const upcoming = top.filter((task) => !task.done && task.due && task.due.date > today && passes(task));
        const dates = [...new Set(upcoming.map((task) => task.due.date))].sort();
        dates.forEach((date) => {
          push(date, formatDue(date, today), "plain", sortTasks(upcoming.filter((task) => task.due.date === date)));
        });
      } else if (view === "inbox") {
        const inbox = sortTasks(top.filter((task) => !task.done && !task.due && passes(task)));
        if (inbox.length) push("inbox", t("group.inbox"), "plain", inbox);
      } else if (view === "completed") {
        const completed = tasks
          .filter((task) => task.done && passes(task))
          .sort((a, b) => (Number(b.doneAt) || 0) - (Number(a.doneAt) || 0))
          .slice(0, 200);
        const byDay = new Map();
        completed.forEach((task) => {
          const key = task.doneAt ? localDate(task.doneAt) : today;
          if (!byDay.has(key)) byDay.set(key, []);
          byDay.get(key).push(task);
        });
        [...byDay.keys()].forEach((key) => push(key, formatDue(key, today), "muted", byDay.get(key)));
      } else if (view.startsWith("project:")) {
        const projectId = view.slice("project:".length);
        const project = projects.find((item) => item.id === projectId);
        const list = sortTasks(top.filter((task) => !task.done && task.projectId === projectId && passes(task)));
        if (list.length) push(projectId, project ? project.name : t("group.project"), "plain", list);
      } else if (view.startsWith("calendar:")) {
        if (selectedDate) {
          const dayTasks = tasks
            .filter((task) => task.due && task.due.date === selectedDate && passes(task))
            .sort((a, b) => Number(a.done) - Number(b.done) || (Number(a.order) || 0) - (Number(b.order) || 0));
          if (dayTasks.length) push(selectedDate, formatDue(selectedDate, today), "plain", dayTasks);
        }
      } else if (view === "search") {
        const found = sortTasks(
          tasks.filter((task) => matchesQuery(task, query, projects) && matchesPriorities(task, priorities)),
        );
        const active = found.filter((task) => !task.done);
        const done = found.filter((task) => task.done);
        if (active.length) push("search", t("group.searchResults"), "plain", active);
        if (done.length) push("search-done", t("group.completedSection"), "muted", done);
      }
      return { groups, total: groups.reduce((sum, group) => sum + group.tasks.length, 0) };
    }

    function countToday(tasks, today) {
      const top = tasks.filter((task) => !task.parentId && !task.done && task.due && task.due.date <= today);
      return top.length;
    }

    function viewTitle(view, projects) {
      if (view === "today") return t("view.today");
      if (view === "upcoming") return t("view.upcoming");
      if (view === "inbox") return t("view.inbox");
      if (view === "completed") return t("view.completed");
      if (view === "calendar" || view.startsWith("calendar:")) return t("view.calendar");
      if (view === "pomodoro") return t("view.pomodoro");
      if (view === "search") return t("view.search");
      if (view.startsWith("project:")) {
        const project = projects.find((item) => item.id === view.slice("project:".length));
        return project ? project.name : t("view.projects");
      }
      return t("view.today");
    }

    /** 近 7 天番茄统计 + 连续天数。 */
    function computeStats(sessions, today, goal) {
      const list = Array.isArray(sessions) ? sessions : [];
      const dayKey = (session) => {
        const stamp = Number(session.endedAt || session.startedAt) || 0;
        return localDate(stamp);
      };
      const byDay = new Map();
      list.forEach((session) => {
        const key = dayKey(session);
        byDay.set(key, (byDay.get(key) || 0) + 1);
      });
      const days = [];
      for (let index = 6; index >= 0; index -= 1) {
        const date = addDays(today, -index);
        days.push({ date, count: byDay.get(date) || 0 });
      }
      const todayCount = byDay.get(today) || 0;
      const todayMinutes = list
        .filter((session) => dayKey(session) === today)
        .reduce((sum, session) => sum + (Number(session.minutes) || 0), 0);
      let streak = 0;
      for (let index = 0; index < 400; index += 1) {
        const date = addDays(today, -index);
        const count = byDay.get(date) || 0;
        if (count > 0) streak += 1;
        else if (index === 0) continue;
        else break;
      }
      const goalValue = Number(goal) || 8;
      return {
        todayCount,
        todayMinutes,
        days,
        streak,
        goal: goalValue,
        goalRatio: Math.min(1, todayCount / goalValue),
        total: list.length,
      };
    }

    /* ============================ 图标 ============================ */

    const ICON_PATHS = {
      panel: "M4 5.5A1.5 1.5 0 0 1 5.5 4h13A1.5 1.5 0 0 1 20 5.5v13a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 18.5v-13ZM8.2 7.6l2.1 2.1 4.4-4.4",
      today: "M4.5 6.5h15M8 3.6v3.2M16 3.6v3.2M5.5 5h13a1 1 0 0 1 1 1v12.5a1 1 0 0 1-1 1h-13a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1ZM8 11h2.4M8 14.6h2.4M13.6 11H16M13.6 14.6H16",
      upcoming: "M4.5 6.5h15M8 3.6v3.2M16 3.6v3.2M5.5 5h13a1 1 0 0 1 1 1v12.5a1 1 0 0 1-1 1h-13a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1ZM12 10v4l2.6 1.6",
      inbox: "M4.4 13.2 6.6 6a1.6 1.6 0 0 1 1.5-1.1h7.8A1.6 1.6 0 0 1 17.4 6l2.2 7.2v3.6a1.4 1.4 0 0 1-1.4 1.4H5.8a1.4 1.4 0 0 1-1.4-1.4v-3.6ZM4.4 13.2h4l.9 1.9h5.4l.9-1.9h4",
      completed: "M5 12.6 9.2 17 19 6.6",
      projects: "M4 7.2A1.2 1.2 0 0 1 5.2 6h3.6l1.6 2h8.4A1.2 1.2 0 0 1 20 9.2v7.6a1.2 1.2 0 0 1-1.2 1.2H5.2A1.2 1.2 0 0 1 4 16.8V7.2Z",
      calendar: "M4.5 6.5h15M8 3.6v3.2M16 3.6v3.2M5.5 5h13a1 1 0 0 1 1 1v12.5a1 1 0 0 1-1 1h-13a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1ZM4 10h16",
      pomodoro: "M12 8.4c-3.4 0-6.1 2.6-6.1 5.9S8.6 20 12 20s6.1-2.4 6.1-5.7-2.7-5.9-6.1-5.9ZM12 8.4c0-2 1.3-3.4 3-3.9M12 14.3v2.9M9.4 3.6h5.2M17.6 7.6l1.6-1.6",
      plus: "M12 5.6v12.8M5.6 12h12.8",
      search: "M10.8 4.4a6.4 6.4 0 1 1 0 12.8 6.4 6.4 0 0 1 0-12.8ZM15.6 15.6 20 20",
      close: "M6.4 6.4 17.6 17.6M17.6 6.4 6.4 17.6",
      repeat: "M7 7.2h9.2l-2.4-2.4M17 16.8H7.8l2.4 2.4M16.2 7.2a4.9 4.9 0 0 1 1.4 6M7.8 16.8a4.9 4.9 0 0 1-1.4-6",
      up: "M12 18.6V5.4M6.4 11 12 5.4 17.6 11",
      down: "M12 5.4v13.2M6.4 13 12 18.6 17.6 13",
      trash: "M5.6 7.4h12.8M9.6 7.4V5.2h4.8v2.2M7.4 7.4l.8 11.4h7.6l.8-11.4M10.4 10.6v5.4M13.6 10.6v5.4",
      play: "M8.4 5.6 18.4 12 8.4 18.4V5.6Z",
      pause: "M9 5.6v12.8M15 5.6v12.8",
      skip: "M7 5.6 15 12 7 18.4V5.6ZM17.6 5.6v12.8",
      stop: "M7.4 7.4h9.2v9.2H7.4V7.4Z",
      expand: "M4.6 9.4V4.6h4.8M19.4 14.6v4.8h-4.8M4.6 4.6l5.6 5.6M19.4 19.4l-5.6-5.6",
      collapse: "M9.4 4.6v4.8H4.6M14.6 19.4v-4.8h4.8M14.6 4.6l-5.6 5.6M9.4 19.4l5.6-5.6",
      chevron: "M9.4 5.6 15.8 12 9.4 18.4",
      check: "M5 12.4 9.4 16.8 19 7.2",
      clock: "M12 4.6a7.4 7.4 0 1 1 0 14.8 7.4 7.4 0 0 1 0-14.8ZM12 8.2V12l2.6 1.8",
      note: "M5.4 5.4h13.2v9.4l-4 4H5.4V5.4ZM14.6 18.8v-4h4",
    };

    function Icon(props) {
      const name = props.name;
      const size = Number.isFinite(props.size) ? props.size : 16;
      return h(
        "svg",
        {
          className: props.className,
          width: size,
          height: size,
          viewBox: "0 0 24 24",
          fill: "none",
          stroke: "currentColor",
          strokeWidth: props.fill ? 0 : 1.7,
          strokeLinecap: "round",
          strokeLinejoin: "round",
          "aria-hidden": "true",
          focusable: "false",
        },
        h("path", { d: ICON_PATHS[name] || ICON_PATHS.panel }),
      );
    }

    /** 插件 Logo：与 icon.svg 同源的纯色绿方块 + 对勾，用于品牌行与侧边栏图标。 */
    function Logo(props) {
      const size = props && Number.isFinite(props.size) ? props.size : 24;
      return h(
        "svg",
        {
          className: props && props.className,
          width: size,
          height: size,
          viewBox: "0 0 256 256",
          role: "img",
          "aria-hidden": "true",
          focusable: "false",
        },
        h("rect", { x: "8", y: "8", width: "240", height: "240", rx: "60", fill: "#1fa774" }),
        h("path", {
          d: "M64 138 L100 174 L188 86",
          fill: "none",
          stroke: "#ffffff",
          strokeWidth: "24",
          strokeLinecap: "round",
          strokeLinejoin: "round",
        }),
      );
    }

    /**
     * 侧边栏图标：未开始的番茄不打扰；开始过就把剩余分钟数贴在图标右上角。
     * 宿主展开侧栏时传 size=16，收起成图标轨时传 size=18，用它区分两种排版。
     */
    function PanelIcon(props) {
      const size = props && Number.isFinite(props.size) ? props.size : 18;
      const wide = size <= 16;
      const [, force] = useState(0);
      useEffect(() => pomodoroEngine.subscribe(() => force((value) => value + 1)), []);
      const pom = pomodoroEngine.get();
      const total = modeMinutes(pom.mode, pomodoroEngine.settings()) * 60000;
      const raw = pom.running && Number.isFinite(pom.endsAt) ? pom.endsAt - Date.now() : pom.remainingMs;
      const remaining = Number.isFinite(raw) ? Math.max(0, raw) : total;
      const inProgress = pom.running || remaining < total;
      const minutes = Math.max(1, Math.ceil(remaining / 60000));
      return h(
        "span",
        { className: `todo-panel-icon${wide ? " is-wide" : ""}` },
        h(Logo, { size }),
        inProgress
          ? h(
              "span",
              {
                className: `todo-panel-badge${pom.running ? " is-running" : ""}`,
                "aria-hidden": "true",
              },
              String(minutes),
            )
          : null,
      );
    }

    /* ============================ 小组件 ============================ */

    function useStore(store) {
      const [, force] = useState(0);
      useEffect(() => {
        const unsubscribe = store.subscribe(() => force((value) => value + 1));
        return typeof unsubscribe === "function" ? unsubscribe : undefined;
      }, [store]);
      return store.getState();
    }

    function useLocaleTick() {
      const [, force] = useState(0);
      useEffect(() => {
        if (!localeApi || typeof localeApi.subscribe !== "function") return undefined;
        try {
          const unsubscribe = localeApi.subscribe(() => force((value) => value + 1));
          return typeof unsubscribe === "function" ? unsubscribe : undefined;
        } catch {
          return undefined;
        }
      }, []);
    }

    function PriorityBar(props) {
      const priority = props.priority;
      if (!priority) return null;
      return h("span", {
        className: `todo-priority-bar todo-priority-p${priority}`,
        "aria-hidden": "true",
        title: t("task.priority", { n: priority }),
      });
    }

    function ProjectDot(props) {
      if (!props.color) return null;
      return h("span", { className: `todo-dot todo-color-${props.color}`, "aria-hidden": "true" });
    }

    function Progress(props) {
      const total = Number(props.total) || 0;
      const done = Number(props.done) || 0;
      const ratio = total > 0 ? Math.min(1, done / total) : 0;
      return h(
        "span",
        { className: "todo-progress", role: "img", "aria-label": t("topbar.progress", { done, total }) },
        h("span", { className: "todo-progress-track" }, h("span", { className: "todo-progress-fill", style: { width: `${ratio * 100}%` } })),
        h("span", { className: "todo-progress-text" }, t("topbar.progress", { done, total })),
      );
    }

    function Empty(props) {
      return h(
        "div",
        { className: "todo-empty" },
        h(Icon, { name: props.icon || "inbox", size: 22 }),
        h("p", null, props.text),
      );
    }

    /* ============================ 快速添加 ============================ */

    function QuickAdd(props) {
      const { projects, defaults, onCreate, autoFocus } = props;
      const [value, setValue] = useState("");
      const [error, setError] = useState("");
      const inputRef = useRef(null);

      const parsed = useMemo(
        () =>
          parseQuickAdd(value, {
            today: defaults.today,
            projects: projects.map((project) => project.name),
          }),
        [value, defaults.today, projects],
      );

      useEffect(() => {
        if (autoFocus && inputRef.current) inputRef.current.focus();
      }, [autoFocus]);

      const due = parsed.due || defaults.due || null;
      const chips = [];
      if (due) chips.push({ key: "due", text: formatDateTime(due, defaults.today), tone: "due" });
      if (parsed.priority) chips.push({ key: "priority", text: `P${parsed.priority}`, tone: `p${parsed.priority}` });
      if (parsed.project || defaults.projectName) {
        chips.push({ key: "project", text: `#${parsed.project || defaults.projectName}`, tone: "project" });
      }
      if (parsed.recurrence) chips.push({ key: "recurrence", text: t(`rec.${parsed.recurrence.freq}`), tone: "muted" });
      if (parsed.labels.length) chips.push({ key: "labels", text: parsed.labels.map((label) => `#${label}`).join(" "), tone: "muted" });

      const submit = () => {
        if (!parsed.title) {
          setError(t("quick.invalid"));
          return;
        }
        setError("");
        onCreate({
          title: parsed.title,
          due,
          priority: parsed.priority,
          project: parsed.project,
          labels: parsed.labels,
          recurrence: parsed.recurrence,
        });
        setValue("");
      };

      return h(
        "div",
        { className: "todo-quick" },
        h(
          "div",
          { className: `todo-quick-row${error ? " is-error" : ""}` },
          h(Icon, { name: "plus", size: 15, className: "todo-quick-plus" }),
          h("input", {
            ref: inputRef,
            className: "todo-quick-input",
            value,
            placeholder: props.placeholder || t("quick.placeholder"),
            "aria-label": t("quick.aria"),
            onChange: (event) => {
              setValue(event.target.value);
              if (error) setError("");
            },
            onKeyDown: (event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                submit();
              } else if (event.key === "Escape") {
                setValue("");
                setError("");
              }
            },
          }),
          h(
            "button",
            { type: "button", className: "todo-quick-submit", onClick: submit, title: t("quick.add") },
            h(Icon, { name: "check", size: 15 }),
            h("span", null, t("quick.add")),
          ),
        ),
        h(
          "div",
          { className: "todo-quick-foot" },
          error
            ? h("span", { className: "todo-quick-error" }, error)
            : chips.length
              ? h(
                  "span",
                  { className: "todo-quick-chips" },
                  chips.map((chip) =>
                    h("span", { key: chip.key, className: `todo-chip todo-chip-${chip.tone}` }, chip.text),
                  ),
                )
              : h("span", { className: "todo-quick-hint" }, t("quick.hint")),
        ),
      );
    }

    /* ============================ 任务行 ============================ */

    function TaskRow(props) {
      const { task, tasks, projects, today, ui } = props;
      const [expanded, setExpanded] = useState(true);
      const children = useMemo(() => childrenOf(task, tasks), [task, tasks]);
      const progress = children.length ? subtaskProgress(task, tasks) : null;
      const project = projectOf(task, projects);
      const overdue = !task.done && isOverdue(task.due, today);
      const priority = priorityOf(task);
      const pinned = task.id === ui.focusedTaskId;

      const meta = [];
      if (task.due) {
        meta.push(
          h(
            "span",
            { key: "due", className: `todo-chip todo-chip-due${overdue ? " is-overdue" : ""}` },
            h(Icon, { name: "clock", size: 12 }),
            h("span", null, formatDateTime(task.due, today)),
          ),
        );
      }
      if (project) {
        meta.push(
          h(
            "span",
            { key: "project", className: "todo-chip todo-chip-project" },
            h(ProjectDot, { color: project.color }),
            h("span", null, project.name),
          ),
        );
      }
      if (Array.isArray(task.labels)) {
        task.labels.forEach((label) => {
          meta.push(h("span", { key: `label-${label}`, className: "todo-chip todo-chip-label" }, `#${label}`));
        });
      }
      if (task.recurrence) {
        meta.push(
          h(
            "span",
            { key: "recurrence", className: "todo-chip todo-chip-muted", title: recurrenceLabel(task.recurrence) },
            h(Icon, { name: "repeat", size: 12 }),
            h("span", null, recurrenceLabel(task.recurrence)),
          ),
        );
      }
      if (task.pomodoros > 0) {
        meta.push(
          h(
            "span",
            { key: "pomodoros", className: "todo-chip todo-chip-pom" },
            h(Icon, { name: "pomodoro", size: 12 }),
            h("span", null, String(task.pomodoros)),
          ),
        );
      }
      if (progress) {
        meta.push(
          h(
            "button",
            {
              key: "subtasks",
              type: "button",
              className: "todo-chip todo-chip-button",
              onClick: () => setExpanded((value) => !value),
              title: t("task.subtasksToggle"),
            },
            h(Icon, { name: expanded ? "chevron" : "chevron", size: 12, className: expanded ? "todo-chevron is-open" : "todo-chevron" }),
            h("span", null, t("task.subtasks", { done: progress.done, total: progress.total })),
          ),
        );
      }

      return h(
        "li",
        { className: `todo-item${task.done ? " is-done" : ""}${pinned ? " is-focused" : ""}` },
        h(PriorityBar, { priority }),
        h("button", {
          type: "button",
          className: `todo-check${task.done ? " is-checked" : ""}`,
          onClick: () => ui.onToggle(task),
          title: task.done ? t("task.toggleUndone") : t("task.toggleDone"),
          "aria-label": task.done ? t("task.toggleUndone") : t("task.toggleDone"),
          "aria-pressed": Boolean(task.done),
        }, task.done ? h(Icon, { name: "check", size: 13 }) : null),
        h(
          "div",
          { className: "todo-item-main" },
          h(
            "div",
            { className: "todo-item-line" },
            h(
              "button",
              { type: "button", className: "todo-item-title", onClick: () => ui.onOpen(task), title: t("task.open") },
              task.title,
            ),
            priority ? h("span", { className: `todo-priority-label todo-priority-p${priority}` }, `P${priority}`) : null,
          ),
          meta.length ? h("div", { className: "todo-item-meta" }, meta) : null,
          progress && expanded
            ? h(
                "ul",
                { className: "todo-sublist" },
                children.map((child) =>
                  h(
                    "li",
                    { key: child.id, className: `todo-subitem${child.done ? " is-done" : ""}` },
                    h("button", {
                      type: "button",
                      className: `todo-check todo-check-sm${child.done ? " is-checked" : ""}`,
                      onClick: () => ui.onToggle(child),
                      "aria-label": child.done ? t("task.toggleUndone") : t("task.toggleDone"),
                      "aria-pressed": Boolean(child.done),
                    }, child.done ? h(Icon, { name: "check", size: 11 }) : null),
                    h(
                      "button",
                      { type: "button", className: "todo-subitem-title", onClick: () => ui.onOpen(child) },
                      child.title,
                    ),
                  ),
                ),
              )
            : null,
        ),
        h(
          "div",
          { className: "todo-item-actions" },
          h(
            "button",
            { type: "button", className: "todo-icon-btn", onClick: () => ui.onMove(task, -1), title: t("task.moveUp"), "aria-label": t("task.moveUp") },
            h(Icon, { name: "up", size: 13 }),
          ),
          h(
            "button",
            { type: "button", className: "todo-icon-btn", onClick: () => ui.onMove(task, 1), title: t("task.moveDown"), "aria-label": t("task.moveDown") },
            h(Icon, { name: "down", size: 13 }),
          ),
          h(
            "button",
            { type: "button", className: "todo-icon-btn", onClick: () => ui.onFocus(task), title: t("task.focus"), "aria-label": t("task.focus") },
            h(Icon, { name: "play", size: 13 }),
          ),
          h(
            "button",
            { type: "button", className: "todo-icon-btn todo-icon-danger", onClick: () => ui.onDelete(task), title: t("detail.delete"), "aria-label": t("detail.delete") },
            h(Icon, { name: "trash", size: 13 }),
          ),
        ),
      );
    }

    function recurrenceLabel(recurrence) {
      if (!recurrence || !recurrence.freq) return "";
      const interval = Number(recurrence.interval) || 1;
      if (interval <= 1) return t(`rec.${recurrence.freq}`);
      if (recurrence.freq === "daily") return t("rec.everyDays", { n: interval });
      if (recurrence.freq === "weekly") return t("rec.everyWeeks", { n: interval });
      if (recurrence.freq === "monthly") return t("rec.everyMonths", { n: interval });
      return t("rec.weekday");
    }

    function TaskList(props) {
      const { view, groups, total, tasks, projects, today, ui } = props;
      if (total === 0) {
        const key =
          view === "today"
            ? "empty.today"
            : view === "upcoming"
              ? "empty.upcoming"
              : view === "inbox"
                ? "empty.inbox"
                : view === "completed"
                  ? "empty.completed"
                  : view.startsWith("project:")
                    ? "empty.project"
                    : view === "search"
                      ? "empty.search"
                      : view.startsWith("calendar:")
                        ? "empty.day"
                        : ui.hasFilters
                          ? "empty.filtered"
                          : "empty.today";
        return h(Empty, { icon: view === "search" ? "search" : "inbox", text: t(key) });
      }
      return h(
        "div",
        { className: "todo-groups" },
        groups.map((group) =>
          h(
            "section",
            { key: group.key, className: `todo-group todo-group-${group.tone}` },
            h(
              "header",
              { className: "todo-group-head" },
              h("h3", null, group.label),
              h("span", { className: "todo-group-count" }, group.tasks.length),
            ),
            h(
              "ul",
              { className: "todo-list" },
              group.tasks.map((task) =>
                h(TaskRow, { key: task.id, task, tasks, projects, today, ui }),
              ),
            ),
          ),
        ),
      );
    }

    /* ============================ 左栏 ============================ */

    const NAV_ITEMS = [
      { id: "today", icon: "today" },
      { id: "upcoming", icon: "upcoming" },
      { id: "inbox", icon: "inbox" },
      { id: "completed", icon: "completed" },
    ];

    const TOOL_ITEMS = [
      { id: "calendar", icon: "calendar" },
      { id: "pomodoro", icon: "pomodoro" },
    ];

    const PROJECT_COLORS = ["tomato", "amber", "lime", "sky", "grape", "slate"];

    function Sidebar(props) {
      const { view, setView, projects, counts, stats, today, ui } = props;
      const [adding, setAdding] = useState(false);
      const [name, setName] = useState("");
      const [color, setColor] = useState("tomato");
      const [pendingDelete, setPendingDelete] = useState(null);
      const inputRef = useRef(null);

      useEffect(() => {
        if (adding && inputRef.current) inputRef.current.focus();
      }, [adding]);

      const submitProject = () => {
        const trimmed = name.trim();
        if (!trimmed) {
          setAdding(false);
          return;
        }
        ui.onCreateProject(trimmed, color);
        setName("");
        setColor("tomato");
        setAdding(false);
      };

      const navButton = (item, count) =>
        h(
          "button",
          {
            key: item.id,
            type: "button",
            className: `todo-nav-item${view === item.id ? " is-active" : ""}`,
            onClick: () => setView(item.id),
          },
          h(Icon, { name: item.icon, size: 16 }),
          h("span", { className: "todo-nav-label" }, t(`view.${item.id}`)),
          count ? h("span", { className: "todo-nav-count" }, count > 99 ? "99+" : count) : null,
        );

      return h(
        "aside",
        { className: "todo-nav" },
        h(
          "div",
          { className: "todo-brand" },
          h("span", { className: "todo-brand-mark", "aria-hidden": "true" }, h(Logo, { size: 30 })),
          h(
            "span",
            { className: "todo-brand-text" },
            h("strong", null, t("panel.title")),
            h("span", null, t("panel.subtitle")),
          ),
        ),
        h("div", { className: "todo-nav-section" }, h("h4", null, t("nav.title")), NAV_ITEMS.map((item) => navButton(item, counts[item.id]))),
        h("div", { className: "todo-nav-section" }, TOOL_ITEMS.map((item) => navButton(item, 0))),
        h(
          "div",
          { className: "todo-nav-section todo-nav-projects" },
          h(
            "div",
            { className: "todo-nav-head" },
            h("h4", null, t("nav.projects")),
            h(
              "button",
              {
                type: "button",
                className: "todo-icon-btn",
                onClick: () => setAdding((value) => !value),
                title: t("nav.addProject"),
                "aria-label": t("nav.addProject"),
              },
              h(Icon, { name: adding ? "close" : "plus", size: 14 }),
            ),
          ),
          adding
            ? h(
                "div",
                { className: "todo-project-form" },
                h("input", {
                  ref: inputRef,
                  className: "todo-input",
                  value: name,
                  placeholder: t("nav.projectPlaceholder"),
                  onChange: (event) => setName(event.target.value),
                  onKeyDown: (event) => {
                    if (event.key === "Enter") submitProject();
                    if (event.key === "Escape") {
                      setAdding(false);
                      setName("");
                    }
                  },
                }),
                h(
                  "div",
                  { className: "todo-color-row" },
                  PROJECT_COLORS.map((value) =>
                    h("button", {
                      key: value,
                      type: "button",
                      className: `todo-color-swatch todo-color-${value}${color === value ? " is-active" : ""}`,
                      onClick: () => setColor(value),
                      title: t(`project.color.${value}`),
                      "aria-label": t(`project.color.${value}`),
                    }),
                  ),
                ),
                h(
                  "div",
                  { className: "todo-project-form-actions" },
                  h("button", { type: "button", className: "todo-btn todo-btn-sm", onClick: submitProject }, t("project.create")),
                  h(
                    "button",
                    {
                      type: "button",
                      className: "todo-btn todo-btn-sm todo-btn-ghost",
                      onClick: () => {
                        setAdding(false);
                        setName("");
                      },
                    },
                    t("project.cancel"),
                  ),
                ),
              )
            : null,
          projects.length === 0
            ? h("p", { className: "todo-nav-empty" }, t("nav.noProjects"))
            : h(
                "ul",
                { className: "todo-project-list" },
                projects.map((project) => {
                  const active = view === `project:${project.id}`;
                  return h(
                    "li",
                    { key: project.id, className: `todo-project${active ? " is-active" : ""}` },
                    h(
                      "button",
                      {
                        type: "button",
                        className: "todo-project-main",
                        onClick: () => setView(`project:${project.id}`),
                        onDoubleClick: () => {
                          const next = typeof window !== "undefined" && window.prompt ? window.prompt(t("nav.projectPlaceholder"), project.name) : null;
                          if (next && next.trim()) ui.onUpdateProject(project.id, { name: next.trim() });
                        },
                        title: t("nav.rename"),
                      },
                      h(ProjectDot, { color: project.color }),
                      h("span", { className: "todo-project-name" }, project.name),
                      counts[`project:${project.id}`] ? h("span", { className: "todo-nav-count" }, counts[`project:${project.id}`]) : null,
                    ),
                    h(
                      "span",
                      { className: "todo-project-actions" },
                      h(
                        "button",
                        {
                          type: "button",
                          className: "todo-icon-btn",
                          onClick: () => ui.onCycleProjectColor(project),
                          title: t("nav.projectColor"),
                          "aria-label": t("nav.projectColor"),
                        },
                        h(ProjectDot, { color: project.color }),
                      ),
                      pendingDelete === project.id
                        ? h(
                            "button",
                            {
                              type: "button",
                              className: "todo-icon-btn todo-icon-danger",
                              onClick: () => {
                                setPendingDelete(null);
                                ui.onDeleteProject(project);
                              },
                              title: t("nav.projectDeleteConfirm", { name: project.name }),
                              "aria-label": t("nav.projectDelete"),
                            },
                            h(Icon, { name: "check", size: 13 }),
                          )
                        : h(
                            "button",
                            {
                              type: "button",
                              className: "todo-icon-btn",
                              onClick: () => setPendingDelete(project.id),
                              title: t("nav.projectDelete"),
                              "aria-label": t("nav.projectDelete"),
                            },
                            h(Icon, { name: "trash", size: 13 }),
                          ),
                      ),
                  );
                }),
              ),
        ),
        h(
          "div",
          { className: "todo-nav-stats" },
          h(
            "div",
            { className: "todo-nav-stats-head" },
            h("span", null, t("pom.today")),
            h("strong", null, stats.todayCount),
            h("span", { className: "todo-nav-goal" }, t("pom.goal", { n: stats.goal })),
          ),
          h(
            "div",
            { className: "todo-goal-track", role: "img", "aria-label": t("topbar.progress", { done: stats.todayCount, total: stats.goal }) },
            h("span", { className: "todo-goal-fill", style: { width: `${stats.goalRatio * 100}%` } }),
          ),
          stats.todayCount >= stats.goal
            ? h("p", { className: "todo-nav-goal-done" }, t("pom.goalDone"))
            : h(
                "p",
                { className: "todo-nav-stats-minutes" },
                `${t("pom.todayMinutes")} ${t("pom.minutesShort", { n: stats.todayMinutes })}`,
              ),
          h(
            "div",
            { className: "todo-week" },
            stats.days.map((day) =>
              h(
                "span",
                { key: day.date, className: "todo-week-col", title: `${formatDue(day.date, today)} · ${day.count}` },
                h("span", {
                  className: "todo-week-bar",
                  style: { height: `${Math.max(day.count ? 18 : 6, Math.min(100, (day.count / Math.max(1, stats.goal)) * 100))}%` },
                }),
                h("span", { className: "todo-week-day" }, t(`weekday.${weekdayOf(day.date)}`)),
              ),
            ),
          ),
          stats.streak > 1 ? h("p", { className: "todo-nav-streak" }, t("pom.streak", { n: stats.streak })) : null,
        ),
      );
    }

    /* ============================ 顶栏 ============================ */

    function PomodoroCapsule(props) {
      const { state, onToggle, onOpen, remaining } = props;
      const modeLabel = t(MODE_KEYS[state.mode]);
      return h(
        "div",
        { className: `todo-capsule${state.running ? " is-running" : ""} todo-mode-${state.mode}` },
        h(
          "button",
          { type: "button", className: "todo-capsule-main", onClick: onOpen, title: t("pom.open") },
          h(Icon, { name: "pomodoro", size: 14 }),
          h("span", { className: "todo-capsule-mode" }, modeLabel),
          h("span", { className: "todo-capsule-time" }, formatClock(remaining)),
        ),
        h(
          "button",
          {
            type: "button",
            className: "todo-icon-btn todo-capsule-btn",
            onClick: onToggle,
            title: state.running ? t("pom.pause") : t("pom.start"),
            "aria-label": state.running ? t("pom.pause") : t("pom.start"),
          },
          h(Icon, { name: state.running ? "pause" : "play", size: 13 }),
        ),
      );
    }

    /**
     * 全局快捷键：开始/暂停番茄钟、打开待办面板。
     * 宿主 shortcuts 服务缺失或被别的插件占用同一个组合时静默跳过，不影响插件其余部分。
     */
    const SHORTCUT_TRIES = ["KeyP", "KeyJ", "KeyK"];

    function registerShortcut(shortcuts, command) {
      for (const code of SHORTCUT_TRIES) {
        const modifiers = ["primary", "alt"];
        try {
          return shortcuts.register({
            ...command,
            defaults: {
              "desktop:macos": { code, modifiers },
              "desktop:windows": { code, modifiers },
              "desktop:linux": { code, modifiers },
              "web:macos": { code, modifiers },
              "web:windows": { code, modifiers },
            },
          });
        } catch {
          /* 这个组合被占用，换下一个 */
        }
      }
      return null;
    }

    function installShortcuts(ctx) {
      if (!ctx || typeof ctx.get !== "function") return () => {};
      const disposers = [];
      let timer = null;
      let attempts = 0;

      const tryInstall = () => {
        timer = null;
        const shortcuts = ctx.get("shortcuts");
        if (!shortcuts || typeof shortcuts.register !== "function") {
          attempts += 1;
          if (attempts <= 8 && typeof setTimeout === "function") timer = setTimeout(tryInstall, 300);
          return;
        }
        const toggle = registerShortcut(shortcuts, {
          id: "dsh-todo.pomodoro.toggle",
          label: () => t("shortcut.togglePomodoro"),
          aliases: ["pomodoro", "timer", "focus"],
          regions: ["page", "editable"],
          modals: [],
          resolve: () => ({
            status: "handled",
            run: () => {
              requestNotifyPermission();
              pomodoroEngine.dispatch({ type: "toggle" });
            },
          }),
        });
        if (toggle) disposers.push(toggle);

        const open = registerShortcut(shortcuts, {
          id: "dsh-todo.panel.open",
          label: () => t("shortcut.openPanel"),
          aliases: ["todo", "tasks", "inbox"],
          regions: ["page", "editable"],
          modals: [],
          resolve: () => ({ status: "handled", run: () => openPanel() }),
        });
        if (open) disposers.push(open);
      };

      tryInstall();

      return () => {
        if (timer !== null && typeof clearTimeout === "function") clearTimeout(timer);
        timer = null;
        disposers.forEach((dispose) => {
          try {
            dispose();
          } catch {
            /* 服务已经卸载时忽略 */
          }
        });
        disposers.length = 0;
      };
    }

    /** 把主面板切到待办；layout 服务缺失时安静失败。 */
    function openPanel() {
      try {
        const layout = clientCtx && typeof clientCtx.get === "function" ? clientCtx.get("layout") : null;
        if (layout && typeof layout.selectPanel === "function") {
          layout.selectPanel(PANEL_ID);
        }
      } catch {
        /* 没有 layout 服务（例如预览页）时只保留当前页面 */
      }
    }

    /**
     * 输入框下方的常驻番茄钟条：在任何会话里都能看到倒计时，并直接开始 / 暂停 / 跳过。
     * 点击标题打开待办面板，状态与主面板共用同一个 pomodoroEngine。
     */
    function PomodoroDock() {
      useLocaleTick();
      const data = useStore(dataStore);
      const [, force] = useState(0);
      useEffect(() => {
        dataStore.load().catch(() => {});
        const release = pomodoroEngine.retain();
        const unsubscribe = pomodoroEngine.subscribe(() => force((value) => value + 1));
        return () => {
          unsubscribe();
          release();
        };
      }, []);

      const settings = normalizedSettings(data.settings || DEFAULT_SETTINGS);
      pomodoroEngine.setSettings(settings);
      pomodoroEngine.setTasks(data.tasks);

      const pom = pomodoroEngine.get();
      const task = pom.taskId ? data.tasks.find((item) => item.id === pom.taskId) : null;
      const total = Math.max(1, modeMinutes(pom.mode, settings) * 60000);
      const remaining = pomodoroRemaining(pom, Date.now());
      const ratio = Math.min(1, Math.max(0, 1 - remaining / total));
      const circumference = 2 * Math.PI * 6.5;

      function startFocus() {
        requestNotifyPermission();
        pomodoroEngine.dispatch({ type: "toggle" });
      }

      return h(
        "div",
        { className: `todo-dock${pom.running ? " is-running" : ""} todo-dock-${pom.mode}` },
        h(
          "button",
          {
            type: "button",
            className: "todo-dock-main",
            onClick: () => openPanel(),
            title: t("pom.open"),
            "aria-label": t("pom.open"),
          },
          h(
            "span",
            { className: "todo-dock-ring", "aria-hidden": "true" },
            h(
              "svg",
              { width: 16, height: 16, viewBox: "0 0 16 16", focusable: "false" },
              h("circle", {
                cx: 8,
                cy: 8,
                r: 6.5,
                fill: "none",
                stroke: "currentColor",
                strokeOpacity: 0.22,
                strokeWidth: 2,
              }),
              h("circle", {
                cx: 8,
                cy: 8,
                r: 6.5,
                fill: "none",
                stroke: "var(--dsw-alias-state-success-primary)",
                strokeWidth: 2,
                strokeLinecap: "round",
                strokeDasharray: `${circumference} ${circumference}`,
                strokeDashoffset: String(circumference * (1 - ratio)),
                transform: "rotate(-90 8 8)",
              }),
            ),
          ),
          h("span", { className: "todo-dock-mode" }, t(MODE_KEYS[pom.mode])),
          h("span", { className: "todo-dock-time" }, formatClock(remaining)),
          task
            ? h("span", { className: "todo-dock-task", title: task.title }, task.title)
            : h("span", { className: "todo-dock-task todo-dock-task-empty" }, t("pom.noTask")),
        ),
        h(
          "button",
          {
            type: "button",
            className: "todo-dock-btn",
            onClick: startFocus,
            title: pom.running ? t("pom.pause") : t("pom.start"),
            "aria-label": pom.running ? t("pom.pause") : t("pom.start"),
          },
          h(Icon, { name: pom.running ? "pause" : "play", size: 12 }),
        ),
        pom.running
          ? h(
              "button",
              {
                type: "button",
                className: "todo-dock-btn",
                onClick: () => pomodoroEngine.dispatch({ type: "skip" }),
                title: t("pom.skip"),
                "aria-label": t("pom.skip"),
              },
              h(Icon, { name: "skip", size: 12 }),
            )
          : null,
      );
    }

    function TopBar(props) {
      const { view, projects, today, stats, pomodoro, ui, calendarMonth } = props;
      const [, force] = useState(0);
      useEffect(() => pomodoroEngine.subscribe(() => force((value) => value + 1)), []);
      const pomodoroState = pomodoroEngine.get();
      const [now, setNow] = useState(Date.now());
      useEffect(() => {
        if (!pomodoroState.running) return undefined;
        const timer = setInterval(() => setNow(Date.now()), 1000);
        return () => clearInterval(timer);
      }, [pomodoroState.running]);

      const [year, month, day] = today.split("-").map(Number);
      const todayLabel = t("date.monthDayWeekday", {
        month: t(`date.monthShort.${month}`),
        day,
        weekday: t(`weekday.short.${weekdayOf(today)}`),
      });

      return h(
        "header",
        { className: "todo-topbar" },
        h(
          "div",
          { className: "todo-topbar-title" },
          h(
            "div",
            { className: "todo-topbar-heading" },
            h("h1", null, viewTitle(view, projects)),
            h("span", { className: "todo-topbar-date" }, `${year} · ${todayLabel}`),
          ),
          h("div", { className: "todo-topbar-progress" }, h(Progress, { done: stats.done, total: stats.total })),
        ),
        h(
          "div",
          { className: "todo-topbar-tools" },
          h(
            "label",
            { className: "todo-search" },
            h(Icon, { name: "search", size: 14 }),
            h("input", {
              className: "todo-search-input",
              value: ui.query,
              placeholder: t("topbar.searchPlaceholder"),
              "aria-label": t("topbar.searchAria"),
              onChange: (event) => ui.setQuery(event.target.value),
              onKeyDown: (event) => {
                if (event.key === "Escape") ui.setQuery("");
              },
            }),
          ),
          h(
            "div",
            { className: "todo-filters", role: "group", "aria-label": t("topbar.priorityFilter") },
            [1, 2, 3, 4].map((priority) =>
              h(
                "button",
                {
                  key: priority,
                  type: "button",
                  className: `todo-filter todo-priority-p${priority}${ui.priorities.includes(priority) ? " is-active" : ""}`,
                  onClick: () => ui.togglePriority(priority),
                  title: t("task.priority", { n: priority }),
                  "aria-pressed": ui.priorities.includes(priority),
                },
                `P${priority}`,
              ),
            ),
            h(
              "button",
              {
                type: "button",
                className: `todo-filter todo-filter-none${ui.priorities.includes(0) ? " is-active" : ""}`,
                onClick: () => ui.togglePriority(0),
                title: t("detail.priorityNone"),
                "aria-pressed": ui.priorities.includes(0),
              },
              "—",
            ),
            ui.priorities.length
              ? h(
                  "button",
                  { type: "button", className: "todo-link-btn", onClick: () => ui.setPriorities([]) },
                  t("topbar.clearFilter"),
                )
              : null,
          ),
          h(
            "button",
            {
              type: "button",
              className: "todo-icon-btn todo-refresh",
              onClick: ui.onRefresh,
              title: t("topbar.refresh"),
              "aria-label": t("topbar.refresh"),
            },
            h(Icon, { name: "repeat", size: 14 }),
          ),
          h(PomodoroCapsule, {
            state: pomodoroState,
            remaining: pomodoroRemaining(pomodoroState, now),
            onToggle: ui.onTogglePomodoro,
            onOpen: () => ui.setView("pomodoro"),
          }),
          h(
            "select",
            {
              className: "todo-view-select",
              value: view.startsWith("project:") || view === "calendar" ? view : view,
              "aria-label": t("nav.collapsed"),
              onChange: (event) => ui.setView(event.target.value),
            },
            NAV_ITEMS.map((item) => h("option", { key: item.id, value: item.id }, t(`view.${item.id}`))),
            TOOL_ITEMS.map((item) => h("option", { key: item.id, value: item.id }, t(`view.${item.id}`))),
            projects.map((project) => h("option", { key: project.id, value: `project:${project.id}` }, project.name)),
          ),
        ),
      );
    }

    /* ============================ 详情抽屉 ============================ */

    function TaskDetail(props) {
      const { task, tasks, projects, today, ui } = props;
      const [title, setTitle] = useState(task.title);
      const [labels, setLabels] = useState((task.labels || []).join(", "));
      const [note, setNote] = useState(task.note || "");
      const [subtask, setSubtask] = useState("");
      const [saving, setSaving] = useState(false);
      const children = childrenOf(task, tasks);

      useEffect(() => {
        setTitle(task.title);
        setLabels((task.labels || []).join(", "));
        setNote(task.note || "");
      }, [task.id]);

      const commit = (changes) => {
        setSaving(true);
        Promise.resolve(ui.onUpdate(task.id, changes)).finally(() => setSaving(false));
      };

      const commitTitle = () => {
        const trimmed = title.trim();
        if (!trimmed) {
          setTitle(task.title);
          return;
        }
        if (trimmed !== task.title) commit({ title: trimmed });
      };

      const commitLabels = () => {
        const next = [...new Set(
          labels
            .split(/[,，]/)
            .map((label) => label.trim())
            .filter(Boolean),
        )].slice(0, 10);
        setLabels(next.join(", "));
        const current = (task.labels || []).join("|");
        if (next.join("|") !== current) commit({ labels: next });
      };

      const commitNote = () => {
        if (note !== (task.note || "")) commit({ note });
      };

      const commitDue = (date, time) => {
        if (!date) commit({ due: null });
        else commit({ due: { date, time: time || null } });
      };

      const commitRecurrence = (freq) => {
        if (!freq || freq === "none") commit({ recurrence: null });
        else commit({ recurrence: { freq, interval: Number(task.recurrence && task.recurrence.interval) || 1 } });
      };

      const commitInterval = (value) => {
        const interval = Math.min(30, Math.max(1, Math.round(Number(value) || 1)));
        if (!task.recurrence) return;
        commit({ recurrence: { freq: task.recurrence.freq, interval } });
      };

      const addSubtask = () => {
        const trimmed = subtask.trim();
        if (!trimmed) return;
        ui.onAddSubtask(task, trimmed);
        setSubtask("");
      };

      return h(
        "div",
        { className: "todo-drawer-overlay", onMouseDown: (event) => {
            if (event.target === event.currentTarget) ui.onClose();
          } },
        h(
          "aside",
          { className: "todo-drawer", role: "dialog", "aria-modal": "true", "aria-label": t("detail.title") },
          h(
            "header",
            { className: "todo-drawer-head" },
            h(
              "div",
              { className: "todo-drawer-headline" },
              h("h2", null, t("detail.title")),
              h("span", { className: `todo-save-state${saving ? " is-saving" : ""}` }, saving ? t("detail.saving") : t("detail.saved")),
            ),
            h(
              "button",
              { type: "button", className: "todo-icon-btn", onClick: ui.onClose, title: t("detail.close"), "aria-label": t("detail.close") },
              h(Icon, { name: "close", size: 15 }),
            ),
          ),
          h(
            "div",
            { className: "todo-drawer-body" },
            h(
              "label",
              { className: "todo-field" },
              h("span", { className: "todo-field-label" }, t("detail.taskTitle")),
              h("input", {
                className: "todo-input todo-input-title",
                value: title,
                onChange: (event) => setTitle(event.target.value),
                onBlur: commitTitle,
                onKeyDown: (event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    commitTitle();
                    event.currentTarget.blur();
                  }
                },
              }),
            ),
            h(
              "label",
              { className: "todo-field" },
              h("span", { className: "todo-field-label" }, t("detail.note")),
              h("textarea", {
                className: "todo-textarea",
                rows: 4,
                value: note,
                placeholder: t("detail.notePlaceholder"),
                onChange: (event) => setNote(event.target.value),
                onBlur: commitNote,
              }),
            ),
            h(
              "div",
              { className: "todo-field" },
              h("span", { className: "todo-field-label" }, t("detail.due")),
              h(
                "div",
                { className: "todo-due-row" },
                h("input", {
                  type: "date",
                  className: "todo-input",
                  value: task.due && task.due.date ? task.due.date : "",
                  "aria-label": t("detail.dueDate"),
                  onChange: (event) => commitDue(event.target.value, task.due && task.due.time),
                }),
                h("input", {
                  type: "time",
                  className: "todo-input todo-input-time",
                  value: task.due && task.due.time ? task.due.time : "",
                  "aria-label": t("detail.dueTime"),
                  onChange: (event) => {
                    const date = task.due && task.due.date ? task.due.date : today;
                    commitDue(date, event.target.value);
                  },
                }),
                task.due
                  ? h(
                      "button",
                      { type: "button", className: "todo-link-btn", onClick: () => commit({ due: null }) },
                      t("detail.clearDue"),
                    )
                  : null,
              ),
            ),
            h(
              "div",
              { className: "todo-field" },
              h("span", { className: "todo-field-label" }, t("detail.priority")),
              h(
                "div",
                { className: "todo-segment" },
                h(
                  "button",
                  {
                    type: "button",
                    className: `todo-segment-btn${!task.priority ? " is-active" : ""}`,
                    onClick: () => commit({ priority: null }),
                  },
                  t("detail.priorityNone"),
                ),
                [1, 2, 3, 4].map((priority) =>
                  h(
                    "button",
                    {
                      key: priority,
                      type: "button",
                      className: `todo-segment-btn todo-priority-p${priority}${task.priority === priority ? " is-active" : ""}`,
                      onClick: () => commit({ priority }),
                    },
                    `P${priority}`,
                  ),
                ),
              ),
            ),
            h(
              "label",
              { className: "todo-field" },
              h("span", { className: "todo-field-label" }, t("detail.project")),
              h(
                "select",
                {
                  className: "todo-input",
                  value: task.projectId || "",
                  onChange: (event) => commit({ projectId: event.target.value || null }),
                },
                h("option", { value: "" }, t("detail.projectNone")),
                projects.map((item) => h("option", { key: item.id, value: item.id }, item.name)),
              ),
            ),
            h(
              "label",
              { className: "todo-field" },
              h("span", { className: "todo-field-label" }, t("detail.labels")),
              h("input", {
                className: "todo-input",
                value: labels,
                placeholder: t("detail.labelsPlaceholder"),
                onChange: (event) => setLabels(event.target.value),
                onBlur: commitLabels,
                onKeyDown: (event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    commitLabels();
                  }
                },
              }),
            ),
            h(
              "div",
              { className: "todo-field" },
              h("span", { className: "todo-field-label" }, t("detail.recurrence")),
              h(
                "div",
                { className: "todo-due-row" },
                h(
                  "select",
                  {
                    className: "todo-input",
                    value: task.recurrence ? task.recurrence.freq : "none",
                    onChange: (event) => commitRecurrence(event.target.value),
                  },
                  ["none", "daily", "weekday", "weekly", "monthly"].map((freq) =>
                    h("option", { key: freq, value: freq }, t(`rec.${freq}`)),
                  ),
                ),
                task.recurrence && task.recurrence.freq !== "weekday"
                  ? h("input", {
                      type: "number",
                      min: 1,
                      max: 30,
                      className: "todo-input todo-input-time",
                      value: task.recurrence.interval || 1,
                      "aria-label": t("detail.recurrenceInterval"),
                      onChange: (event) => commitInterval(event.target.value),
                    })
                  : null,
                task.recurrence
                  ? h("span", { className: "todo-field-aside" }, recurrenceLabel(task.recurrence))
                  : null,
              ),
            ),
            h(
              "div",
              { className: "todo-field" },
              h(
                "div",
                { className: "todo-field-head" },
                h("span", { className: "todo-field-label" }, t("detail.subtasks")),
                h("span", { className: "todo-field-aside" }, `${children.filter((child) => child.done).length}/${children.length}`),
              ),
              h(
                "ul",
                { className: "todo-drawer-subtasks" },
                children.map((child) =>
                  h(
                    "li",
                    { key: child.id, className: `todo-drawer-subtask${child.done ? " is-done" : ""}` },
                    h("button", {
                      type: "button",
                      className: `todo-check todo-check-sm${child.done ? " is-checked" : ""}`,
                      onClick: () => ui.onToggle(child),
                      "aria-pressed": Boolean(child.done),
                      "aria-label": child.done ? t("task.toggleUndone") : t("task.toggleDone"),
                    }, child.done ? h(Icon, { name: "check", size: 11 }) : null),
                    h("span", { className: "todo-drawer-subtask-title" }, child.title),
                    h(
                      "button",
                      {
                        type: "button",
                        className: "todo-icon-btn todo-icon-danger",
                        onClick: () => ui.onDelete(child),
                        title: t("detail.delete"),
                        "aria-label": t("detail.delete"),
                      },
                      h(Icon, { name: "close", size: 12 }),
                    ),
                  ),
                ),
              ),
              h(
                "div",
                { className: "todo-subtask-add" },
                h("input", {
                  className: "todo-input",
                  value: subtask,
                  placeholder: t("detail.subtaskPlaceholder"),
                  onChange: (event) => setSubtask(event.target.value),
                  onKeyDown: (event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      addSubtask();
                    }
                  },
                }),
                h(
                  "button",
                  { type: "button", className: "todo-btn todo-btn-sm", onClick: addSubtask },
                  h(Icon, { name: "plus", size: 13 }),
                  h("span", null, t("detail.subtaskAdd")),
                ),
              ),
            ),
            h(
              "div",
              { className: "todo-drawer-pom" },
              h(
                "div",
                null,
                h("strong", null, t("detail.pomodoros", { n: task.pomodoros || 0 })),
                h("span", { className: "todo-field-aside" }, t("detail.saveHint")),
              ),
              h(
                "button",
                { type: "button", className: "todo-btn todo-btn-sm", onClick: () => ui.onFocus(task) },
                h(Icon, { name: "play", size: 13 }),
                h("span", null, t("detail.startFocus")),
              ),
            ),
            h(
              "p",
              { className: "todo-drawer-meta" },
              t("detail.created", {
                date: `${formatDue(localDate(task.createdAt), today)} ${clockOf(task.createdAt)}`,
              }),
            ),
          ),
          h(
            "footer",
            { className: "todo-drawer-foot" },
            h(
              "button",
              {
                type: "button",
                className: "todo-btn todo-btn-danger",
                onClick: () => ui.onDelete(task),
              },
              h(Icon, { name: "trash", size: 14 }),
              h("span", null, t("detail.delete")),
            ),
          ),
        ),
      );
    }

    /* ============================ 番茄钟视图 ============================ */

    function PomodoroRing(props) {
      const ratio = Math.max(0, Math.min(1, props.ratio));
      const radius = 74;
      const circumference = 2 * Math.PI * radius;
      return h(
        "svg",
        { className: "todo-pom-ring", viewBox: "0 0 180 180", "aria-hidden": "true" },
        h("circle", { cx: 90, cy: 90, r: radius, className: "todo-pom-ring-track" }),
        h("circle", {
          cx: 90,
          cy: 90,
          r: radius,
          className: "todo-pom-ring-fill",
          strokeDasharray: circumference,
          strokeDashoffset: circumference * (1 - ratio),
        }),
      );
    }

    function PomodoroView(props) {
      const { tasks, projects, today, settings, sessions, ui, immersive } = props;
      const [, force] = useState(0);
      const [, setNow] = useState(Date.now());
      useEffect(() => pomodoroEngine.subscribe(() => force((value) => value + 1)), []);
      const state = pomodoroEngine.get();
      useEffect(() => {
        const timer = setInterval(() => setNow(Date.now()), 500);
        return () => clearInterval(timer);
      }, []);
      const remaining = pomodoroRemaining(state, Date.now());
      const full = modeMinutes(state.mode, settings) * 60000;
      const boundTask = tasks.find((task) => task.id === state.taskId) || null;
      const stats = computeStats(sessions, today, settings.dailyGoal);
      const todaySessions = sessions
        .filter((session) => localDate(Number(session.endedAt || session.startedAt) || 0) === today)
        .sort((a, b) => (Number(b.endedAt) || 0) - (Number(a.endedAt) || 0))
        .slice(0, 8);
      const cycleEvery = normalizedSettings(settings).longBreakEvery;
      const cycleInRound = state.cycle % cycleEvery;

      return h(
        "div",
        { className: `todo-pom${immersive ? " is-immersive" : ""}` },
        h(
          "div",
          { className: "todo-pom-main" },
          h(
            "div",
            { className: "todo-pom-modes" },
            ["focus", "short", "long"].map((mode) =>
              h(
                "button",
                {
                  key: mode,
                  type: "button",
                  className: `todo-pom-mode${state.mode === mode ? " is-active" : ""}`,
                  onClick: () => ui.onPomodoroMode(mode),
                },
                t(MODE_KEYS[mode]),
                h("span", null, `${modeMinutes(mode, settings)}′`),
              ),
            ),
          ),
          h(
            "div",
            { className: `todo-pom-clock todo-mode-${state.mode}` },
            h(PomodoroRing, { ratio: full > 0 ? remaining / full : 0 }),
            h(
              "div",
              { className: "todo-pom-clock-inner" },
              h("span", { className: "todo-pom-time" }, formatClock(remaining)),
              h("span", { className: "todo-pom-state" }, t(MODE_KEYS[state.mode])),
              h("span", { className: "todo-pom-cycle" }, t("pom.cycle", { n: cycleInRound + 1, total: cycleEvery })),
            ),
          ),
          h(
            "div",
            { className: "todo-pom-controls" },
            h(
              "button",
              { type: "button", className: "todo-btn todo-btn-primary todo-btn-lg", onClick: ui.onPomodoroToggle },
              h(Icon, { name: state.running ? "pause" : "play", size: 15 }),
              h("span", null, state.running ? t("pom.pause") : state.remainingMs === full && state.mode === "focus" ? t("pom.start") : t("pom.resume")),
            ),
            h(
              "button",
              { type: "button", className: "todo-btn todo-btn-ghost", onClick: ui.onPomodoroSkip, title: t("pom.skip") },
              h(Icon, { name: "skip", size: 14 }),
              h("span", null, t("pom.skip")),
            ),
            h(
              "button",
              { type: "button", className: "todo-btn todo-btn-ghost", onClick: ui.onPomodoroAbandon, title: t("pom.abandon") },
              h(Icon, { name: "stop", size: 14 }),
              h("span", null, t("pom.abandon")),
            ),
            h(
              "button",
              { type: "button", className: "todo-icon-btn todo-pom-immersive", onClick: ui.onToggleImmersive, title: immersive ? t("pom.exitImmersive") : t("pom.immersive"), "aria-label": immersive ? t("pom.exitImmersive") : t("pom.immersive") },
              h(Icon, { name: immersive ? "collapse" : "expand", size: 16 }),
            ),
          ),
          h(
            "label",
            { className: "todo-pom-bind" },
            h(Icon, { name: "note", size: 14 }),
            h(
              "select",
              {
                className: "todo-input",
                value: state.taskId || "",
                onChange: (event) => ui.onPomodoroBind(event.target.value || null),
              },
              h("option", { value: "" }, t("pom.noTask")),
              tasks
                .filter((task) => !task.done && !task.parentId)
                .slice(0, 200)
                .map((task) =>
                  h(
                    "option",
                    { key: task.id, value: task.id },
                    task.due ? `${task.title} · ${formatDue(task.due.date, today)}` : task.title,
                  ),
                ),
            ),
            boundTask ? h("span", { className: "todo-pom-bound" }, boundTask.title) : null,
          ),
          h(
            "p",
            { className: "todo-pom-hint" },
            state.remainingMs === full && !state.running ? t("pom.idleHint") : stats.todayCount >= stats.goal ? t("pom.goalDone") : t("pom.cycleDone", { n: stats.todayCount }),
          ),
        ),
        h(
          "div",
          { className: "todo-pom-side" },
          h(
            "div",
            { className: "todo-stat-grid" },
            h(
              "div",
              { className: "todo-stat" },
              h("span", { className: "todo-stat-label" }, t("pom.today")),
              h("strong", { className: "todo-stat-value" }, stats.todayCount),
              h("span", { className: "todo-stat-sub" }, t("pom.goal", { n: stats.goal })),
            ),
            h(
              "div",
              { className: "todo-stat" },
              h("span", { className: "todo-stat-label" }, t("pom.todayMinutes")),
              h("strong", { className: "todo-stat-value" }, stats.todayMinutes),
              h("span", { className: "todo-stat-sub" }, t("pom.minutesUnit")),
            ),
            h(
              "div",
              { className: "todo-stat" },
              h("span", { className: "todo-stat-label" }, t("pom.week")),
              h("strong", { className: "todo-stat-value" }, stats.days.reduce((sum, day) => sum + day.count, 0)),
              h("span", { className: "todo-stat-sub" }, t("pom.streak", { n: stats.streak })),
            ),
          ),
          h(
            "div",
            { className: "todo-pom-chart" },
            stats.days.map((day) =>
              h(
                "div",
                { key: day.date, className: "todo-pom-bar" },
                h("span", { className: "todo-pom-bar-value" }, day.count || ""),
                h(PomodoroBarColumn, { day, goal: stats.goal }),
                h("span", { className: "todo-pom-bar-day" }, t(`weekday.${weekdayOf(day.date)}`)),
              ),
            ),
          ),
          h(
            "section",
            { className: "todo-pom-settings" },
            h("h3", null, t("pom.settings")),
            h("p", { className: "todo-pom-settings-hint" }, t("pom.settingsHint")),
            h(
              "div",
              { className: "todo-settings-grid" },
              h(SettingNumber, { label: t("settings.focusMinutes"), value: settings.focusMinutes, min: 1, max: 180, onChange: (value) => ui.onSettings({ focusMinutes: value }) }),
              h(SettingNumber, { label: t("settings.shortBreakMinutes"), value: settings.shortBreakMinutes, min: 1, max: 60, onChange: (value) => ui.onSettings({ shortBreakMinutes: value }) }),
              h(SettingNumber, { label: t("settings.longBreakMinutes"), value: settings.longBreakMinutes, min: 1, max: 120, onChange: (value) => ui.onSettings({ longBreakMinutes: value }) }),
              h(SettingNumber, { label: t("settings.longBreakEvery"), value: settings.longBreakEvery, min: 2, max: 12, onChange: (value) => ui.onSettings({ longBreakEvery: value }) }),
              h(SettingNumber, { label: t("settings.dailyGoal"), value: settings.dailyGoal, min: 1, max: 40, onChange: (value) => ui.onSettings({ dailyGoal: value }) }),
              h(
                "label",
                { className: "todo-setting todo-setting-toggle" },
                h("span", null, t("settings.autoStartNext")),
                h("input", {
                  type: "checkbox",
                  checked: Boolean(settings.autoStartNext),
                  onChange: (event) => ui.onSettings({ autoStartNext: event.target.checked }),
                }),
              ),
              h(
                "label",
                { className: "todo-setting todo-setting-toggle" },
                h("span", null, t("settings.sound")),
                h("input", {
                  type: "checkbox",
                  checked: settings.sound !== false,
                  onChange: (event) => ui.onSettings({ sound: event.target.checked }),
                }),
              ),
            ),
          ),
          h(
            "section",
            { className: "todo-pom-log" },
            h("h3", null, t("pom.sessions")),
            todaySessions.length === 0
              ? h("p", { className: "todo-pom-empty" }, t("pom.emptySessions"))
              : h(
                  "ul",
                  null,
                  todaySessions.map((session) =>
                    h(
                      "li",
                      { key: session.id },
                      h(Icon, { name: "pomodoro", size: 12 }),
                      h(
                        "span",
                        null,
                        t("pom.sessionRow", {
                          minutes: session.minutes,
                          time: clockOf(session.endedAt),
                        }),
                      ),
                      session.taskId
                        ? h(
                            "span",
                            { className: "todo-pom-log-task" },
                            (tasks.find((task) => task.id === session.taskId) || {}).title || "",
                          )
                        : null,
                    ),
                  ),
                ),
          ),
        ),
      );
    }

    function PomodoroBarColumn(props) {
      const { day, goal } = props;
      const ratio = Math.min(1, day.count / Math.max(1, goal));
      return h(
        "span",
        { className: "todo-pom-bar-track", title: `${day.date} · ${day.count}` },
        h("span", { className: "todo-pom-bar-fill", style: { height: `${Math.max(day.count ? 10 : 4, ratio * 100)}%` } }),
      );
    }

    function SettingNumber(props) {
      return h(
        "label",
        { className: "todo-setting" },
        h("span", null, props.label),
        h("input", {
          type: "number",
          className: "todo-input todo-input-num",
          min: props.min,
          max: props.max,
          value: props.value,
          onChange: (event) => {
            const value = Number(event.target.value);
            if (Number.isFinite(value)) props.onChange(Math.min(props.max, Math.max(props.min, Math.round(value))));
          },
        }),
      );
    }

    function clockOf(stamp) {
      if (!stamp) return "--:--";
      const date = new Date(Number(stamp));
      return `${pad2(date.getHours())}:${pad2(date.getMinutes())}`;
    }

    /* ============================ 日历视图 ============================ */

    function CalendarView(props) {
      const { monthKey, setMonthKey, selectedDate, setSelectedDate, tasks, today, ui } = props;
      const [year, month] = monthKey.split("-").map(Number);
      const totalDays = daysInMonth(year, month);
      const firstWeekday = weekdayOf(`${monthKey}-01`);
      // 周一排第一列
      const offset = (firstWeekday + 6) % 7;
      const cells = [];

      for (let index = 0; index < offset; index += 1) {
        cells.push({ empty: true, key: `prev-${index}` });
      }
      for (let day = 1; day <= totalDays; day += 1) {
        const date = `${monthKey}-${pad2(day)}`;
        const dayTasks = tasks.filter((task) => task.due && task.due.date === date);
        const active = dayTasks.filter((task) => !task.done);
        const done = dayTasks.filter((task) => task.done);
        cells.push({
          empty: false,
          key: date,
          date,
          day,
          tasks: dayTasks,
          activeCount: active.length,
          doneCount: done.length,
          isToday: date === today,
          isSelected: date === selectedDate,
        });
      }

      const selectedTasks = selectedDate
        ? tasks.filter((task) => task.due && task.due.date === selectedDate)
        : [];

      return h(
        "div",
        { className: "todo-calendar" },
        h(
          "div",
          { className: "todo-calendar-head" },
          h(
            "div",
            { className: "todo-calendar-nav" },
            h(
              "button",
              {
                type: "button",
                className: "todo-icon-btn",
                onClick: () => setMonthKey(shiftMonth(monthKey, -1)),
                title: t("cal.prev"),
                "aria-label": t("cal.prev"),
              },
              h(Icon, { name: "chevron", size: 14, className: "todo-chevron-left" }),
            ),
            h("h2", { className: "todo-calendar-title" }, formatMonthYear(monthKey)),
            h(
              "button",
              {
                type: "button",
                className: "todo-icon-btn",
                onClick: () => setMonthKey(shiftMonth(monthKey, 1)),
                title: t("cal.next"),
                "aria-label": t("cal.next"),
              },
              h(Icon, { name: "chevron", size: 14 }),
            ),
          ),
          h(
            "div",
            { className: "todo-calendar-actions" },
            h(
              "button",
              {
                type: "button",
                className: "todo-btn todo-btn-sm",
                onClick: () => {
                  setMonthKey(monthKeyOf(today));
                  setSelectedDate(today);
                },
              },
              t("cal.today"),
            ),
          ),
        ),
        h(
          "div",
          { className: "todo-calendar-grid" },
          [1, 2, 3, 4, 5, 6, 0].map((weekday) =>
            h("div", { key: `wd-${weekday}`, className: "todo-calendar-weekday" }, t(`weekday.${weekday}`)),
          ),
          cells.map((cell) => {
            if (cell.empty) {
              return h("div", { key: cell.key, className: "todo-calendar-cell is-empty", "aria-hidden": "true" });
            }
            return h(
              "button",
              {
                key: cell.key,
                type: "button",
                className: `todo-calendar-cell${cell.isToday ? " is-today" : ""}${cell.isSelected ? " is-selected" : ""}`,
                onClick: () => setSelectedDate(cell.date),
                title: `${cell.date} (${cell.activeCount} active)`,
              },
              h(
                "div",
                { className: "todo-calendar-cell-top" },
                h("span", { className: "todo-calendar-num" }, cell.day),
                cell.activeCount > 0
                  ? h("span", { className: "todo-calendar-dot", "aria-hidden": "true" })
                  : null,
              ),
              h(
                "div",
                { className: "todo-calendar-pills" },
                cell.tasks.slice(0, 3).map((task) =>
                  h(
                    "span",
                    {
                      key: task.id,
                      className: `todo-calendar-pill${task.done ? " is-done" : ""} todo-priority-p${priorityOf(task)}`,
                    },
                    task.title,
                  ),
                ),
                cell.tasks.length > 3
                  ? h("span", { className: "todo-calendar-more" }, t("cal.more", { n: cell.tasks.length - 3 }))
                  : null,
              ),
            );
          }),
        ),
        selectedDate
          ? h(
              "div",
              { className: "todo-calendar-selected" },
              h(
                "header",
                { className: "todo-group-head" },
                h("h3", null, t("cal.dayTasks", { date: formatDue(selectedDate, today) })),
                h("span", { className: "todo-group-count" }, selectedTasks.length),
              ),
              selectedTasks.length === 0
                ? h(Empty, { icon: "calendar", text: t("empty.day") })
                : h(
                    "ul",
                    { className: "todo-list" },
                    selectedTasks.map((task) =>
                      h(TaskRow, {
                        key: task.id,
                        task,
                        tasks,
                        projects: props.projects,
                        today,
                        ui,
                      }),
                    ),
                  ),
            )
          : null,
      );
    }

    /* ============================ 页面骨架 ============================ */

    function ToastView(props) {
      const toast = props.toast;
      if (!toast) return null;
      return h(
        "div",
        { className: `todo-toast todo-toast-${toast.tone || "info"}`, role: "status" },
        h("span", { className: "todo-toast-text" }, toast.message),
        toast.detail ? h("span", { className: "todo-toast-detail" }, toast.detail) : null,
        toast.actionLabel && toast.onAction
          ? h(
              "button",
              {
                type: "button",
                className: "todo-toast-action",
                onClick: () => {
                  props.onDismiss();
                  toast.onAction();
                },
              },
              toast.actionLabel,
            )
          : null,
        h(
          "button",
          {
            type: "button",
            className: "todo-toast-close",
            onClick: props.onDismiss,
            title: t("toast.dismiss"),
            "aria-label": t("toast.dismiss"),
          },
          h(Icon, { name: "close", size: 12 }),
        ),
      );
    }

    function TodoPage(props) {
      useLocaleTick();
      const state = useStore(dataStore);
      const today = dataStore.getToday();
      const status = dataStore.getStatus();
      const toast = dataStore.getToast();

      // 预览页约定（lead 要求）：读取 window.__dshTodoPreview，只在初始化时读一次
      const demo = typeof window !== "undefined" ? window.__dshTodoPreview : undefined;
      const initialView = demo && typeof demo.view === "string" ? demo.view : "today";
      if (demo && (demo.locale === "zh" || demo.locale === "en")) {
        previewLocale = demo.locale;
      }

      const [view, setView] = useState(initialView);
      const [query, setQuery] = useState("");
      const [priorities, setPriorities] = useState([]);
      const [detailTask, setDetailTask] = useState(null);
      const [calendarMonth, setCalendarMonth] = useState(monthKeyOf(today));
      const [selectedDate, setSelectedDate] = useState(today);
      const [immersive, setImmersive] = useState(false);

      useEffect(() => {
        dataStore.load().catch(() => {});
        const releasePomodoro = pomodoroEngine.retain();
        return () => {
          releasePomodoro();
        };
      }, []);

      const activeView = query ? "search" : view;

      const derived = useMemo(
        () =>
          deriveView({
            tasks: state.tasks,
            projects: state.projects,
            view: activeView,
            today,
            query,
            priorities,
            selectedDate,
          }),
        [state.tasks, state.projects, activeView, today, query, priorities, selectedDate],
      );

      const counts = useMemo(() => {
        const result = {
          today: countToday(state.tasks, today),
          upcoming: state.tasks.filter((task) => !task.parentId && !task.done && task.due && task.due.date > today).length,
          inbox: state.tasks.filter((task) => !task.parentId && !task.done && !task.due).length,
          completed: state.tasks.filter((task) => task.done).length,
        };
        state.projects.forEach((project) => {
          result[`project:${project.id}`] = state.tasks.filter(
            (task) => !task.parentId && !task.done && task.projectId === project.id,
          ).length;
        });
        return result;
      }, [state.tasks, state.projects, today]);

      const stats = useMemo(
        () => computeStats(state.sessions, today, state.settings.dailyGoal),
        [state.sessions, today, state.settings.dailyGoal],
      );

      const topbarStats = useMemo(() => {
        const todayTasks = state.tasks.filter(
          (task) => !task.parentId && task.due && task.due.date === today,
        );
        return { done: todayTasks.filter((task) => task.done).length, total: todayTasks.length };
      }, [state.tasks, today]);

      const defaultsForQuick = useMemo(() => {
        if (view === "today") return { today, due: { date: today, time: null } };
        if (view.startsWith("project:")) {
          const project = state.projects.find((item) => item.id === view.slice("project:".length));
          return { today, projectName: project ? project.name : null, projectId: project ? project.id : null };
        }
        if (view === "upcoming") return { today, due: { date: addDays(today, 1), time: null } };
        if (view === "calendar" || view.startsWith("calendar:")) return { today, due: { date: selectedDate || today, time: null } };
        return { today, due: null };
      }, [view, today, state.projects, selectedDate]);

      const handleCreate = async (input) => {
        requestNotifyPermission();
        try {
          let projectId = defaultsForQuick.projectId || null;
          if (input.project) {
            const project = await dataStore.ensureProject(input.project);
            projectId = project.id;
          }
          const created = await dataStore.createTask({
            title: input.title,
            due: input.due,
            priority: input.priority,
            projectId,
            labels: input.labels,
            recurrence: input.recurrence,
          });
          dataStore.toast(t("toast.added", { title: created.title }));
        } catch {
          /* store 已经把错误弹成提示条 */
        }
      };

      const handleMove = (task, delta) => {
        const siblings = state.tasks
          .filter((item) => item.parentId === task.parentId && Boolean(item.done) === Boolean(task.done))
          .sort((a, b) => (Number(a.order) || 0) - (Number(b.order) || 0));
        const index = siblings.findIndex((item) => item.id === task.id);
        const targetIndex = index + delta;
        if (targetIndex < 0 || targetIndex >= siblings.length) return;
        const target = siblings[targetIndex];
        const beforeId = delta > 0 ? (siblings[targetIndex + 1] ? siblings[targetIndex + 1].id : null) : target.id;
        dataStore.moveTask(task, beforeId);
      };

      const handleFocus = (task) => {
        requestNotifyPermission();
        pomodoroEngine.dispatch({ type: "bind", taskId: task.id });
        setView("pomodoro");
      };

      const handleAddSubtask = (parent, title) => {
        dataStore
          .createTask({ title, parentId: parent.id })
          .then(() => {
            setDetailTask((current) => (current && current.id === parent.id ? { ...current } : current));
          })
          .catch(() => {
            /* store 已经把错误弹成提示条 */
          });
      };

      const ui = {
        onToggle: (task) => dataStore.toggleTask(task),
        onDelete: (task) => {
          if (detailTask && detailTask.id === task.id) setDetailTask(null);
          dataStore.deleteTask(task);
        },
        onMove: handleMove,
        onOpen: (task) => setDetailTask(task),
        onFocus: handleFocus,
        onUpdate: (id, changes) => dataStore.updateTask(id, changes),
        onClose: () => setDetailTask(null),
        onAddSubtask: handleAddSubtask,
        onCreateProject: (name, color) => dataStore.createProject(name, color),
        onUpdateProject: (id, changes) => dataStore.updateProject(id, changes),
        onDeleteProject: (project) => dataStore.deleteProject(project),
        onCycleProjectColor: (project) => {
          const index = PROJECT_COLORS.indexOf(project.color);
          const next = PROJECT_COLORS[(index + 1) % PROJECT_COLORS.length];
          dataStore.updateProject(project.id, { color: next });
        },
        onSettings: (changes) => dataStore.updateSettings(changes),
        onRefresh: () => dataStore.load(),
        onTogglePomodoro: () => {
          requestNotifyPermission();
          pomodoroEngine.dispatch({ type: "toggle" });
        },
        onPomodoroMode: (mode) => pomodoroEngine.dispatch({ type: "setMode", mode }),
        onPomodoroToggle: () => {
          requestNotifyPermission();
          pomodoroEngine.dispatch({ type: "toggle" });
        },
        onPomodoroSkip: () => pomodoroEngine.dispatch({ type: "skip" }),
        onPomodoroAbandon: () => pomodoroEngine.dispatch({ type: "abandon" }),
        onPomodoroBind: (taskId) => pomodoroEngine.dispatch({ type: "bind", taskId }),
        onToggleImmersive: () => setImmersive((value) => !value),
        setView,
        setQuery,
        togglePriority: (priority) => {
          setPriorities((list) =>
            list.includes(priority) ? list.filter((item) => item !== priority) : [...list, priority],
          );
        },
        setPriorities,
        focusedTaskId: pomodoroEngine.get().taskId,
        hasFilters: query !== "" || priorities.length > 0,
      };

      const resolvedDetail = detailTask
        ? state.tasks.find((task) => task.id === detailTask.id) || detailTask
        : null;

      return h(
        "div",
        { className: `todo-root${immersive ? " is-immersive" : ""}` },
        h(Sidebar, {
          view,
          setView,
          projects: state.projects,
          counts,
          stats,
          today,
          ui,
        }),
        h(
          "main",
          { className: "todo-content" },
          h(TopBar, {
            view: activeView,
            projects: state.projects,
            today,
            stats: topbarStats,
            pomodoro: pomodoroEngine.get(),
            ui: { ...ui, query, priorities },
            calendarMonth,
          }),
          status === "loading" && state.tasks.length === 0
            ? h(
                "div",
                { className: "todo-body todo-body-loading" },
                h("span", { className: "todo-spinner", "aria-hidden": "true" }),
                h("p", null, t("empty.loading")),
              )
            : status === "error" && state.tasks.length === 0
              ? h(
                  "div",
                  { className: "todo-body todo-body-error" },
                  h("p", null, t("topbar.error", { message: dataStore.getError() || "" })),
                  h("button", { type: "button", className: "todo-btn", onClick: () => dataStore.load() }, t("topbar.retry")),
                )
              : h(
                  "div",
                  { className: "todo-body" },
                  view === "pomodoro"
                    ? h(PomodoroView, {
                        tasks: state.tasks,
                        projects: state.projects,
                        today,
                        settings: state.settings,
                        sessions: state.sessions,
                        ui,
                        immersive,
                      })
                    : view === "calendar"
                      ? h(CalendarView, {
                          monthKey: calendarMonth,
                          setMonthKey: setCalendarMonth,
                          selectedDate,
                          setSelectedDate,
                          tasks: state.tasks,
                          projects: state.projects,
                          today,
                          ui,
                        })
                      : h(
                          "div",
                          { className: "todo-pane" },
                          view !== "completed" && !query
                            ? h(QuickAdd, {
                                projects: state.projects,
                                defaults: defaultsForQuick,
                                onCreate: handleCreate,
                                autoFocus: view === "today" || view === "inbox",
                              })
                            : null,
                          h(TaskList, {
                            view: activeView,
                            groups: derived.groups,
                            total: derived.total,
                            tasks: state.tasks,
                            projects: state.projects,
                            today,
                            ui,
                          }),
                        ),
                ),
        ),
        resolvedDetail
          ? h(TaskDetail, {
              task: resolvedDetail,
              tasks: state.tasks,
              projects: state.projects,
              today,
              ui,
            })
          : null,
        h(ToastView, { toast, onDismiss: dataStore.dismissToast }),
      );
    }

    /* ============================ 样式（只用宿主 token） ============================ */

    const CSS = `
.todo-root {
  --todo-accent: var(--dsw-alias-state-business-primary);
  --todo-danger: var(--dsw-alias-state-error-primary);
  --todo-warn: var(--dsw-alias-state-warn-primary);
  --todo-ok: var(--dsw-alias-state-success-primary);
  display: grid;
  grid-template-columns: 236px minmax(0, 1fr);
  width: 100%;
  height: 100%;
  min-height: 0;
  overflow: hidden;
  background: var(--dsw-alias-bg-base);
  color: var(--dsw-alias-label-primary);
  font-family: inherit;
  font-size: 13.5px;
  line-height: 1.5;
  position: relative;
}
.todo-root *,
.todo-root *::before,
.todo-root *::after { box-sizing: border-box; }
.todo-root button { font-family: inherit; font-size: inherit; color: inherit; }
.todo-root input,
.todo-root textarea,
.todo-root select { font-family: inherit; font-size: inherit; }
.todo-root ::selection { background: color-mix(in oklab, var(--todo-accent) 26%, transparent); }
.todo-root :focus-visible { outline: 2px solid var(--dsw-focus-ring-color, var(--todo-accent)); outline-offset: 1px; }
.todo-root svg { display: block; flex: none; }

/* ---------- 侧边栏 ---------- */
.todo-panel-icon { position: relative; display: inline-flex; align-items: center; line-height: 0; }
/* 展开侧栏时标题紧贴图标：角标收进图标框，只压住图标右上角 */
.todo-panel-icon.is-wide .todo-panel-badge {
  top: -4px; right: -1px;
  min-width: 13px; height: 12px; padding: 0 2px;
  font-size: 9px;
}
.todo-panel-badge {
  position: absolute; top: -6px; right: -10px;
  display: grid; place-items: center;
  min-width: 16px; height: 14px; padding: 0 3px;
  border-radius: 7px;
  background: var(--dsw-alias-bg-overlay);
  color: var(--dsw-alias-label-secondary);
  font-size: 10px; font-weight: 600; line-height: 1;
  font-variant-numeric: tabular-nums;
  box-shadow: 0 0 0 1.5px var(--dsw-alias-bg-base);
}
.todo-panel-badge.is-running {
  background: var(--dsw-alias-state-success-primary);
  color: var(--dsw-alias-label-primary-inverted);
}
.todo-nav {
  display: flex; flex-direction: column; gap: 18px;
  min-height: 0; height: 100%;
  padding: 16px 12px 14px;
  border-right: 1px solid var(--dsw-alias-border-l1);
  background: var(--dsw-alias-bg-layer-1);
  overflow-y: auto; overscroll-behavior: contain;
  scrollbar-width: thin;
}
.todo-brand { display: flex; gap: 9px; align-items: flex-start; padding: 2px 4px 4px; }
.todo-brand-mark { display: block; width: 30px; height: 30px; flex: none; line-height: 0; }
.todo-brand-mark svg { display: block; width: 100%; height: 100%; }
.todo-brand-text { display: flex; flex-direction: column; gap: 1px; min-width: 0; }
.todo-brand-text strong { font-size: 14px; letter-spacing: 0.01em; }
.todo-brand-text span { font-size: 11px; color: var(--dsw-alias-label-tertiary); line-height: 1.35; }
.todo-nav-section { display: flex; flex-direction: column; gap: 2px; }
.todo-nav-section h4 {
  margin: 0 0 4px; padding: 0 8px;
  font-size: 10.5px; font-weight: 600; letter-spacing: 0.12em; text-transform: uppercase;
  color: var(--dsw-alias-label-caption);
}
.todo-nav-head { display: flex; align-items: center; justify-content: space-between; }
.todo-nav-head h4 { margin-bottom: 0; }
.todo-nav-item {
  display: flex; align-items: center; gap: 9px;
  padding: 7px 8px; border: 0; border-radius: var(--dsw-radius-sm);
  background: transparent; color: var(--dsw-alias-label-secondary);
  cursor: pointer; text-align: left; transition: background 120ms ease, color 120ms ease;
}
.todo-nav-item:hover { background: var(--dsw-alias-interactive-bg-hover); color: var(--dsw-alias-label-primary); }
.todo-nav-item.is-active {
  background: var(--dsw-alias-interactive-bg-active);
  color: var(--dsw-alias-label-primary);
  box-shadow: inset 0 0 0 1px var(--dsw-alias-border-l2);
}
.todo-nav-label { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.todo-nav-count {
  min-width: 18px; padding: 0 5px; border-radius: 999px;
  background: var(--dsw-alias-bg-layer-2);
  color: var(--dsw-alias-label-tertiary);
  font-size: 10.5px; line-height: 16px; text-align: center;
}
.todo-nav-projects { min-height: 0; }
.todo-project-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 1px; }
.todo-project { display: flex; align-items: center; border-radius: var(--dsw-radius-sm); }
.todo-project:hover { background: var(--dsw-alias-interactive-bg-hover); }
.todo-project.is-active { background: var(--dsw-alias-interactive-bg-active); }
.todo-project-main {
  display: flex; align-items: center; gap: 8px; flex: 1; min-width: 0;
  padding: 6px 4px 6px 8px; border: 0; border-radius: var(--dsw-radius-sm);
  background: transparent; cursor: pointer; text-align: left;
}
.todo-project-name { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.todo-project-actions { display: flex; gap: 1px; padding-right: 4px; opacity: 0; transition: opacity 120ms ease; }
.todo-project:hover .todo-project-actions,
.todo-project.is-active .todo-project-actions,
.todo-project:focus-within .todo-project-actions { opacity: 1; }
.todo-nav-empty { margin: 2px 8px; color: var(--dsw-alias-label-tertiary); font-size: 12px; }
.todo-project-form { display: flex; flex-direction: column; gap: 6px; padding: 6px 4px 8px; }
.todo-project-form-actions { display: flex; gap: 6px; }
.todo-color-row { display: flex; gap: 6px; }
.todo-color-swatch {
  width: 16px; height: 16px; padding: 0; border-radius: 50%; cursor: pointer;
  border: 1px solid transparent; background: currentColor; color: inherit;
}
.todo-color-swatch.is-active { box-shadow: 0 0 0 2px var(--dsw-alias-bg-layer-1), 0 0 0 3px currentColor; }
.todo-nav-stats {
  margin-top: auto; display: flex; flex-direction: column; gap: 7px;
  padding: 10px; border-radius: var(--dsw-radius-md);
  background: var(--dsw-alias-bg-layer-2);
  border: 1px solid var(--dsw-alias-border-l1);
}
.todo-nav-stats-head { display: flex; align-items: baseline; gap: 5px; font-size: 11px; color: var(--dsw-alias-label-secondary); }
.todo-nav-stats-head strong { font-size: 16px; color: var(--dsw-alias-label-primary); }
.todo-nav-goal { margin-left: auto; color: var(--dsw-alias-label-tertiary); }
.todo-goal-track { height: 4px; border-radius: 999px; background: var(--dsw-alias-bg-layer-3); overflow: hidden; }
.todo-goal-fill { display: block; height: 100%; border-radius: 999px; background: var(--todo-accent); transition: width 200ms ease; }
.todo-nav-stats-minutes, .todo-nav-goal-done { margin: 0; font-size: 11px; color: var(--dsw-alias-label-tertiary); }
.todo-nav-goal-done { color: var(--todo-ok); }
.todo-week { display: flex; align-items: flex-end; gap: 3px; height: 34px; margin-top: 2px; }
.todo-week-col { display: flex; flex-direction: column; justify-content: flex-end; align-items: center; gap: 2px; flex: 1; height: 100%; }
.todo-week-bar { width: 100%; max-width: 14px; min-height: 3px; border-radius: 2px; background: color-mix(in oklab, var(--todo-accent) 72%, transparent); }
.todo-week-day { font-size: 9px; color: var(--dsw-alias-label-caption); }
.todo-nav-streak { margin: 0; font-size: 11px; color: var(--dsw-alias-label-secondary); }

/* ---------- 主区骨架 ---------- */
.todo-content { display: flex; flex-direction: column; min-width: 0; min-height: 0; height: 100%; }
.todo-topbar {
  display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 10px 16px;
  padding: 12px 18px; flex: none;
  border-bottom: 1px solid var(--dsw-alias-border-l1);
}
.todo-topbar-title { display: flex; flex-direction: column; gap: 5px; min-width: 0; }
.todo-topbar-heading { display: flex; align-items: baseline; gap: 10px; flex-wrap: wrap; }
.todo-topbar-heading h1 { margin: 0; font-size: 19px; font-weight: 650; letter-spacing: -0.01em; }
.todo-topbar-date { font-size: 11.5px; color: var(--dsw-alias-label-tertiary); }
.todo-progress { display: inline-flex; align-items: center; gap: 8px; }
.todo-progress-track { width: 96px; height: 4px; border-radius: 999px; background: var(--dsw-alias-bg-layer-3); overflow: hidden; }
.todo-progress-fill { display: block; height: 100%; border-radius: 999px; background: var(--todo-ok); transition: width 200ms ease; }
.todo-progress-text { font-size: 11px; color: var(--dsw-alias-label-secondary); }
.todo-topbar-tools { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.todo-search {
  display: inline-flex; align-items: center; gap: 6px;
  height: 30px; padding: 0 9px; min-width: 170px;
  border-radius: var(--dsw-radius-sm);
  border: 1px solid var(--dsw-alias-border-l1);
  background: var(--dsw-alias-bg-layer-1);
  color: var(--dsw-alias-label-tertiary);
}
.todo-search:focus-within { border-color: var(--todo-accent); }
.todo-search-input {
  flex: 1; min-width: 0; border: 0; background: transparent; color: var(--dsw-alias-label-primary); outline: none;
}
.todo-search-input::placeholder { color: var(--dsw-alias-label-caption); }
.todo-filters { display: inline-flex; align-items: center; gap: 3px; }
.todo-filter {
  height: 24px; min-width: 26px; padding: 0 6px; border-radius: 999px;
  border: 1px solid var(--dsw-alias-border-l1);
  background: var(--dsw-alias-bg-layer-1);
  color: var(--dsw-alias-label-tertiary);
  cursor: pointer; font-size: 11px; font-weight: 600;
}
.todo-filter:hover { color: var(--dsw-alias-label-primary); }
.todo-filter.is-active { border-color: currentColor; background: color-mix(in oklab, currentColor 14%, transparent); }
.todo-filter.todo-priority-p1 { color: var(--todo-danger); }
.todo-filter.todo-priority-p2 { color: var(--todo-warn); }
.todo-filter.todo-priority-p3 { color: var(--todo-accent); }
.todo-filter.todo-priority-p4 { color: var(--dsw-alias-label-tertiary); }
.todo-filter-none { color: var(--dsw-alias-label-caption); }
.todo-link-btn {
  border: 0; background: transparent; color: var(--todo-accent);
  cursor: pointer; font-size: 11.5px; padding: 2px 4px; border-radius: var(--dsw-radius-xs);
}
.todo-link-btn:hover { text-decoration: underline; }
.todo-icon-btn {
  display: inline-grid; place-items: center;
  width: 24px; height: 24px; padding: 0; border: 0; border-radius: var(--dsw-radius-xs);
  background: transparent; color: var(--dsw-alias-label-tertiary); cursor: pointer;
}
.todo-icon-btn:hover { background: var(--dsw-alias-interactive-bg-hover); color: var(--dsw-alias-label-primary); }
.todo-icon-btn.todo-icon-danger:hover { color: var(--todo-danger); }
.todo-capsule {
  display: inline-flex; align-items: center; gap: 2px;
  height: 30px; padding: 0 3px 0 2px;
  border-radius: 999px; border: 1px solid var(--dsw-alias-border-l1);
  background: var(--dsw-alias-bg-layer-1);
}
.todo-capsule.is-running { border-color: color-mix(in oklab, var(--todo-accent) 45%, transparent); }
.todo-capsule-main {
  display: inline-flex; align-items: center; gap: 6px;
  border: 0; background: transparent; cursor: pointer; padding: 0 7px;
  color: var(--dsw-alias-label-secondary); font-size: 11.5px;
}
.todo-capsule-mode { max-width: 62px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.todo-capsule-time { font-variant-numeric: tabular-nums; font-weight: 600; color: var(--dsw-alias-label-primary); }
.todo-capsule.is-running .todo-capsule-time { color: var(--todo-accent); }
.todo-dock {
  display: inline-flex; align-items: center; gap: 1px;
  height: 22px; min-width: 0;
  font-size: 12px; line-height: 22px;
  color: var(--dsw-alias-label-tertiary);
}
.todo-dock-main {
  display: inline-flex; align-items: center; gap: 6px; min-width: 0;
  height: 22px; padding: 0 6px;
  border: none; border-radius: var(--dsw-radius-sm);
  background: transparent; color: inherit; font: inherit; cursor: pointer;
}
@media (hover: hover) {
  .todo-dock-main:hover { background: var(--dsw-alias-interactive-bg-hover); color: var(--dsw-alias-label-secondary); }
}
.todo-dock-main:focus-visible { outline: var(--dsw-focus-ring-width) solid var(--dsw-focus-ring-color); outline-offset: -2px; }
.todo-dock-ring { display: inline-grid; place-items: center; flex: none; width: 16px; height: 16px; }
.todo-dock-ring svg { display: block; }
.todo-dock-mode { flex: none; }
.todo-dock-time { flex: none; font-variant-numeric: tabular-nums; font-weight: 500; color: var(--dsw-alias-label-secondary); }
.todo-dock-task {
  min-width: 0; max-width: 180px;
  padding-left: 2px;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.todo-dock-task::before { content: "·"; padding-right: 5px; color: var(--dsw-alias-label-caption); }
.todo-dock-task-empty { display: none; }
.todo-dock.is-running .todo-dock-time { color: var(--dsw-alias-label-primary); }
.todo-dock-btn {
  display: grid; place-items: center;
  width: 22px; height: 22px; padding: 0;
  border: none; border-radius: 999px;
  background: transparent; color: var(--dsw-alias-label-tertiary); cursor: pointer;
}
@media (hover: hover) {
  .todo-dock-btn:hover { background: var(--dsw-alias-interactive-bg-hover); color: var(--dsw-alias-label-secondary); }
}
.todo-dock-btn:focus-visible { outline: var(--dsw-focus-ring-width) solid var(--dsw-focus-ring-color); outline-offset: -2px; }
.todo-capsule-btn { width: 26px; height: 26px; border-radius: 999px; }
.todo-view-select { display: none; height: 30px; padding: 0 8px; border-radius: var(--dsw-radius-sm);
  border: 1px solid var(--dsw-alias-border-l1); background: var(--dsw-alias-bg-layer-1); color: var(--dsw-alias-label-primary); }

/* ---------- 主体 ---------- */
.todo-body { flex: 1 1 auto; min-height: 0; overflow-y: auto; overscroll-behavior: contain; padding: 16px 18px 28px; scrollbar-width: thin; }
.todo-body-loading, .todo-body-error { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 10px; color: var(--dsw-alias-label-secondary); }
.todo-spinner {
  width: 18px; height: 18px; border-radius: 50%;
  border: 2px solid var(--dsw-alias-border-l2); border-top-color: var(--todo-accent);
  animation: todo-spin 800ms linear infinite;
}
@keyframes todo-spin { to { transform: rotate(360deg); } }
.todo-pane { display: flex; flex-direction: column; gap: 14px; max-width: 880px; margin: 0 auto; }

/* ---------- 快速添加 ---------- */
.todo-quick { display: flex; flex-direction: column; gap: 5px; }
.todo-quick-row {
  display: flex; align-items: center; gap: 8px;
  padding: 0 8px 0 10px; height: 38px;
  border: 1px solid var(--dsw-alias-border-l1); border-radius: var(--dsw-radius-md);
  background: var(--dsw-alias-bg-layer-1);
  box-shadow: var(--dsw-shadow-lv1);
}
.todo-quick-row:focus-within {
  border-color: var(--todo-accent);
  box-shadow: 0 0 0 3px color-mix(in oklab, var(--todo-accent) 18%, transparent);
}
.todo-quick-row .todo-quick-input:focus { outline: none !important; box-shadow: none !important; }
.todo-quick-row.is-error { border-color: var(--todo-danger); }
.todo-quick-plus { color: var(--dsw-alias-label-tertiary); }
.todo-quick-input { flex: 1; min-width: 0; height: 100%; border: 0; background: transparent; outline: none; color: var(--dsw-alias-label-primary); }
.todo-quick-input::placeholder { color: var(--dsw-alias-label-caption); }
.todo-quick-submit {
  display: inline-flex; align-items: center; gap: 5px;
  height: 26px; padding: 0 10px; border: 0; border-radius: var(--dsw-radius-sm);
  background: var(--dsw-alias-bg-layer-2); color: var(--dsw-alias-label-secondary);
  cursor: pointer; font-size: 12px;
}
.todo-quick-submit:hover { background: var(--dsw-alias-interactive-bg-hover); color: var(--dsw-alias-label-primary); }
.todo-quick-foot { min-height: 15px; padding-left: 2px; }
.todo-quick-hint { font-size: 11px; color: var(--dsw-alias-label-caption); }
.todo-quick-error { font-size: 11px; color: var(--todo-danger); }
.todo-quick-chips { display: inline-flex; flex-wrap: wrap; gap: 5px; }

/* ---------- 任务列表 ---------- */
.todo-groups { display: flex; flex-direction: column; gap: 16px; }
.todo-group { display: flex; flex-direction: column; gap: 5px; }
.todo-group-head { display: flex; align-items: center; gap: 8px; padding: 0 2px; }
.todo-group-head h3 { margin: 0; font-size: 11.5px; font-weight: 600; letter-spacing: 0.06em; text-transform: uppercase; color: var(--dsw-alias-label-tertiary); }
.todo-group-count { font-size: 10.5px; color: var(--dsw-alias-label-caption); }
.todo-group-danger .todo-group-head h3 { color: var(--todo-danger); }
.todo-group-accent .todo-group-head h3 { color: var(--todo-accent); }
.todo-group-muted { opacity: 0.82; }
.todo-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 2px; }
.todo-item {
  display: flex; align-items: flex-start; gap: 8px;
  padding: 7px 6px 7px 9px; border-radius: var(--dsw-radius-sm);
  border: 1px solid transparent; position: relative;
  transition: background 120ms ease, border-color 120ms ease;
}
.todo-item:hover { background: var(--dsw-alias-interactive-bg-hover); }
.todo-item.is-focused { border-color: color-mix(in oklab, var(--todo-accent) 40%, transparent); background: color-mix(in oklab, var(--todo-accent) 7%, transparent); }
.todo-priority-bar {
  position: absolute; left: 0; top: 8px; bottom: 8px; width: 3px;
  border-radius: 999px; background: transparent;
}
.todo-priority-p1.todo-priority-bar, .todo-priority-p1 .todo-priority-bar { background: var(--todo-danger); }
.todo-priority-p2.todo-priority-bar, .todo-priority-p2 .todo-priority-bar { background: var(--todo-warn); }
.todo-priority-p3.todo-priority-bar, .todo-priority-p3 .todo-priority-bar { background: var(--todo-accent); }
.todo-priority-p4.todo-priority-bar, .todo-priority-p4 .todo-priority-bar { background: var(--dsw-alias-label-caption); }
.todo-check {
  display: grid; place-items: center; flex: none;
  width: 17px; height: 17px; margin-top: 2px; padding: 0;
  border-radius: 50%; border: 1.6px solid var(--dsw-alias-border-l3);
  background: transparent; color: var(--dsw-alias-label-primary-inverted); cursor: pointer;
}
.todo-check:hover { border-color: var(--todo-accent); }
.todo-check.is-checked { background: var(--todo-accent); border-color: var(--todo-accent); }
.todo-check-sm { width: 14px; height: 14px; margin-top: 1px; }
.todo-item-main { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 3px; }
.todo-item-line { display: flex; align-items: center; gap: 7px; min-width: 0; }
.todo-item-title {
  flex: 1; min-width: 0; border: 0; background: transparent; padding: 0; text-align: left;
  color: var(--dsw-alias-label-primary); cursor: pointer; font-size: 13.5px;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.todo-item-title:hover { text-decoration: underline; text-underline-offset: 2px; }
.todo-item.is-done .todo-item-title { color: var(--dsw-alias-label-tertiary); text-decoration: line-through; }
.todo-item.is-done { opacity: 0.72; }
.todo-priority-label { font-size: 10px; font-weight: 700; }
.todo-priority-label.todo-priority-p1 { color: var(--todo-danger); }
.todo-priority-label.todo-priority-p2 { color: var(--todo-warn); }
.todo-priority-label.todo-priority-p3 { color: var(--todo-accent); }
.todo-priority-label.todo-priority-p4 { color: var(--dsw-alias-label-tertiary); }
.todo-item-meta { display: flex; flex-wrap: wrap; align-items: center; gap: 4px; }
.todo-chip {
  display: inline-flex; align-items: center; gap: 3px;
  max-width: 220px; padding: 0 6px; height: 18px;
  border-radius: var(--dsw-radius-xs);
  background: var(--dsw-alias-bg-layer-2);
  color: var(--dsw-alias-label-tertiary);
  font-size: 10.5px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.todo-chip-due.is-overdue { color: var(--todo-danger); background: color-mix(in oklab, var(--todo-danger) 12%, transparent); }
.todo-chip-project { color: var(--dsw-alias-label-secondary); }
.todo-chip-label { color: var(--dsw-alias-label-secondary); }
.todo-chip-pom { color: var(--todo-accent); }
.todo-chip-button { border: 0; cursor: pointer; font-family: inherit; }
.todo-chip-button:hover { background: var(--dsw-alias-interactive-bg-hover); color: var(--dsw-alias-label-primary); }
.todo-chip-p1 { color: var(--todo-danger); }
.todo-chip-p2 { color: var(--todo-warn); }
.todo-chip-p3 { color: var(--todo-accent); }
.todo-chevron { transition: transform 120ms ease; }
.todo-chevron.is-open { transform: rotate(90deg); }
.todo-chevron-left { transform: rotate(180deg); }
.todo-item-actions { display: flex; gap: 1px; opacity: 0; transition: opacity 120ms ease; }
.todo-item:hover .todo-item-actions,
.todo-item:focus-within .todo-item-actions { opacity: 1; }
.todo-sublist { list-style: none; margin: 4px 0 0; padding: 0 0 0 2px; display: flex; flex-direction: column; gap: 1px; border-left: 1px solid var(--dsw-alias-border-l1); }
.todo-subitem { display: flex; align-items: flex-start; gap: 7px; padding: 3px 4px 3px 9px; border-radius: var(--dsw-radius-xs); }
.todo-subitem:hover { background: var(--dsw-alias-interactive-bg-hover); }
.todo-subitem-title { flex: 1; min-width: 0; border: 0; background: transparent; padding: 0; text-align: left; cursor: pointer;
  color: var(--dsw-alias-label-secondary); font-size: 12.5px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.todo-subitem.is-done .todo-subitem-title { color: var(--dsw-alias-label-caption); text-decoration: line-through; }
.todo-empty {
  display: flex; flex-direction: column; align-items: center; gap: 8px;
  padding: 34px 16px; color: var(--dsw-alias-label-tertiary);
  border: 1px dashed var(--dsw-alias-border-l1); border-radius: var(--dsw-radius-lg);
}
.todo-empty p { margin: 0; font-size: 12.5px; }
.todo-dot { width: 7px; height: 7px; border-radius: 50%; flex: none; }
.todo-color-tomato { color: var(--todo-danger); background: var(--todo-danger); }
.todo-color-amber { color: var(--todo-warn); background: var(--todo-warn); }
.todo-color-lime { color: var(--todo-ok); background: var(--todo-ok); }
.todo-color-sky { color: var(--todo-accent); background: var(--todo-accent); }
.todo-color-grape { color: color-mix(in oklab, var(--todo-danger) 45%, var(--todo-accent)); background: color-mix(in oklab, var(--todo-danger) 45%, var(--todo-accent)); }
.todo-color-slate { color: var(--dsw-alias-label-tertiary); background: var(--dsw-alias-label-tertiary); }
.todo-project .todo-color-swatch, .todo-color-swatch.todo-color-tomato { background: var(--todo-danger); color: var(--todo-danger); }

/* ---------- 按钮 ---------- */
.todo-btn {
  display: inline-flex; align-items: center; justify-content: center; gap: 6px;
  height: 30px; padding: 0 12px; border-radius: var(--dsw-radius-sm);
  border: 1px solid var(--dsw-alias-border-l1);
  background: var(--dsw-alias-bg-layer-1); color: var(--dsw-alias-label-primary);
  cursor: pointer; font-size: 12.5px;
}
.todo-btn:hover { background: var(--dsw-alias-interactive-bg-hover); }
.todo-btn-sm { height: 26px; padding: 0 9px; font-size: 11.5px; }
.todo-btn-lg { height: 36px; padding: 0 18px; font-size: 13px; }
.todo-btn-primary { background: var(--todo-accent); border-color: var(--todo-accent); color: var(--dsw-alias-label-primary-inverted); }
.todo-btn-primary:hover { background: color-mix(in oklab, var(--todo-accent) 86%, var(--dsw-alias-label-primary)); }
.todo-btn-ghost { background: transparent; color: var(--dsw-alias-label-secondary); }
.todo-btn-danger { color: var(--todo-danger); border-color: color-mix(in oklab, var(--todo-danger) 30%, transparent); background: transparent; }
.todo-btn-danger:hover { background: color-mix(in oklab, var(--todo-danger) 12%, transparent); }
.todo-input {
  width: 100%; height: 30px; padding: 0 8px;
  border: 1px solid var(--dsw-alias-border-l1); border-radius: var(--dsw-radius-sm);
  background: var(--dsw-alias-bg-layer-1); color: var(--dsw-alias-label-primary); outline: none;
}
.todo-input:focus { border-color: var(--todo-accent); }
.todo-input-title { height: 34px; font-size: 15px; font-weight: 600; }
.todo-input-time { width: auto; min-width: 84px; }
.todo-input-num { width: 62px; text-align: right; }
.todo-textarea {
  width: 100%; padding: 7px 8px; resize: vertical; min-height: 72px;
  border: 1px solid var(--dsw-alias-border-l1); border-radius: var(--dsw-radius-sm);
  background: var(--dsw-alias-bg-layer-1); color: var(--dsw-alias-label-primary); outline: none; line-height: 1.55;
}
.todo-textarea:focus { border-color: var(--todo-accent); }

/* ---------- 详情抽屉 ---------- */
.todo-drawer-overlay {
  position: absolute; inset: 0; z-index: 30;
  display: flex; justify-content: flex-end;
  background: var(--dsw-alias-bg-overlay, color-mix(in oklab, var(--dsw-alias-bg-base) 55%, transparent));
  backdrop-filter: blur(1.5px);
}
.todo-drawer {
  display: flex; flex-direction: column; width: min(400px, 100%); height: 100%;
  background: var(--dsw-alias-bg-layer-1);
  border-left: 1px solid var(--dsw-alias-border-l1);
  box-shadow: var(--dsw-shadow-lv3);
  animation: todo-slide-in 160ms ease;
}
@keyframes todo-slide-in { from { transform: translateX(12px); } to { transform: none; } }
.todo-drawer-head {
  display: flex; align-items: center; justify-content: space-between; gap: 8px;
  padding: 13px 14px; flex: none; border-bottom: 1px solid var(--dsw-alias-border-l1);
}
.todo-drawer-headline { display: flex; align-items: baseline; gap: 8px; min-width: 0; }
.todo-drawer-headline h2 { margin: 0; font-size: 14px; font-weight: 650; }
.todo-save-state { font-size: 10.5px; color: var(--dsw-alias-label-caption); }
.todo-save-state.is-saving { color: var(--todo-accent); }
.todo-drawer-body { flex: 1; min-height: 0; overflow-y: auto; padding: 14px; display: flex; flex-direction: column; gap: 13px; scrollbar-width: thin; }
.todo-field { display: flex; flex-direction: column; gap: 5px; }
.todo-field-head { display: flex; align-items: baseline; justify-content: space-between; }
.todo-field-label { font-size: 10.5px; font-weight: 600; letter-spacing: 0.08em; text-transform: uppercase; color: var(--dsw-alias-label-tertiary); }
.todo-field-aside { font-size: 10.5px; color: var(--dsw-alias-label-caption); }
.todo-due-row { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
.todo-segment { display: inline-flex; gap: 3px; flex-wrap: wrap; }
.todo-segment-btn {
  height: 26px; min-width: 40px; padding: 0 8px; border-radius: var(--dsw-radius-sm);
  border: 1px solid var(--dsw-alias-border-l1); background: var(--dsw-alias-bg-base);
  color: var(--dsw-alias-label-secondary); cursor: pointer; font-size: 11.5px;
}
.todo-segment-btn:hover { color: var(--dsw-alias-label-primary); }
.todo-segment-btn.is-active { border-color: currentColor; background: color-mix(in oklab, currentColor 13%, transparent); color: var(--dsw-alias-label-primary); }
.todo-segment-btn.todo-priority-p1.is-active { color: var(--todo-danger); }
.todo-segment-btn.todo-priority-p2.is-active { color: var(--todo-warn); }
.todo-segment-btn.todo-priority-p3.is-active { color: var(--todo-accent); }
.todo-drawer-subtasks { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 2px; }
.todo-drawer-subtask { display: flex; align-items: center; gap: 7px; padding: 3px 2px; }
.todo-drawer-subtask-title { flex: 1; min-width: 0; font-size: 12.5px; color: var(--dsw-alias-label-secondary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.todo-drawer-subtask.is-done .todo-drawer-subtask-title { color: var(--dsw-alias-label-caption); text-decoration: line-through; }
.todo-subtask-add { display: flex; gap: 6px; align-items: center; }
.todo-subtask-add .todo-btn { white-space: nowrap; flex: none; }
.todo-drawer-pom {
  display: flex; align-items: center; justify-content: space-between; gap: 10px;
  padding: 9px 10px; border-radius: var(--dsw-radius-md);
  background: var(--dsw-alias-bg-layer-2); border: 1px solid var(--dsw-alias-border-l1);
  font-size: 12px;
}
.todo-drawer-pom > div { display: flex; flex-direction: column; gap: 2px; }
.todo-drawer-meta { margin: 0; font-size: 10.5px; color: var(--dsw-alias-label-caption); }
.todo-drawer-foot { flex: none; padding: 10px 14px; border-top: 1px solid var(--dsw-alias-border-l1); }

/* ---------- 番茄钟视图 ---------- */
.todo-pom { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 22px; max-width: 980px; margin: 0 auto; align-items: start; }
.todo-root.is-immersive .todo-nav,
.todo-root.is-immersive .todo-topbar { display: none; }
.todo-root.is-immersive .todo-body { display: flex; align-items: center; justify-content: center; padding: 24px; }
.todo-root.is-immersive .todo-pom { grid-template-columns: minmax(0, 1fr); max-width: 560px; }
.todo-root.is-immersive .todo-pom-side { display: none; }
.todo-pom-main { display: flex; flex-direction: column; align-items: center; gap: 14px; }
.todo-pom-modes { display: inline-flex; gap: 3px; padding: 3px; border-radius: 999px; background: var(--dsw-alias-bg-layer-2); border: 1px solid var(--dsw-alias-border-l1); }
.todo-pom-mode {
  display: inline-flex; align-items: baseline; gap: 4px;
  height: 26px; padding: 0 12px; border: 0; border-radius: 999px;
  background: transparent; color: var(--dsw-alias-label-tertiary); cursor: pointer; font-size: 12px;
}
.todo-pom-mode span { font-size: 10px; opacity: 0.75; }
.todo-pom-mode:hover { color: var(--dsw-alias-label-primary); }
.todo-pom-mode.is-active { background: var(--dsw-alias-bg-layer-1); color: var(--dsw-alias-label-primary); box-shadow: var(--dsw-shadow-lv1); }
.todo-pom-clock { position: relative; display: grid; place-items: center; width: 240px; height: 240px; }
.todo-pom-ring { position: absolute; inset: 0; width: 100%; height: 100%; transform: rotate(-90deg); }
.todo-pom-ring-track { fill: none; stroke: var(--dsw-alias-bg-layer-3); stroke-width: 7; }
.todo-pom-ring-fill {
  fill: none; stroke: var(--todo-danger); stroke-width: 7; stroke-linecap: round;
  transition: stroke-dashoffset 400ms linear, stroke 200ms ease;
}
.todo-pom-clock.todo-mode-short .todo-pom-ring-fill,
.todo-pom-clock.todo-mode-long .todo-pom-ring-fill { stroke: var(--todo-ok); }
.todo-pom-clock-inner { display: flex; flex-direction: column; align-items: center; gap: 3px; }
.todo-pom-time { font-size: 44px; font-weight: 300; letter-spacing: -0.02em; font-variant-numeric: tabular-nums; }
.todo-pom-state { font-size: 11px; letter-spacing: 0.14em; text-transform: uppercase; color: var(--dsw-alias-label-tertiary); }
.todo-pom-cycle { font-size: 11px; color: var(--dsw-alias-label-caption); }
.todo-pom-controls { display: flex; align-items: center; gap: 7px; flex-wrap: wrap; justify-content: center; }
.todo-pom-immersive { width: 30px; height: 30px; border: 1px solid var(--dsw-alias-border-l1); border-radius: var(--dsw-radius-sm); }
.todo-pom-bind { display: flex; align-items: center; gap: 8px; width: 100%; max-width: 420px; color: var(--dsw-alias-label-tertiary); }
.todo-pom-bind .todo-input { flex: 1; min-width: 0; }
.todo-pom-bound { max-width: 140px; font-size: 11px; color: var(--dsw-alias-label-secondary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.todo-pom-hint { margin: 0; text-align: center; font-size: 12px; color: var(--dsw-alias-label-tertiary); }
.todo-pom-side { display: flex; flex-direction: column; gap: 14px; min-width: 0; }
.todo-stat-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px; }
.todo-stat {
  display: flex; flex-direction: column; gap: 1px; padding: 9px 10px;
  border-radius: var(--dsw-radius-md); background: var(--dsw-alias-bg-layer-1);
  border: 1px solid var(--dsw-alias-border-l1); min-width: 0;
}
.todo-stat-label { font-size: 10px; letter-spacing: 0.05em; text-transform: uppercase; color: var(--dsw-alias-label-caption); }
.todo-stat-value { font-size: 20px; font-weight: 600; font-variant-numeric: tabular-nums; }
.todo-stat-sub { font-size: 10.5px; color: var(--dsw-alias-label-tertiary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.todo-pom-chart {
  display: flex; align-items: flex-end; gap: 6px; height: 116px; padding: 10px;
  border-radius: var(--dsw-radius-md); background: var(--dsw-alias-bg-layer-1);
  border: 1px solid var(--dsw-alias-border-l1);
}
.todo-pom-bar { display: flex; flex-direction: column; align-items: center; gap: 3px; flex: 1; height: 100%; min-width: 0; }
.todo-pom-bar-value { font-size: 9.5px; color: var(--dsw-alias-label-tertiary); font-variant-numeric: tabular-nums; }
.todo-pom-bar-track { flex: 1; display: flex; align-items: flex-end; width: 100%; max-width: 18px; border-radius: 3px; background: var(--dsw-alias-bg-layer-2); overflow: hidden; }
.todo-pom-bar-fill { width: 100%; border-radius: 3px; background: color-mix(in oklab, var(--todo-danger) 78%, transparent); }
.todo-pom-bar-day { font-size: 9.5px; color: var(--dsw-alias-label-caption); }
.todo-pom-settings, .todo-pom-log {
  display: flex; flex-direction: column; gap: 8px; padding: 11px;
  border-radius: var(--dsw-radius-md); background: var(--dsw-alias-bg-layer-1);
  border: 1px solid var(--dsw-alias-border-l1);
}
.todo-pom-settings h3, .todo-pom-log h3 { margin: 0; font-size: 11.5px; letter-spacing: 0.07em; text-transform: uppercase; color: var(--dsw-alias-label-tertiary); }
.todo-pom-settings-hint { margin: 0; font-size: 10.5px; color: var(--dsw-alias-label-caption); }
.todo-settings-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 7px 10px; }
.todo-setting { display: flex; align-items: center; justify-content: space-between; gap: 8px; font-size: 11.5px; color: var(--dsw-alias-label-secondary); }
.todo-setting .todo-input { width: auto; }
.todo-setting-toggle input { width: 15px; height: 15px; accent-color: var(--todo-accent); }
.todo-pom-log ul { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 3px; }
.todo-pom-log li { display: flex; align-items: center; gap: 6px; font-size: 11.5px; color: var(--dsw-alias-label-secondary); }
.todo-pom-log-task { margin-left: auto; max-width: 150px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--dsw-alias-label-tertiary); }
.todo-pom-empty { margin: 0; font-size: 11.5px; color: var(--dsw-alias-label-caption); }

/* ---------- 日历 ---------- */
.todo-calendar { display: flex; flex-direction: column; gap: 12px; max-width: 980px; margin: 0 auto; }
.todo-calendar-head { display: flex; align-items: center; justify-content: space-between; gap: 10px; flex-wrap: wrap; }
.todo-calendar-nav { display: flex; align-items: center; gap: 6px; }
.todo-calendar-title { margin: 0; font-size: 15px; font-weight: 650; min-width: 120px; }
.todo-calendar-grid {
  display: grid; grid-template-columns: repeat(7, minmax(0, 1fr)); gap: 4px;
  padding: 8px; border-radius: var(--dsw-radius-lg); background: var(--dsw-alias-bg-layer-1);
  border: 1px solid var(--dsw-alias-border-l1);
}
.todo-calendar-weekday { padding: 4px 6px; font-size: 11px; font-weight: 600; letter-spacing: 0.08em; text-transform: uppercase; color: var(--dsw-alias-label-secondary); text-align: center; }
.todo-calendar-cell {
  display: flex; flex-direction: column; gap: 3px;
  min-height: 82px; padding: 6px 7px; border-radius: var(--dsw-radius-sm);
  border: 1px solid var(--dsw-alias-border-l1); background: var(--dsw-alias-bg-layer-2); cursor: pointer; text-align: left;
  color: var(--dsw-alias-label-primary); overflow: hidden;
  transition: background 120ms ease, border-color 120ms ease;
}
.todo-calendar-cell.is-empty { border-color: transparent; background: transparent; }
.todo-calendar-cell:hover { background: var(--dsw-alias-interactive-bg-hover); }
.todo-calendar-cell.is-empty { cursor: default; background: transparent; }
.todo-calendar-cell.is-today { border-color: color-mix(in oklab, var(--todo-accent) 45%, transparent); }
.todo-calendar-cell.is-selected { background: color-mix(in oklab, var(--todo-accent) 12%, transparent); border-color: var(--todo-accent); }
.todo-calendar-cell-top { display: flex; align-items: center; justify-content: space-between; }
.todo-calendar-num { font-size: 11.5px; font-variant-numeric: tabular-nums; color: var(--dsw-alias-label-secondary); }
.todo-calendar-cell.is-today .todo-calendar-num { color: var(--todo-accent); font-weight: 700; }
.todo-calendar-dot { width: 5px; height: 5px; border-radius: 50%; background: var(--todo-accent); }
.todo-calendar-pills { display: flex; flex-direction: column; gap: 2px; min-height: 0; overflow: hidden; }
.todo-calendar-pill {
  display: block; padding: 1px 4px; border-radius: 3px;
  font-size: 9.5px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  background: var(--dsw-alias-bg-layer-2); color: var(--dsw-alias-label-secondary);
  border-left: 2px solid var(--dsw-alias-border-l3);
}
.todo-calendar-pill.todo-priority-p1 { border-left-color: var(--todo-danger); }
.todo-calendar-pill.todo-priority-p2 { border-left-color: var(--todo-warn); }
.todo-calendar-pill.todo-priority-p3 { border-left-color: var(--todo-accent); }
.todo-calendar-pill.is-done { opacity: 0.55; text-decoration: line-through; }
.todo-calendar-more { font-size: 9.5px; color: var(--dsw-alias-label-caption); }
.todo-calendar-selected { display: flex; flex-direction: column; gap: 4px; margin-top: 4px; }

/* ---------- 提示条 ---------- */
.todo-toast {
  position: absolute; left: 50%; bottom: 18px; z-index: 40;
  display: flex; align-items: center; gap: 9px; max-width: min(560px, calc(100% - 32px));
  padding: 8px 9px 8px 13px; border-radius: var(--dsw-radius-md);
  background: var(--dsw-alias-bg-layer-3);
  border: 1px solid var(--dsw-alias-border-l1);
  box-shadow: var(--dsw-shadow-lv2);
  transform: translateX(-50%);
  animation: todo-toast-in 160ms ease;
}
@keyframes todo-toast-in { from { transform: translate(-50%, 6px); opacity: 0; } to { transform: translate(-50%, 0); opacity: 1; } }
.todo-toast-text { font-size: 12.5px; }
.todo-toast-detail { font-size: 11px; color: var(--dsw-alias-label-tertiary); }
.todo-toast-error .todo-toast-text { color: var(--todo-danger); }
.todo-toast-ok .todo-toast-text { color: var(--todo-ok); }
.todo-toast-action {
  border: 0; background: transparent; color: var(--todo-accent); cursor: pointer;
  font-size: 11.5px; font-weight: 600; padding: 2px 5px; border-radius: var(--dsw-radius-xs);
}
.todo-toast-action:hover { background: var(--dsw-alias-interactive-bg-hover); }
.todo-toast-close { display: grid; place-items: center; width: 20px; height: 20px; border: 0; border-radius: var(--dsw-radius-xs); background: transparent; color: var(--dsw-alias-label-tertiary); cursor: pointer; }
.todo-toast-close:hover { background: var(--dsw-alias-interactive-bg-hover); color: var(--dsw-alias-label-primary); }

/* ---------- 窄屏 ---------- */
@media (max-width: 860px) {
  .todo-root { grid-template-columns: minmax(0, 1fr); }
  .todo-nav { display: none; }
  .todo-view-select { display: inline-block; }
  .todo-topbar { padding: 10px 12px; }
  .todo-body { padding: 12px 12px 22px; }
  .todo-pom { grid-template-columns: minmax(0, 1fr); }
  .todo-pom-clock { width: 200px; height: 200px; }
  .todo-pom-time { font-size: 36px; }
  .todo-search { min-width: 120px; flex: 1; }
  .todo-calendar-cell { min-height: 60px; padding: 4px; }
  .todo-calendar-pill { display: none; }
  .todo-item-actions { opacity: 1; }
  .todo-project-actions { opacity: 1; }
}
@media (max-width: 520px) {
  .todo-topbar { padding: 10px; }
  .todo-topbar-tools { display: flex; flex-wrap: wrap; width: 100%; gap: 6px; }
  .todo-search { order: 1; flex: 1 1 100%; min-width: 0; width: auto; }
  .todo-view-select { order: 2; flex: 1 1 auto; min-width: 0; width: auto; }
  .todo-capsule { order: 3; flex: none; margin-left: auto; }
  .todo-refresh { order: 4; flex: none; }
  .todo-filters { order: 5; flex: 1 1 100%; overflow-x: auto; padding-bottom: 2px; }
  .todo-progress-track { width: 60px; }
  .todo-pom-time { font-size: 32px; }
  .todo-stat-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}
@media (prefers-reduced-motion: reduce) {
  .todo-root *, .todo-root *::before, .todo-root *::after { animation-duration: 0.001ms !important; transition-duration: 0.001ms !important; }
}
`;

    function ensureStyles() {
      const existing = document.getElementById(`${NS}-style`);
      if (existing) {
        existing.textContent = CSS;
        return () => {
          const tag = document.getElementById(`${NS}-style`);
          if (tag) tag.remove();
        };
      }
      const tag = document.createElement("style");
      tag.id = `${NS}-style`;
      tag.textContent = CSS;
      document.head.append(tag);
      return () => {
        const current = document.getElementById(`${NS}-style`);
        if (current) current.remove();
      };
    }

    /* ============================ 注册 ============================ */

    const __preview = {
      TodoPage,
      parseQuickAdd,
      pomodoroReducer,
      DICT,
      PANEL_ID,
      API,
      localDate,
      formatDue,
      // 以下为测试与预览额外暴露的纯函数，不影响宿主契约。
      createPomodoroEngine,
      STORAGE_KEY,
      normalizePomodoro,
      freshPomodoro,
      modeMinutes,
      pomodoroRemaining,
      deriveView,
      computeStats,
      formatClock,
      sortTasks,
      activeLocale,
      setPreviewLocale: (locale) => {
        previewLocale = locale === "zh" || locale === "en" ? locale : null;
      },
      /* 预览页与渲染冒烟测试用的内部件；不属于宿主契约，不保证稳定。 */
      __internal: {
        dataStore,
        pomodoroEngine,
        TaskRow,
        TaskList,
        QuickAdd,
        TaskDetail,
        CalendarView,
        PomodoroView,
        Sidebar,
        TopBar,
        ToastView,
        deriveView: (options) => deriveView(options),
        computeStats,
        childrenOf,
        sortTasks,
        DEFAULT_SETTINGS,
      },
    };

    function apply(ctx) {
      clientCtx = ctx;
      const demo = typeof window !== "undefined" ? window.__dshTodoPreview : undefined;
      if (demo && (demo.locale === "zh" || demo.locale === "en")) previewLocale = demo.locale;

      ctx.effect(() => ensureStyles(), `${NS}: styles`);
      ctx.effect(() => installShortcuts(ctx), `${NS}: shortcuts`);

      localeApi = ctx.locale || null;
      if (localeApi) {
        if (typeof localeApi.register === "function") {
          ctx.effect(() => localeApi.register(NS, DICT), `${NS}: dictionaries`);
        }
        if (typeof localeApi.bind === "function") {
          try {
            boundTranslate = localeApi.bind(NS);
          } catch {
            boundTranslate = null;
          }
        }
      }

      ctx.effect(() => {
        const releasePomodoro = pomodoroEngine.retain();
        return () => {
          releasePomodoro();
          dataStore.dispose();
        };
      }, `${NS}: pomodoro engine`);

      ctx.slots.inject("sidebar.panellist", () =>
        ctx.slots.register(
          {
            name: "sidebar.panellist",
            id: PANEL_ID,
            order: 22,
            label: () => t("panel.title"),
          },
          // 宿主会传 size（展开侧栏 16 / 收起图标轨 18）与 active，原样转发
          (props) => h(PanelIcon, props || {}),
        ),
      );

      ctx.slots.inject("main", () =>
        ctx.slots.register(
          {
            name: "main",
            key: PANEL_ID,
          },
          () => h(TodoPage, {}),
        ),
      );

      ctx.slots.inject("conversation.composer.dock", () =>
        ctx.slots.register(
          {
            name: "conversation.composer.dock",
            id: "dsh-todo-pomodoro",
            order: 2,
          },
          () => h(PomodoroDock, {}),
        ),
      );
    }

    if (typeof window !== "undefined") window.__preview = __preview;

    return { inject: ["slots", "locale"], apply, __preview };
  },
});
