const STORAGE_KEY = "life-os-planner-state-v1";
const root = document.getElementById("appRoot");
const navList = document.getElementById("navList");
const bottomTabs = document.getElementById("bottomTabs");
const sidebar = document.getElementById("sidebar");
const menuBtn = document.getElementById("menuBtn");
const quickAddBtn = document.getElementById("quickAddBtn");
const quickModal = document.getElementById("quickModal");
const quickForm = document.getElementById("quickForm");
const toast = document.getElementById("toast");
const searchInput = document.getElementById("searchInput");
const themeBtn = document.getElementById("themeBtn");
const importFile = document.getElementById("importFile");
const exportBtn = document.getElementById("exportBtn");
const spaceList = document.getElementById("spaceList");
const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

let voiceRecognition = null;
let voiceListening = false;

const statusMap = {
  planned: { label: "برنامه ریزی", tone: "neutral" },
  doing: { label: "در حال انجام", tone: "blue" },
  done: { label: "انجام شده", tone: "green" }
};

const priorityMap = {
  low: { label: "کم", tone: "neutral" },
  medium: { label: "متوسط", tone: "gold" },
  high: { label: "زیاد", tone: "rose" }
};

const areaMap = {
  personal: { label: "شخصی", color: "#2f6f67" },
  work: { label: "کار", color: "#3f6fae" },
  health: { label: "سلامت", color: "#46714e" },
  learning: { label: "یادگیری", color: "#8c6f2f" }
};

const weekDays = ["ش", "ی", "د", "س", "چ", "پ", "ج"];
const monthNames = [
  "ژانویه",
  "فوریه",
  "مارس",
  "آوریل",
  "مه",
  "ژوئن",
  "ژوئیه",
  "اوت",
  "سپتامبر",
  "اکتبر",
  "نوامبر",
  "دسامبر"
];

let state = loadState();
let currentView = state.ui.currentView || "dashboard";
let taskView = state.ui.taskView || "table";
let activeNoteId = state.ui.activeNoteId || state.notes[0]?.id || null;

hydrateIcons(document);
applyTheme();
render();
registerServiceWorker();

navList.addEventListener("click", (event) => {
  const button = event.target.closest("[data-view]");
  if (!button) return;
  setView(button.dataset.view);
});

bottomTabs.addEventListener("click", (event) => {
  const button = event.target.closest("[data-view]");
  if (!button) return;
  setView(button.dataset.view);
});

menuBtn.addEventListener("click", () => {
  sidebar.classList.toggle("is-open");
});

document.addEventListener("click", (event) => {
  if (window.innerWidth > 820) return;
  const clickedSidebar = event.target.closest("#sidebar");
  const clickedMenu = event.target.closest("#menuBtn");
  if (!clickedSidebar && !clickedMenu) sidebar.classList.remove("is-open");
});

quickAddBtn.addEventListener("click", () => {
  openQuickModal();
});

quickForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const formData = new FormData(quickForm);
  const title = String(formData.get("title") || "").trim();
  const type = String(formData.get("type"));
  const note = String(formData.get("note") || "").trim();
  const due = String(formData.get("due") || "").trim();
  const time = String(formData.get("time") || "").trim();
  if (!title) return;
  addQuickItem(type, title, note, { due, time });
  quickForm.reset();
  quickModal.close();
  showToast("ذخیره شد");
});

quickModal.addEventListener("click", (event) => {
  if (event.target === quickModal) quickModal.close();
});

document.querySelectorAll("[data-close-modal]").forEach((button) => {
  button.addEventListener("click", () => quickModal.close());
});

themeBtn.addEventListener("click", () => {
  state.ui.theme = state.ui.theme === "dark" ? "light" : "dark";
  saveState();
  applyTheme();
});

searchInput.addEventListener("input", () => {
  render();
});

exportBtn.addEventListener("click", () => {
  const payload = JSON.stringify({ ...state, exportedAt: new Date().toISOString() }, null, 2);
  const blob = new Blob([payload], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `life-os-backup-${todayISO()}.json`;
  link.click();
  URL.revokeObjectURL(url);
  showToast("فایل بکاپ آماده شد");
});

importFile.addEventListener("change", async () => {
  const file = importFile.files?.[0];
  if (!file) return;
  try {
    const text = await file.text();
    const imported = normalizeState(JSON.parse(text));
    state = imported;
    currentView = state.ui.currentView || "dashboard";
    taskView = state.ui.taskView || "table";
    activeNoteId = state.ui.activeNoteId || state.notes[0]?.id || null;
    saveState();
    applyTheme();
    render();
    showToast("داده ها وارد شدند");
  } catch (error) {
    showToast("فایل قابل خواندن نیست");
  } finally {
    importFile.value = "";
  }
});

root.addEventListener("click", (event) => {
  const action = event.target.closest("[data-action]");
  if (!action) return;

  const id = action.dataset.id;
  const type = action.dataset.type;

  switch (action.dataset.action) {
    case "add-task":
      addTask();
      break;
    case "add-voice-task":
      startVoiceTask();
      break;
    case "voice-fill-task":
      startVoiceTask(id);
      break;
    case "toggle-task-done":
      toggleTaskDone(id);
      break;
    case "add-monthly-goal":
      addMonthlyGoal();
      break;
    case "add-yearly-goal":
      addYearlyGoal();
      break;
    case "add-note":
      addNote();
      break;
    case "add-note-block":
      addNoteBlock(id);
      break;
    case "delete":
      deleteItem(type, id);
      break;
    case "duplicate-task":
      duplicateTask(id);
      break;
    case "set-task-view":
      taskView = action.dataset.taskView;
      state.ui.taskView = taskView;
      saveState();
      render();
      break;
    case "set-note":
      activeNoteId = id;
      state.ui.activeNoteId = id;
      saveState();
      render();
      break;
    case "open-view":
      setView(action.dataset.view);
      break;
    case "toggle-habit":
      toggleHabit(id, action.dataset.day);
      break;
    case "increment-progress":
      bumpProgress(type, id, Number(action.dataset.amount));
      break;
    default:
      break;
  }
});

root.addEventListener("change", (event) => {
  const field = event.target.closest("[data-field]");
  if (!field) return;
  updateField(field);
});

root.addEventListener("input", (event) => {
  const field = event.target.closest("[data-field]");
  if (!field) return;
  updateField(field, true);
});

function setView(view) {
  currentView = view;
  state.ui.currentView = view;
  saveState();
  sidebar.classList.remove("is-open");
  render();
}

function render() {
  renderSpaces();
  setActiveNavigation();

  const query = searchInput.value.trim().toLowerCase();
  if (query) {
    root.innerHTML = renderSearch(query);
  } else if (currentView === "dashboard") {
    root.innerHTML = renderDashboard();
  } else if (currentView === "today") {
    root.innerHTML = renderToday();
  } else if (currentView === "month") {
    root.innerHTML = renderMonth();
  } else if (currentView === "year") {
    root.innerHTML = renderYear();
  } else if (currentView === "calendar") {
    root.innerHTML = renderCalendar();
  } else if (currentView === "notes") {
    root.innerHTML = renderNotes();
  }

  hydrateIcons(root);
}

function renderDashboard() {
  return renderDailyPlannerSheet(false);
}

function renderToday() {
  const tasks = state.tasks.slice().sort((a, b) => {
    const dueCompare = String(a.due).localeCompare(String(b.due));
    if (dueCompare !== 0) return dueCompare;
    const timeCompare = String(a.time || "99:99").localeCompare(String(b.time || "99:99"));
    if (timeCompare !== 0) return timeCompare;
    return priorityWeight(b.priority) - priorityWeight(a.priority);
  });

  return `
    ${renderDailyPlannerSheet(true)}
    <div class="database-toolbar">
      <button class="view-pill ${taskView === "table" ? "is-active" : ""}" type="button" data-action="set-task-view" data-task-view="table">
        <span class="icon" data-icon="grid"></span>
        جدول
      </button>
      <button class="view-pill ${taskView === "board" ? "is-active" : ""}" type="button" data-action="set-task-view" data-task-view="board">
        <span class="icon" data-icon="copy"></span>
        برد
      </button>
      <button class="voice-button" type="button" data-action="add-voice-task">
        <span class="icon" data-icon="mic"></span>
        تسک صوتی
      </button>
      <button class="primary-button" type="button" data-action="add-task">
        <span class="icon" data-icon="plus"></span>
        ردیف جدید
      </button>
    </div>
    ${taskView === "board" ? renderTaskBoard(tasks) : renderTaskTable(tasks)}
  `;
}

function renderDailyPlannerSheet(compact = false) {
  const today = todayISO();
  const todayTasks = tasksForDate(today);
  const focusTasks = (todayTasks.length ? todayTasks : state.tasks)
    .slice()
    .sort((a, b) => priorityWeight(b.priority) - priorityWeight(a.priority))
    .slice(0, 4);
  const priorityTasks = state.tasks
    .filter((task) => task.status !== "done")
    .slice()
    .sort((a, b) => priorityWeight(b.priority) - priorityWeight(a.priority))
    .slice(0, 5);
  const doneToday = todayTasks.filter((task) => task.status === "done").length;

  return `
    <section class="planner-sheet ${compact ? "is-compact" : ""}">
      <div class="planner-top">
        <div class="planner-title-card">
          <span>DAILY</span>
          <strong>PLANNER</strong>
          <p>FOCUS • PLAN • EXECUTE • ACHIEVE</p>
        </div>
        <div class="planner-date-area">
          <div class="planner-input-row">
            <label>DATE :</label>
            <span>${formatDateDigits(today)}</span>
            <button class="planner-square" type="button" data-action="open-view" data-view="calendar">
              <span class="icon" data-icon="calendar"></span>
            </button>
          </div>
          <div class="planner-input-row">
            <label>MONTH :</label>
            <span>${monthNames[new Date().getMonth()]} ${new Date().getFullYear()}</span>
            <button class="planner-square is-muted" type="button" data-action="open-view" data-view="month">
              <span class="icon" data-icon="calendar"></span>
            </button>
          </div>
          ${renderWeekChecklist(today)}
        </div>
      </div>

      <div class="planner-actions">
        <button class="voice-button" type="button" data-action="add-voice-task">
          <span class="icon" data-icon="mic"></span>
          تسک صوتی
        </button>
        <button class="primary-button" type="button" data-action="add-task">
          <span class="icon" data-icon="plus"></span>
          تسک جدید
        </button>
      </div>

      <div class="planner-main-grid">
        <aside class="planner-left">
          ${plannerPanel("target", "TODAY'S PRIORITIES", renderPriorityLines(priorityTasks))}
          ${plannerPanel("clock", "SCHEDULE", renderScheduleRows())}
          ${plannerPanel("file", "UNSCHEDULED", renderUnscheduledTasks())}
        </aside>

        <section class="planner-center">
          ${plannerPanel("calendar", "FOCUS TASKS", renderFocusTasks(focusTasks, doneToday, todayTasks.length), "planner-focus-panel")}
          <div class="planner-three">
            ${plannerPanel("target", "TODAY'S GOALS", renderGoalLines())}
            ${plannerPanel("file", "LEARN & IMPROVE", renderLearnImprove())}
            ${plannerPanel("grid", "CHALLENGES / SOLUTIONS", renderChallenges())}
          </div>
        </section>
      </div>

      <div class="planner-bottom-grid">
        ${plannerPanel("grid", "HABIT TRACKER", renderPlannerHabitTracker(), "planner-habit-panel")}
        ${plannerPanel("target", "DAILY REVIEW", renderDailyReview(), "planner-review-panel")}
      </div>

      <footer class="planner-quote">DISCIPLINE TODAY, FREEDOM TOMORROW.</footer>
    </section>
  `;
}

function plannerPanel(icon, title, content, extraClass = "") {
  return `
    <section class="planner-panel ${extraClass}">
      <div class="planner-panel-title">
        <span class="icon" data-icon="${icon}"></span>
        <strong>${title}</strong>
      </div>
      <div class="planner-panel-body">${content}</div>
    </section>
  `;
}

function renderWeekChecklist(activeISO) {
  const activeDay = new Date(`${activeISO}T00:00:00`).getDay();
  const days = [
    ["MON", 1],
    ["TUE", 2],
    ["WED", 3],
    ["THU", 4],
    ["FRI", 5],
    ["SAT", 6],
    ["SUN", 0]
  ];
  return `
    <div class="planner-week">
      ${days.map(([label, index]) => `
        <div class="planner-week-day ${index === activeDay ? "is-active" : ""}">
          <strong>${label}</strong>
          <span></span>
        </div>
      `).join("")}
    </div>
  `;
}

function renderPriorityLines(tasks) {
  const rows = Array.from({ length: 5 }, (_, index) => tasks[index]);
  return `
    <div class="priority-lines">
      ${rows.map((task, index) => `
        <div class="priority-line">
          <b>${index + 1}</b>
          <span>${task ? escapeHTML(task.title) : ""}</span>
        </div>
      `).join("")}
    </div>
  `;
}

function renderScheduleRows() {
  const hours = Array.from({ length: 17 }, (_, index) => `${String(index + 6).padStart(2, "0")}:00`);
  const scheduledTasks = state.tasks
    .filter((task) => task.status !== "done" && task.due === todayISO() && isTime(task.time))
    .sort((a, b) => a.time.localeCompare(b.time));
  return `
    <div class="schedule-table">
      <div class="schedule-head"><span>TIME</span><span>PLAN</span></div>
      ${hours.map((hour) => {
        const items = scheduledTasks.filter((task) => task.time.slice(0, 2) === hour.slice(0, 2));
        return `
        <div class="schedule-row">
          <time>${hour}</time>
          <span>${items.map((task) => `${escapeHTML(task.time)} - ${escapeHTML(task.title)}`).join("، ")}</span>
        </div>
      `;
      }).join("")}
    </div>
  `;
}

function renderUnscheduledTasks() {
  const tasks = state.tasks
    .filter((task) => task.status !== "done" && task.due === todayISO() && !isTime(task.time))
    .slice(0, 5);
  return `
    <div class="unscheduled-list">
      ${tasks.length ? tasks.map((task) => `
        <div class="unscheduled-item">
          <strong>${escapeHTML(task.title)}</strong>
          <span>${escapeHTML(priorityMap[task.priority]?.label || "متوسط")} / ${escapeHTML(areaMap[task.area]?.label || "شخصی")}</span>
        </div>
      `).join("") : `<p class="muted-line">همه تسک های امروز زمان دارند.</p>`}
    </div>
  `;
}

function renderFocusTasks(tasks, doneToday, totalToday) {
  const rows = tasks.length ? tasks : [createTaskDraft({ title: "تسک امروز را اضافه کن" })];
  return `
    <div class="focus-done">✓ = DONE <span>${doneToday}/${totalToday || 0}</span></div>
    <div class="focus-list">
      ${rows.map((task, index) => `
        <article class="focus-card">
          <button class="planner-check ${task.status === "done" ? "is-checked" : ""}" type="button" data-action="toggle-task-done" data-id="${task.id}" aria-label="انجام شد"></button>
          <div class="focus-badge ${task.area}">
            <span>${index + 1}</span>
            <small>${escapeHTML(areaMap[task.area]?.label || "عمومی")}</small>
          </div>
          <div class="focus-copy">
            <h3>${escapeHTML(task.title)}</h3>
            <p>توضیحات / هدف امروز:</p>
            <div class="dotted-line">${escapeHTML(task.note || "جزئیات این کار را با صوت یا ویرایش دستی کامل کن.")}</div>
            <div class="dotted-line"></div>
          </div>
          <aside class="focus-note">
            <label class="focus-time-field">
              <span>ساعت دقیق</span>
              <input type="time" data-field="time" data-type="task" data-id="${task.id}" value="${escapeAttr(task.time || "")}" />
            </label>
            <p>یادداشت / نکته:</p>
            <div class="dotted-line">${escapeHTML(priorityMap[task.priority]?.label || "")}</div>
            <div class="dotted-line">${escapeHTML(areaMap[task.area]?.label || "")}</div>
          </aside>
        </article>
      `).join("")}
    </div>
  `;
}

function renderGoalLines() {
  const goals = state.monthlyGoals.slice(0, 5);
  return `
    <div class="goal-lines">
      ${Array.from({ length: 5 }, (_, index) => `
        <div><span></span><p>${escapeHTML(goals[index]?.title || "")}</p></div>
      `).join("")}
    </div>
  `;
}

function renderLearnImprove() {
  const learningTask = state.tasks.find((task) => task.area === "learning") || state.tasks[0];
  return `
    <div class="planner-lined-text">
      <label>امروز یاد می گیرم:</label>
      <p>${escapeHTML(learningTask?.title || "")}</p>
      <p></p>
      <label>منبع / مرجع:</label>
      <p>${escapeHTML(learningTask?.note || "")}</p>
    </div>
  `;
}

function renderChallenges() {
  const hardTask = state.tasks.slice().sort((a, b) => priorityWeight(b.priority) - priorityWeight(a.priority))[0];
  return `
    <div class="planner-lined-text">
      <label>چالش های امروز:</label>
      <p>${escapeHTML(hardTask?.title || "")}</p>
      <p></p>
      <label>راه حل ها:</label>
      <p>${escapeHTML(hardTask?.note || "")}</p>
    </div>
  `;
}

function renderPlannerHabitTracker() {
  const days = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"];
  return `
    <div class="habit-sheet">
      <div class="habit-sheet-row is-head">
        <strong>HABIT</strong>
        ${days.map((day) => `<span>${day}</span>`).join("")}
      </div>
      ${state.habits.slice(0, 5).map((habit) => `
        <div class="habit-sheet-row">
          <strong>${escapeHTML(habit.title)}</strong>
          ${lastNDates(7).map((date) => `<span class="${habit.days.includes(date) ? "is-done" : ""}"></span>`).join("")}
        </div>
      `).join("")}
    </div>
  `;
}

function renderDailyReview() {
  return `
    <div class="planner-lined-text review-lines">
      <label>چه چیزی خوب پیش رفت؟</label>
      <p></p>
      <label>چه چیزی می تواند بهتر شود؟</label>
      <p></p>
      <label>تمرکز فردا:</label>
      <p>${escapeHTML(state.tasks.find((task) => task.status !== "done")?.title || "")}</p>
    </div>
  `;
}

function toggleTaskDone(id) {
  const task = state.tasks.find((item) => item.id === id);
  if (!task) return;
  task.status = task.status === "done" ? "planned" : "done";
  saveState();
  render();
}

function formatDateDigits(iso) {
  const date = parseISO(iso);
  return `${date.getFullYear()} / ${String(date.getMonth() + 1).padStart(2, "0")} / ${String(date.getDate()).padStart(2, "0")}`;
}

function renderMonth() {
  const month = new Date().getMonth();
  const year = new Date().getFullYear();
  const monthGoals = state.monthlyGoals;
  const monthTasks = state.tasks.filter((task) => {
    const date = parseISO(task.due);
    return date.getMonth() === month && date.getFullYear() === year;
  });

  return `
    ${pageHeader("Monthly Operating System", "برنامه ماهانه", "هدف های ماه، شاخص پیشرفت، عادت ها و تسک های مهم این ماه در یک نگاه.")}
    <div class="database-toolbar">
      <button class="primary-button" type="button" data-action="add-monthly-goal">
        <span class="icon" data-icon="plus"></span>
        هدف ماهانه
      </button>
    </div>
    <div class="month-grid">
      <section class="panel">
        <div class="panel-head">
          <div>
            <h2>هدف های این ماه</h2>
            <small>${monthNames[month]} ${year}</small>
          </div>
        </div>
        <div class="block-list">
          ${monthGoals.length ? monthGoals.map(renderMonthlyGoal).join("") : emptyState("هدف ماهانه اضافه کن.")}
        </div>
      </section>

      <section class="panel">
        <div class="panel-head">
          <div>
            <h2>ردیاب عادت ها</h2>
            <small>۳۰ خانه اخیر</small>
          </div>
        </div>
        ${renderHabits()}
      </section>
    </div>

    <section class="panel" style="margin-top:14px">
      <div class="panel-head">
        <div>
          <h2>تسک های ماه</h2>
          <small>${monthTasks.length} مورد</small>
        </div>
        <button class="secondary-button" type="button" data-action="open-view" data-view="today">مدیریت دیتابیس</button>
      </div>
      <div class="block-list">
        ${monthTasks.length ? monthTasks.slice(0, 8).map(renderTaskBlock).join("") : emptyState("برای این ماه تسکی ثبت نشده است.")}
      </div>
    </section>
  `;
}

function renderYear() {
  return `
    ${pageHeader("Yearly Roadmap", "برنامه سالانه", "اهداف بزرگ را به فصل ها، قدم های قابل اندازه گیری و پیشرفت روشن تبدیل کن.")}
    <div class="database-toolbar">
      <button class="primary-button" type="button" data-action="add-yearly-goal">
        <span class="icon" data-icon="plus"></span>
        هدف سالانه
      </button>
    </div>
    <div class="goal-grid">
      ${state.yearlyGoals.length ? state.yearlyGoals.map(renderYearlyGoal).join("") : emptyState("یک هدف سالانه بساز و آن را به فصل ها تقسیم کن.")}
    </div>
  `;
}

function renderCalendar() {
  const today = new Date();
  const year = today.getFullYear();
  const month = today.getMonth();
  const first = new Date(year, month, 1);
  const startOffset = (first.getDay() + 1) % 7;
  const start = new Date(year, month, 1 - startOffset);
  const days = Array.from({ length: 42 }, (_, index) => {
    const date = new Date(start);
    date.setDate(start.getDate() + index);
    return date;
  });

  return `
    ${pageHeader("Calendar", "تقویم", "نمای ماهانه برای دیدن تسک ها، موعدها و تمرکزهای روزانه.")}
    <section class="calendar-shell">
      <div class="calendar-header">
        ${weekDays.map((day) => `<span>${day}</span>`).join("")}
      </div>
      <div class="calendar-grid">
        ${days.map((day) => renderCalendarDay(day, month)).join("")}
      </div>
    </section>
  `;
}

function renderNotes() {
  if (!activeNoteId && state.notes[0]) activeNoteId = state.notes[0].id;
  const active = state.notes.find((note) => note.id === activeNoteId) || state.notes[0];

  return `
    ${pageHeader("Pages", "یادداشت ها", "صفحه ها و بلوک ها برای ایده ها، تصمیم ها، چک لیست ها و برنامه های آزاد.")}
    <div class="database-toolbar">
      <button class="primary-button" type="button" data-action="add-note">
        <span class="icon" data-icon="plus"></span>
        صفحه جدید
      </button>
    </div>
    <div class="note-layout">
      <aside class="note-list">
        ${state.notes.map((note) => `
          <button class="note-item ${note.id === active?.id ? "is-active" : ""}" type="button" data-action="set-note" data-id="${note.id}">
            <strong>${escapeHTML(note.title)}</strong>
            <small>${escapeHTML(note.blocks[0]?.text || "صفحه خالی")}</small>
          </button>
        `).join("")}
      </aside>
      <section class="panel editor">
        ${active ? renderNoteEditor(active) : emptyState("یک یادداشت جدید بساز.")}
      </section>
    </div>
  `;
}

function renderSearch(query) {
  const tasks = state.tasks.filter((task) => searchIn([task.title, task.note, task.area, task.status, task.time], query));
  const monthlyGoals = state.monthlyGoals.filter((goal) => searchIn([goal.title, goal.note], query));
  const yearlyGoals = state.yearlyGoals.filter((goal) => searchIn([goal.title, goal.note], query));
  const notes = state.notes.filter((note) => searchIn([note.title, ...note.blocks.map((block) => block.text)], query));

  return `
    ${pageHeader("Search", "نتیجه جستجو", `برای «${escapeHTML(searchInput.value.trim())}»`)}
    <div class="dashboard-grid">
      <section class="panel">
        <div class="panel-head"><h2>تسک ها</h2><small>${tasks.length} مورد</small></div>
        <div class="block-list">${tasks.length ? tasks.map(renderTaskBlock).join("") : emptyState("تسکی پیدا نشد.")}</div>
      </section>
      <section class="panel">
        <div class="panel-head"><h2>هدف ها و یادداشت ها</h2><small>${monthlyGoals.length + yearlyGoals.length + notes.length} مورد</small></div>
        <div class="block-list">
          ${monthlyGoals.map((goal) => renderSearchBlock("هدف ماهانه", goal.title, goal.note, "month")).join("")}
          ${yearlyGoals.map((goal) => renderSearchBlock("هدف سالانه", goal.title, goal.note, "year")).join("")}
          ${notes.map((note) => renderSearchBlock("یادداشت", note.title, note.blocks[0]?.text || "", "notes")).join("")}
          ${monthlyGoals.length + yearlyGoals.length + notes.length ? "" : emptyState("موردی پیدا نشد.")}
        </div>
      </section>
    </div>
  `;
}

function renderTaskTable(tasks) {
  return `
    <section class="database">
      <div class="database-head">
        <div>
          <h2>Daily Tasks</h2>
          <small>${tasks.length} ردیف</small>
        </div>
      </div>
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>نام</th>
              <th>وضعیت</th>
              <th>اولویت</th>
              <th>حوزه</th>
              <th>تاریخ</th>
              <th>ساعت</th>
              <th>یادداشت</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            ${tasks.map((task) => `
              <tr>
                <td class="title-cell">
                  <input class="title-input" data-field="title" data-type="task" data-id="${task.id}" value="${escapeAttr(task.title)}" />
                </td>
                <td>
                  <select class="plain-select" data-field="status" data-type="task" data-id="${task.id}">
                    ${Object.entries(statusMap).map(([value, meta]) => `<option value="${value}" ${task.status === value ? "selected" : ""}>${meta.label}</option>`).join("")}
                  </select>
                </td>
                <td>
                  <select class="plain-select" data-field="priority" data-type="task" data-id="${task.id}">
                    ${Object.entries(priorityMap).map(([value, meta]) => `<option value="${value}" ${task.priority === value ? "selected" : ""}>${meta.label}</option>`).join("")}
                  </select>
                </td>
                <td>
                  <select class="plain-select" data-field="area" data-type="task" data-id="${task.id}">
                    ${Object.entries(areaMap).map(([value, meta]) => `<option value="${value}" ${task.area === value ? "selected" : ""}>${meta.label}</option>`).join("")}
                  </select>
                </td>
                <td>
                  <input class="plain-input" type="date" data-field="due" data-type="task" data-id="${task.id}" value="${escapeAttr(task.due)}" />
                </td>
                <td>
                  <input class="plain-input time-input" type="time" data-field="time" data-type="task" data-id="${task.id}" value="${escapeAttr(task.time || "")}" />
                </td>
                <td>
                  <input class="plain-input" data-field="note" data-type="task" data-id="${task.id}" value="${escapeAttr(task.note || "")}" placeholder="جزئیات" />
                </td>
                <td>
                  <div class="row-actions">
                    <button class="tiny-button" type="button" data-action="voice-fill-task" data-id="${task.id}" aria-label="پر کردن با صوت">
                      <span class="icon" data-icon="mic"></span>
                    </button>
                    <button class="tiny-button" type="button" data-action="duplicate-task" data-id="${task.id}" aria-label="کپی">
                      <span class="icon" data-icon="copy"></span>
                    </button>
                    <button class="tiny-button" type="button" data-action="delete" data-type="task" data-id="${task.id}" aria-label="حذف">
                      <span class="icon" data-icon="trash"></span>
                    </button>
                  </div>
                </td>
              </tr>
            `).join("")}
          </tbody>
        </table>
      </div>
    </section>
  `;
}

function renderTaskBoard(tasks) {
  return `
    <div class="kanban">
      ${Object.entries(statusMap).map(([status, meta]) => {
        const group = tasks.filter((task) => task.status === status);
        return `
          <section class="kanban-col">
            <div class="kanban-title">
              <span>${meta.label}</span>
              <small>${group.length}</small>
            </div>
            ${group.map((task) => `
              <article class="kanban-card">
                <strong>${escapeHTML(task.title)}</strong>
                <div class="block-meta">
                  ${tag(priorityMap[task.priority].label, priorityMap[task.priority].tone)}
                  ${tag(areaMap[task.area].label, "neutral")}
                  ${task.time ? tag(task.time, "gold") : ""}
                  ${tag(formatShortDate(task.due), "blue")}
                </div>
                <select class="plain-select" data-field="status" data-type="task" data-id="${task.id}">
                  ${Object.entries(statusMap).map(([value, item]) => `<option value="${value}" ${task.status === value ? "selected" : ""}>${item.label}</option>`).join("")}
                </select>
              </article>
            `).join("")}
          </section>
        `;
      }).join("")}
    </div>
  `;
}

function renderTaskBlock(task) {
  const status = statusMap[task.status] || statusMap.planned;
  const priority = priorityMap[task.priority] || priorityMap.medium;
  return `
    <article class="block">
      <div class="block-title">
        <span class="drag-handle">::</span>
        <strong>${escapeHTML(task.title)}</strong>
      </div>
      <div class="block-meta">
        ${tag(status.label, status.tone)}
        ${tag(priority.label, priority.tone)}
        ${tag(areaMap[task.area]?.label || "عمومی", "neutral")}
        ${task.time ? tag(task.time, "gold") : ""}
        ${tag(formatShortDate(task.due), "blue")}
      </div>
      ${task.note ? `<small>${escapeHTML(task.note)}</small>` : ""}
    </article>
  `;
}

function renderMonthlyGoal(goal) {
  return `
    <article class="block">
      <input class="title-input" data-field="title" data-type="monthlyGoal" data-id="${goal.id}" value="${escapeAttr(goal.title)}" />
      <textarea class="plain-textarea" data-field="note" data-type="monthlyGoal" data-id="${goal.id}" placeholder="چرایی، خروجی قابل تحویل، معیار موفقیت">${escapeHTML(goal.note || "")}</textarea>
      ${progress(goal.progress)}
      <div class="block-meta">
        <button class="chip" type="button" data-action="increment-progress" data-type="monthlyGoal" data-id="${goal.id}" data-amount="-10">-۱۰</button>
        <button class="chip" type="button" data-action="increment-progress" data-type="monthlyGoal" data-id="${goal.id}" data-amount="10">+۱۰</button>
        <button class="tiny-button" type="button" data-action="delete" data-type="monthlyGoal" data-id="${goal.id}" aria-label="حذف">
          <span class="icon" data-icon="trash"></span>
        </button>
      </div>
    </article>
  `;
}

function renderHabits() {
  return `
    <div class="block-list">
      ${state.habits.map((habit) => `
        <article class="block">
          <div class="block-title">
            <strong>${escapeHTML(habit.title)}</strong>
          </div>
          <div class="habit-grid">
            ${lastNDates(30).map((date) => `
              <button class="habit-day ${habit.days.includes(date) ? "is-done" : ""}" type="button" data-action="toggle-habit" data-id="${habit.id}" data-day="${date}" aria-label="${formatShortDate(date)}">
                ${new Date(`${date}T00:00:00`).getDate()}
              </button>
            `).join("")}
          </div>
        </article>
      `).join("")}
    </div>
  `;
}

function renderYearlyGoal(goal) {
  const quarters = goal.quarters || [];
  return `
    <article class="goal-card">
      <input class="title-input" data-field="title" data-type="yearlyGoal" data-id="${goal.id}" value="${escapeAttr(goal.title)}" />
      <textarea class="plain-textarea" data-field="note" data-type="yearlyGoal" data-id="${goal.id}" placeholder="تصویر نهایی این هدف در پایان سال">${escapeHTML(goal.note || "")}</textarea>
      ${progress(goal.progress)}
      <div class="quarter-list">
        ${quarters.map((quarter, index) => `
          <div class="quarter">
            <strong>Q${index + 1}</strong>
            <input class="plain-input" data-field="quarters.${index}" data-type="yearlyGoal" data-id="${goal.id}" value="${escapeAttr(quarter)}" />
            ${tag(index < currentQuarter() ? "مرور" : index === currentQuarter() ? "اکنون" : "بعدا", index === currentQuarter() ? "green" : "neutral")}
          </div>
        `).join("")}
      </div>
      <div class="block-meta">
        <button class="chip" type="button" data-action="increment-progress" data-type="yearlyGoal" data-id="${goal.id}" data-amount="-5">-۵</button>
        <button class="chip" type="button" data-action="increment-progress" data-type="yearlyGoal" data-id="${goal.id}" data-amount="5">+۵</button>
        <button class="tiny-button" type="button" data-action="delete" data-type="yearlyGoal" data-id="${goal.id}" aria-label="حذف">
          <span class="icon" data-icon="trash"></span>
        </button>
      </div>
    </article>
  `;
}

function renderCalendarDay(day, activeMonth) {
  const iso = toISO(day);
  const events = tasksForDate(iso).slice(0, 3);
  const classes = [
    "calendar-day",
    day.getMonth() !== activeMonth ? "is-muted" : "",
    iso === todayISO() ? "is-today" : ""
  ].filter(Boolean).join(" ");

  return `
    <div class="${classes}">
      <div class="day-number">
        <span>${day.getDate()}</span>
        ${events.length ? `<small>${events.length}</small>` : ""}
      </div>
      ${events.map((task) => `<span class="event-pill">${task.time ? `${escapeHTML(task.time)} ` : ""}${escapeHTML(task.title)}</span>`).join("")}
    </div>
  `;
}

function renderNoteEditor(note) {
  return `
    <input class="note-title-input" data-field="title" data-type="note" data-id="${note.id}" value="${escapeAttr(note.title)}" />
    <div class="block-list">
      ${note.blocks.map((block) => `
        <div class="note-block">
          <span class="drag-handle">::</span>
          <textarea data-field="blocks.${block.id}" data-type="noteBlock" data-id="${note.id}" placeholder="بنویس...">${escapeHTML(block.text)}</textarea>
          <button class="tiny-button" type="button" data-action="delete" data-type="noteBlock" data-id="${note.id}:${block.id}" aria-label="حذف بلوک">
            <span class="icon" data-icon="trash"></span>
          </button>
        </div>
      `).join("")}
    </div>
    <button class="secondary-button" type="button" data-action="add-note-block" data-id="${note.id}">
      <span class="icon" data-icon="plus"></span>
      بلوک جدید
    </button>
  `;
}

function renderSummaryBlock(title, subtitle, value, view) {
  return `
    <article class="block">
      <div class="block-title">
        <span class="drag-handle">::</span>
        <strong>${title}</strong>
      </div>
      <div class="block-meta">
        ${tag(subtitle, "neutral")}
        ${tag(typeof value === "number" ? `${value}%` : value, "green")}
      </div>
      <button class="secondary-button" type="button" data-action="open-view" data-view="${view}">باز کردن</button>
    </article>
  `;
}

function renderSearchBlock(type, title, note, view) {
  return `
    <article class="block">
      <div class="block-title">
        <span class="drag-handle">::</span>
        <strong>${escapeHTML(title)}</strong>
      </div>
      <div class="block-meta">${tag(type, "blue")}</div>
      ${note ? `<small>${escapeHTML(note)}</small>` : ""}
      <button class="secondary-button" type="button" data-action="open-view" data-view="${view}">باز کردن</button>
    </article>
  `;
}

function pageCover() {
  return `<div class="page-cover" aria-hidden="true"></div>`;
}

function pageHeader(eyebrow, title, description) {
  return `
    ${pageCover()}
    <div class="page-title-row">
      <div class="page-title">
        <span class="eyebrow">${eyebrow}</span>
        <h1>${title}</h1>
        <p>${description}</p>
      </div>
    </div>
  `;
}

function metric(label, value) {
  return `
    <div class="metric">
      <span>${label}</span>
      <strong>${value}</strong>
    </div>
  `;
}

function tag(label, tone = "neutral") {
  return `<span class="tag ${tone}">${escapeHTML(String(label))}</span>`;
}

function progress(value) {
  const safe = clamp(Number(value) || 0, 0, 100);
  return `
    <div class="progress-wrap">
      <div class="progress-track"><div class="progress-bar" style="--value:${safe}%"></div></div>
      <span class="progress-label">${safe}% پیشرفت</span>
    </div>
  `;
}

function emptyState(text) {
  return `<div class="empty-state">${escapeHTML(text)}</div>`;
}

function createTaskDraft(overrides = {}) {
  return {
    id: uid("task"),
    title: "تسک جدید",
    status: "planned",
    priority: "medium",
    area: "personal",
    due: todayISO(),
    time: "",
    note: "",
    ...overrides
  };
}

function addTask(overrides = {}) {
  state.tasks.unshift(createTaskDraft(overrides));
  currentView = "today";
  state.ui.currentView = "today";
  saveState();
  render();
}

function startVoiceTask(taskId = null) {
  if (voiceListening) {
    stopVoiceRecognition();
    return;
  }

  if (!SpeechRecognition) {
    const fallback = prompt("متن تسک را بگو یا با دیکته کیبورد وارد کن:");
    if (fallback?.trim()) applyVoiceTask(fallback, taskId);
    return;
  }

  voiceRecognition = new SpeechRecognition();
  voiceRecognition.lang = "fa-IR";
  voiceRecognition.interimResults = false;
  voiceRecognition.maxAlternatives = 1;
  voiceRecognition.continuous = false;

  voiceRecognition.addEventListener("start", () => {
    voiceListening = true;
    document.documentElement.classList.add("is-listening");
    showToast("در حال گوش دادن...");
  });

  voiceRecognition.addEventListener("result", (event) => {
    const transcript = Array.from(event.results)
      .map((result) => result[0]?.transcript || "")
      .join(" ")
      .trim();
    if (transcript) {
      applyVoiceTask(transcript, taskId);
    } else {
      showToast("چیزی شنیده نشد");
    }
  });

  voiceRecognition.addEventListener("error", () => {
    showToast("دسترسی صدا برقرار نشد");
  });

  voiceRecognition.addEventListener("end", () => {
    voiceListening = false;
    document.documentElement.classList.remove("is-listening");
  });

  try {
    voiceRecognition.start();
  } catch (error) {
    showToast("ضبط صدا آماده نیست");
  }
}

function stopVoiceRecognition() {
  if (!voiceRecognition) return;
  voiceRecognition.stop();
}

function applyVoiceTask(transcript, taskId = null) {
  const taskFields = parseVoiceTask(transcript);

  if (taskId) {
    const task = state.tasks.find((item) => item.id === taskId);
    if (!task) return;
    Object.assign(task, taskFields);
    showToast("ردیف با صوت پر شد");
  } else {
    state.tasks.unshift(createTaskDraft(taskFields));
    showToast("تسک صوتی ساخته شد");
  }

  currentView = "today";
  state.ui.currentView = "today";
  saveState();
  render();
}

function parseVoiceTask(transcript) {
  const raw = normalizeSpeechText(transcript);
  const note = extractSpeechSection(raw, ["یادداشت", "توضیح", "جزئیات", "نکته"]);
  const explicitTitle = extractSpeechSection(raw, ["عنوان", "اسم"]);
  const title = cleanupVoiceTitle(explicitTitle || raw);

  return {
    title: title || "تسک صوتی",
    status: detectSpeechStatus(raw),
    priority: detectSpeechPriority(raw),
    area: detectSpeechArea(raw),
    due: detectSpeechDate(raw),
    time: detectSpeechTime(raw),
    note: note || `متن صوتی: ${transcript.trim()}`
  };
}

function normalizeSpeechText(value) {
  return toEnglishDigits(String(value || ""))
    .replaceAll("ي", "ی")
    .replaceAll("ك", "ک")
    .replaceAll("‌", " ")
    .replace(/\s+/g, " ")
    .trim();
}

function extractSpeechSection(text, starters) {
  const starterPattern = starters.join("|");
  const boundaryPattern = "(عنوان|اسم|اولویت|اهمیت|حوزه|دسته|وضعیت|تاریخ|زمان|برای|یادداشت|توضیح|جزئیات|نکته)";
  const match = text.match(new RegExp(`(?:${starterPattern})\\s*[:：،-]?\\s*(.+?)(?=\\s+${boundaryPattern}\\s|$)`, "i"));
  return match ? cleanupVoiceTitle(match[1]) : "";
}

function cleanupVoiceTitle(text) {
  return normalizeSpeechText(text)
    .replace(/^(یک|یه|لطفا|لطفاً|تسک|کار|ردیف|جدید)\s+/g, "")
    .replace(/(?:اولویت|اهمیت)\s*(بالا|زیاد|فوری|مهم|متوسط|معمولی|کم|پایین)/g, "")
    .replace(/(?:حوزه|دسته)\s*(کاری|کار|سلامت|ورزش|یادگیری|مطالعه|شخصی|خانه|خانواده)/g, "")
    .replace(/(?:وضعیت)\s*(انجام شده|انجام شد|تمام شده|تمام شد|در حال انجام|شروع شده|برنامه ریزی|باز)/g, "")
    .replace(/(?:ساعت|زمان|راس|رأس|حدود)\s*\d{1,2}(?:(?::| و )\s*(?:\d{1,2}|نیم|ربع))?/g, "")
    .replace(/(?:برای|تاریخ|زمان)\s*(امروز|فردا|پس فردا|هفته بعد|هفته آینده|ماه بعد|شنبه|یکشنبه|دوشنبه|سه شنبه|سه‌شنبه|چهارشنبه|پنجشنبه|جمعه)/g, "")
    .replace(/(?:یادداشت|توضیح|جزئیات|نکته)\s*[:：،-]?.*$/g, "")
    .replace(/[،,.؛;:]+$/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function detectSpeechPriority(text) {
  if (containsAny(text, ["فوری", "مهم", "اولویت بالا", "اهمیت بالا", "اولویت زیاد", "زیاد"])) return "high";
  if (containsAny(text, ["اولویت کم", "اهمیت کم", "کم", "پایین"])) return "low";
  return "medium";
}

function detectSpeechStatus(text) {
  if (containsAny(text, ["انجام شد", "انجام شده", "تمام شد", "تمام شده", "کامل شد"])) return "done";
  if (containsAny(text, ["در حال انجام", "شروع کردم", "شروع شده", "دارم انجام میدم", "دارم انجام می‌دم"])) return "doing";
  return "planned";
}

function detectSpeechArea(text) {
  if (containsAny(text, ["کار", "کاری", "پروژه", "جلسه", "مشتری", "شرکت"])) return "work";
  if (containsAny(text, ["سلامت", "ورزش", "دکتر", "دارو", "خواب", "پیاده روی", "پیاده‌روی"])) return "health";
  if (containsAny(text, ["یادگیری", "مطالعه", "درس", "کلاس", "زبان", "کتاب"])) return "learning";
  return "personal";
}

function detectSpeechDate(text) {
  if (containsAny(text, ["پس فردا"])) return toISO(addDays(new Date(), 2));
  if (containsAny(text, ["فردا"])) return toISO(addDays(new Date(), 1));
  if (containsAny(text, ["هفته بعد", "هفته آینده"])) return toISO(addDays(new Date(), 7));
  if (containsAny(text, ["ماه بعد", "ماه آینده"])) return toISO(addDays(new Date(), 30));

  const weekdays = [
    ["شنبه", 6],
    ["یکشنبه", 0],
    ["دوشنبه", 1],
    ["سه شنبه", 2],
    ["سه‌شنبه", 2],
    ["چهارشنبه", 3],
    ["پنجشنبه", 4],
    ["جمعه", 5]
  ];
  const found = weekdays.find(([label]) => text.includes(label));
  if (found) {
    const today = new Date();
    let diff = (found[1] - today.getDay() + 7) % 7;
    if (diff === 0) diff = 7;
    return toISO(addDays(today, diff));
  }

  return todayISO();
}

function detectSpeechTime(text) {
  const normalized = normalizeSpeechText(text);
  const explicit = normalized.match(/(?:ساعت|زمان|راس|رأس|حدود)\s*(\d{1,2})(?:(?::| و )\s*(\d{1,2}|نیم|ربع))?/);
  const compact = normalized.match(/\b(\d{1,2}):(\d{2})\b/);
  const match = explicit || compact;
  if (!match) return "";

  let hour = Number(match[1]);
  let minute = 0;
  if (match[2] === "نیم") minute = 30;
  else if (match[2] === "ربع") minute = 15;
  else if (match[2]) minute = Number(match[2]);

  if (containsAny(normalized, ["بعد از ظهر", "عصر", "شب"]) && hour < 12) hour += 12;
  if (!Number.isInteger(hour) || !Number.isInteger(minute) || hour < 0 || hour > 23 || minute < 0 || minute > 59) return "";

  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

function containsAny(text, words) {
  return words.some((word) => text.includes(word));
}

function toEnglishDigits(value) {
  const persian = "۰۱۲۳۴۵۶۷۸۹";
  const arabic = "٠١٢٣٤٥٦٧٨٩";
  return String(value).replace(/[۰-۹٠-٩]/g, (digit) => {
    const persianIndex = persian.indexOf(digit);
    if (persianIndex >= 0) return String(persianIndex);
    return String(arabic.indexOf(digit));
  });
}

function addMonthlyGoal() {
  state.monthlyGoals.unshift({
    id: uid("month"),
    title: "هدف ماهانه جدید",
    note: "",
    progress: 0
  });
  currentView = "month";
  state.ui.currentView = "month";
  saveState();
  render();
}

function addYearlyGoal() {
  state.yearlyGoals.unshift({
    id: uid("year"),
    title: "هدف سالانه جدید",
    note: "",
    progress: 0,
    quarters: ["", "", "", ""]
  });
  currentView = "year";
  state.ui.currentView = "year";
  saveState();
  render();
}

function addNote() {
  const note = {
    id: uid("note"),
    title: "صفحه جدید",
    blocks: [{ id: uid("block"), text: "" }]
  };
  state.notes.unshift(note);
  activeNoteId = note.id;
  state.ui.activeNoteId = note.id;
  currentView = "notes";
  state.ui.currentView = "notes";
  saveState();
  render();
}

function addNoteBlock(noteId) {
  const note = state.notes.find((item) => item.id === noteId);
  if (!note) return;
  note.blocks.push({ id: uid("block"), text: "" });
  saveState();
  render();
}

function addQuickItem(type, title, note, options = {}) {
  if (type === "task") {
    state.tasks.unshift(createTaskDraft({
      title,
      status: "planned",
      priority: "medium",
      area: "personal",
      due: isISODate(options.due) ? options.due : todayISO(),
      time: isTime(options.time) ? options.time : "",
      note
    }));
    currentView = "today";
  } else if (type === "monthlyGoal") {
    state.monthlyGoals.unshift({ id: uid("month"), title, note, progress: 0 });
    currentView = "month";
  } else if (type === "yearlyGoal") {
    state.yearlyGoals.unshift({ id: uid("year"), title, note, progress: 0, quarters: ["", "", "", ""] });
    currentView = "year";
  } else {
    const newNote = { id: uid("note"), title, blocks: [{ id: uid("block"), text: note }] };
    state.notes.unshift(newNote);
    activeNoteId = newNote.id;
    state.ui.activeNoteId = newNote.id;
    currentView = "notes";
  }
  state.ui.currentView = currentView;
  saveState();
  render();
}

function deleteItem(type, id) {
  if (type === "task") {
    state.tasks = state.tasks.filter((task) => task.id !== id);
  } else if (type === "monthlyGoal") {
    state.monthlyGoals = state.monthlyGoals.filter((goal) => goal.id !== id);
  } else if (type === "yearlyGoal") {
    state.yearlyGoals = state.yearlyGoals.filter((goal) => goal.id !== id);
  } else if (type === "noteBlock") {
    const [noteId, blockId] = id.split(":");
    const note = state.notes.find((item) => item.id === noteId);
    if (note) note.blocks = note.blocks.filter((block) => block.id !== blockId);
  }
  saveState();
  render();
}

function duplicateTask(id) {
  const task = state.tasks.find((item) => item.id === id);
  if (!task) return;
  state.tasks.unshift({ ...task, id: uid("task"), title: `${task.title} - کپی` });
  saveState();
  render();
}

function toggleHabit(id, day) {
  const habit = state.habits.find((item) => item.id === id);
  if (!habit) return;
  if (habit.days.includes(day)) {
    habit.days = habit.days.filter((item) => item !== day);
  } else {
    habit.days.push(day);
  }
  saveState();
  render();
}

function bumpProgress(type, id, amount) {
  const collection = type === "monthlyGoal" ? state.monthlyGoals : state.yearlyGoals;
  const item = collection.find((goal) => goal.id === id);
  if (!item) return;
  item.progress = clamp((Number(item.progress) || 0) + amount, 0, 100);
  saveState();
  render();
}

function updateField(field, skipRender = false) {
  const { type, id, field: key } = field.dataset;
  const value = field.type === "checkbox" ? field.checked : field.value;

  if (type === "task") {
    updateCollectionItem(state.tasks, id, key, value);
  } else if (type === "monthlyGoal") {
    updateCollectionItem(state.monthlyGoals, id, key, value);
  } else if (type === "yearlyGoal") {
    const item = state.yearlyGoals.find((goal) => goal.id === id);
    if (!item) return;
    if (key.startsWith("quarters.")) {
      const index = Number(key.split(".")[1]);
      item.quarters[index] = value;
    } else {
      item[key] = key === "progress" ? Number(value) : value;
    }
  } else if (type === "note") {
    updateCollectionItem(state.notes, id, key, value);
  } else if (type === "noteBlock") {
    const note = state.notes.find((item) => item.id === id);
    const blockId = key.split(".")[1];
    const block = note?.blocks.find((item) => item.id === blockId);
    if (block) block.text = value;
  }

  saveState();
  if (!skipRender && ["status", "priority", "area", "due", "time"].includes(key)) render();
  renderSpaces();
}

function updateCollectionItem(collection, id, key, value) {
  const item = collection.find((entry) => entry.id === id);
  if (!item) return;
  item[key] = key === "progress" ? Number(value) : value;
}

function renderSpaces() {
  const counts = Object.entries(areaMap).map(([key, meta]) => {
    const count = state.tasks.filter((task) => task.area === key && task.status !== "done").length;
    return `
      <div class="space-row" style="--space-color:${meta.color}">
        <span class="space-dot"></span>
        <span>${meta.label}</span>
        <small>${count}</small>
      </div>
    `;
  }).join("");
  spaceList.innerHTML = counts;
}

function setActiveNavigation() {
  document.querySelectorAll("[data-view]").forEach((button) => {
    button.classList.toggle("is-active", button.dataset.view === currentView);
  });
}

function openQuickModal() {
  if (typeof quickModal.showModal === "function") {
    const quickDue = document.getElementById("quickDue");
    const quickTime = document.getElementById("quickTime");
    if (quickDue && !quickDue.value) quickDue.value = todayISO();
    if (quickTime) quickTime.value = "";
    quickModal.showModal();
  } else {
    const type = prompt("نوع: task, monthlyGoal, yearlyGoal, note", "task");
    const title = prompt("عنوان");
    if (title) addQuickItem(type || "task", title, "");
  }
}

function applyTheme() {
  document.documentElement.classList.toggle("dark", state.ui.theme === "dark");
  themeBtn.innerHTML = `<span class="icon" data-icon="${state.ui.theme === "dark" ? "sun" : "moon"}"></span>`;
  hydrateIcons(themeBtn);
}

function showToast(message) {
  toast.textContent = message;
  toast.classList.add("is-visible");
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => toast.classList.remove("is-visible"), 2200);
}

function hydrateIcons(scope) {
  const iconTemplate = document.getElementById("icons");
  if (!iconTemplate) return;
  scope.querySelectorAll(".icon[data-icon]").forEach((slot) => {
    const name = slot.dataset.icon;
    const source = iconTemplate.content.querySelector(`svg[data-name="${name}"]`);
    if (!source) return;
    slot.replaceChildren(source.cloneNode(true));
  });
}

function loadState() {
  try {
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (stored) return normalizeState(stored);
  } catch (error) {
    localStorage.removeItem(STORAGE_KEY);
  }
  return createSeedState();
}

function saveState() {
  state.ui.currentView = currentView;
  state.ui.taskView = taskView;
  state.ui.activeNoteId = activeNoteId;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function normalizeState(input) {
  const seed = createSeedState();
  return {
    version: 1,
    ui: { ...seed.ui, ...(input.ui || {}) },
    tasks: Array.isArray(input.tasks) ? input.tasks.map(normalizeTask) : seed.tasks,
    monthlyGoals: Array.isArray(input.monthlyGoals) ? input.monthlyGoals.map(normalizeMonthlyGoal) : seed.monthlyGoals,
    yearlyGoals: Array.isArray(input.yearlyGoals) ? input.yearlyGoals.map(normalizeYearlyGoal) : seed.yearlyGoals,
    habits: Array.isArray(input.habits) ? input.habits.map(normalizeHabit) : seed.habits,
    notes: Array.isArray(input.notes) ? input.notes.map(normalizeNote) : seed.notes
  };
}

function normalizeTask(task) {
  return {
    id: task.id || uid("task"),
    title: task.title || "بدون عنوان",
    status: statusMap[task.status] ? task.status : "planned",
    priority: priorityMap[task.priority] ? task.priority : "medium",
    area: areaMap[task.area] ? task.area : "personal",
    due: isISODate(task.due) ? task.due : todayISO(),
    time: isTime(task.time) ? task.time : "",
    note: task.note || ""
  };
}

function normalizeMonthlyGoal(goal) {
  return {
    id: goal.id || uid("month"),
    title: goal.title || "هدف ماهانه",
    note: goal.note || "",
    progress: clamp(Number(goal.progress) || 0, 0, 100)
  };
}

function normalizeYearlyGoal(goal) {
  return {
    id: goal.id || uid("year"),
    title: goal.title || "هدف سالانه",
    note: goal.note || "",
    progress: clamp(Number(goal.progress) || 0, 0, 100),
    quarters: Array.isArray(goal.quarters) ? [...goal.quarters, "", "", "", ""].slice(0, 4) : ["", "", "", ""]
  };
}

function normalizeHabit(habit) {
  return {
    id: habit.id || uid("habit"),
    title: habit.title || "عادت",
    days: Array.isArray(habit.days) ? habit.days.filter(isISODate) : []
  };
}

function normalizeNote(note) {
  const blocks = Array.isArray(note.blocks) && note.blocks.length
    ? note.blocks.map((block) => ({ id: block.id || uid("block"), text: block.text || "" }))
    : [{ id: uid("block"), text: "" }];
  return {
    id: note.id || uid("note"),
    title: note.title || "یادداشت",
    blocks
  };
}

function createSeedState() {
  const today = todayISO();
  const tomorrow = toISO(addDays(new Date(), 1));
  const nextWeek = toISO(addDays(new Date(), 7));
  return {
    version: 1,
    ui: {
      currentView: "dashboard",
      taskView: "table",
      activeNoteId: "note-welcome",
      theme: "light"
    },
    tasks: [
      {
        id: "task-review",
        title: "مرور برنامه امروز",
        status: "doing",
        priority: "high",
        area: "personal",
        due: today,
        time: "06:00",
        note: "سه خروجی مهم روز را مشخص کن."
      },
      {
        id: "task-health",
        title: "۳۰ دقیقه ورزش یا پیاده روی",
        status: "planned",
        priority: "medium",
        area: "health",
        due: today,
        time: "07:00",
        note: "قابل انجام و کوتاه."
      },
      {
        id: "task-learning",
        title: "مطالعه و یادداشت برداری",
        status: "planned",
        priority: "medium",
        area: "learning",
        due: tomorrow,
        time: "08:30",
        note: "یک خلاصه در یادداشت ها بنویس."
      },
      {
        id: "task-work",
        title: "جمع بندی پروژه هفته",
        status: "planned",
        priority: "high",
        area: "work",
        due: nextWeek,
        time: "09:00",
        note: "موارد باز و تصمیم های لازم."
      }
    ],
    monthlyGoals: [
      {
        id: "month-focus",
        title: "ساخت روتین ثابت صبح",
        note: "بیداری، برنامه روز، حرکت کوتاه و اولین کار مهم.",
        progress: 35
      },
      {
        id: "month-finance",
        title: "مرور هزینه ها و بودجه",
        note: "ثبت هزینه ها، حذف موارد کم ارزش و برنامه ذخیره.",
        progress: 20
      }
    ],
    yearlyGoals: [
      {
        id: "year-skill",
        title: "رشد مهارت اصلی",
        note: "تمرکز روی یک مهارت که بیشترین اثر را روی کار و آینده دارد.",
        progress: 28,
        quarters: ["انتخاب مسیر و منابع", "تمرین پروژه محور", "ساخت نمونه کار", "مرور و تثبیت"]
      },
      {
        id: "year-health",
        title: "سلامت و انرژی پایدار",
        note: "خواب، ورزش، تغذیه و چکاپ را به سیستم روزانه تبدیل کن.",
        progress: 18,
        quarters: ["تنظیم خواب", "حرکت منظم", "تغذیه بهتر", "پایداری عادت ها"]
      }
    ],
    habits: [
      {
        id: "habit-plan",
        title: "برنامه ریزی روز",
        days: [today]
      },
      {
        id: "habit-read",
        title: "مطالعه",
        days: [today, toISO(addDays(new Date(), -1)), toISO(addDays(new Date(), -3))]
      },
      {
        id: "habit-move",
        title: "حرکت",
        days: [toISO(addDays(new Date(), -2)), toISO(addDays(new Date(), -4))]
      }
    ],
    notes: [
      {
        id: "note-welcome",
        title: "صفحه اصلی برنامه ریزی",
        blocks: [
          { id: "block-1", text: "این صفحه مثل یک دفتر مرکزی است. تصمیم ها، ایده ها و برنامه های آزاد را اینجا نگه دار." },
          { id: "block-2", text: "هر روز فقط چند خروجی مهم را انتخاب کن. اپ وقتی مفید می شود که ساده بماند." },
          { id: "block-3", text: "برای بکاپ گرفتن از منوی کناری خروجی بگیر و فایل JSON را نگه دار." }
        ]
      }
    ]
  };
}

function tasksForDate(iso) {
  return state.tasks.filter((task) => task.due === iso);
}

function averageProgress(items) {
  if (!items.length) return 0;
  return Math.round(items.reduce((sum, item) => sum + (Number(item.progress) || 0), 0) / items.length);
}

function noteWordCount() {
  const words = state.notes.flatMap((note) => note.blocks.map((block) => block.text.split(/\s+/))).flat().filter(Boolean);
  return words.length;
}

function currentQuarter() {
  return Math.floor(new Date().getMonth() / 3);
}

function priorityWeight(priority) {
  return { low: 1, medium: 2, high: 3 }[priority] || 0;
}

function lastNDates(count) {
  return Array.from({ length: count }, (_, index) => toISO(addDays(new Date(), index - count + 1)));
}

function todayISO() {
  return toISO(new Date());
}

function toISO(date) {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
}

function parseISO(value) {
  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime()) ? new Date() : date;
}

function addDays(date, days) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function isISODate(value) {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(new Date(`${value}T00:00:00`).getTime());
}

function isTime(value) {
  return typeof value === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
}

function formatLongDate(iso) {
  return new Intl.DateTimeFormat("fa-IR-u-ca-persian", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric"
  }).format(parseISO(iso));
}

function formatShortDate(iso) {
  return new Intl.DateTimeFormat("fa-IR-u-ca-persian", {
    day: "numeric",
    month: "short"
  }).format(parseISO(iso));
}

function uid(prefix) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function searchIn(values, query) {
  return values.some((value) => String(value || "").toLowerCase().includes(query));
}

function escapeHTML(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function escapeAttr(value) {
  return escapeHTML(value);
}

function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) return;
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js").catch(() => {});
  });
}
