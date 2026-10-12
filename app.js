const STORAGE_KEY = "campus-football-booking-v1";
const VENUES = {
  field1: { name: "一号足球场", code: "01", location: "主体育场 · 教学楼东侧" },
  field2: { name: "二号足球场", code: "02", location: "北区球场 · 学生宿舍旁" },
  field3: { name: "三号足球场", code: "03", location: "新体育区 · 体育馆西侧" },
};
const HALVES = {
  A: { name: "左半场", description: "靠近教学楼一侧" },
  B: { name: "右半场", description: "靠近体育馆一侧" },
};
const SLOT_STARTS = ["08:00", "09:00", "10:00", "11:00", "12:00", "13:00", "14:00", "15:00", "16:00", "17:00", "18:00", "19:00", "20:00"];

let state = loadState();
let selectedDate = toDateKey(new Date());
let selectedVenue = "field1";
let toastTimer;

const dateStrip = document.querySelector("#date-strip");
const venueSelector = document.querySelector("#venue-selector");
const fieldGrid = document.querySelector("#field-grid");
const myBookings = document.querySelector("#my-bookings");
const blockoutList = document.querySelector("#blockout-list");
const bookingModal = document.querySelector("#booking-modal");
const bookingForm = document.querySelector("#booking-form");
const blockoutForm = document.querySelector("#blockout-form");

function loadState() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    const bookings = Array.isArray(saved?.bookings) ? saved.bookings.map((item) => ({
      ...item,
      venue: item.venue || "field1",
      half: item.half || item.field || "A",
    })) : [];
    const blockouts = Array.isArray(saved?.blockouts) ? saved.blockouts.map((item) => ({
      ...item,
      venue: item.venue || "field1",
      half: item.half || item.field || "all",
    })) : [];
    return { bookings, blockouts };
  } catch {
    return { bookings: [], blockouts: [] };
  }
}

function persistState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function toDateKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function parseLocalDate(dateKey) {
  const [year, month, day] = dateKey.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function addHour(time) {
  return `${String(Number(time.slice(0, 2)) + 1).padStart(2, "0")}:00`;
}

function uid() {
  return globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function formatDate(dateKey, includeWeekday = true) {
  return new Intl.DateTimeFormat("zh-CN", {
    month: "long",
    day: "numeric",
    ...(includeWeekday ? { weekday: "long" } : {}),
  }).format(parseLocalDate(dateKey));
}

function rangesOverlap(startA, endA, startB, endB) {
  return startA < endB && startB < endA;
}

function getBlockout(date, venue, half, start, end) {
  return state.blockouts.find((item) =>
    item.date === date &&
    (item.venue === "all" || item.venue === venue) &&
    (item.half === "all" || item.half === half) &&
    rangesOverlap(start, end, item.start, item.end)
  );
}

function getActiveBooking(date, venue, half, start) {
  return state.bookings.find((item) =>
    item.status === "active" && item.date === date && item.venue === venue && item.half === half && item.start === start
  );
}

function renderDates() {
  dateStrip.innerHTML = "";
  const weekdays = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];
  for (let index = 0; index < 7; index += 1) {
    const date = new Date();
    date.setHours(12, 0, 0, 0);
    date.setDate(date.getDate() + index);
    const key = toDateKey(date);
    const button = document.createElement("button");
    button.className = `date-button${key === selectedDate ? " active" : ""}`;
    button.type = "button";
    button.dataset.date = key;
    button.innerHTML = `<span class="weekday">${index === 0 ? "今天" : weekdays[date.getDay()]}</span><strong class="date-number">${date.getDate()}</strong><span class="month">${date.getMonth() + 1} 月</span>`;
    button.addEventListener("click", () => {
      selectedDate = key;
      renderAll();
    });
    dateStrip.append(button);
  }
}

function renderVenues() {
  venueSelector.innerHTML = "";
  Object.entries(VENUES).forEach(([venueId, venue]) => {
    const totalSlots = SLOT_STARTS.length * Object.keys(HALVES).length;
    let openSlots = 0;
    Object.keys(HALVES).forEach((halfId) => {
      SLOT_STARTS.forEach((start) => {
        if (!getBlockout(selectedDate, venueId, halfId, start, addHour(start)) && !getActiveBooking(selectedDate, venueId, halfId, start)) openSlots += 1;
      });
    });
    const button = document.createElement("button");
    button.type = "button";
    button.className = `venue-button${venueId === selectedVenue ? " active" : ""}`;
    button.dataset.venue = venueId;
    button.setAttribute("aria-pressed", String(venueId === selectedVenue));
    button.innerHTML = `<span class="venue-code">${venue.code}</span><span class="venue-copy"><strong>${venue.name}</strong><small>${venue.location}</small></span><span class="venue-availability"><strong>${openSlots}</strong><small>/ ${totalSlots} 可用</small></span>`;
    button.addEventListener("click", () => {
      selectedVenue = venueId;
      renderAll();
    });
    venueSelector.append(button);
  });
}

function renderFields() {
  fieldGrid.innerHTML = "";
  Object.entries(HALVES).forEach(([halfId, half]) => {
    const openCount = SLOT_STARTS.filter((start) => !getBlockout(selectedDate, selectedVenue, halfId, start, addHour(start)) && !getActiveBooking(selectedDate, selectedVenue, halfId, start)).length;
    const card = document.createElement("article");
    card.className = "field-card";
    card.innerHTML = `
      <div class="field-card-header">
        <div class="field-id"><span class="field-letter">${halfId}</span><div><h3>${VENUES[selectedVenue].name} · ${half.name}</h3><p>${half.description}</p></div></div>
        <div class="open-count"><strong>${openCount}</strong><small>可用时段</small></div>
      </div>
      <div class="slots"></div>`;
    const slots = card.querySelector(".slots");
    SLOT_STARTS.forEach((start) => {
      const end = addHour(start);
      const blockout = getBlockout(selectedDate, selectedVenue, halfId, start, end);
      const booking = getActiveBooking(selectedDate, selectedVenue, halfId, start);
      const button = document.createElement("button");
      button.type = "button";
      button.className = `slot-button${blockout ? " closed" : ""}`;
      button.disabled = Boolean(blockout || booking);
      button.innerHTML = `<strong>${start}–${end}</strong><span>${blockout ? "学校占用" : booking ? "已预约" : "可预约"}</span>`;
      if (blockout) button.title = blockout.reason;
      if (!blockout && !booking) button.addEventListener("click", () => openBookingModal(selectedVenue, halfId, start));
      slots.append(button);
    });
    fieldGrid.append(card);
  });

  const dayBlockouts = state.blockouts.filter((item) => item.date === selectedDate);
  const notice = document.querySelector("#day-notice p");
  if (dayBlockouts.length) {
    notice.innerHTML = `<strong>当天有 ${dayBlockouts.length} 项场地安排</strong><span>${dayBlockouts.map((item) => item.reason).join("；")}</span>`;
  } else {
    notice.innerHTML = "<strong>预约提示</strong><span>每次预约 1 小时；绿色时段可以直接选择。</span>";
  }
}

function openBookingModal(venueId, halfId, start) {
  document.querySelector("#booking-date").value = selectedDate;
  document.querySelector("#booking-venue").value = venueId;
  document.querySelector("#booking-half").value = halfId;
  document.querySelector("#booking-start").value = start;
  document.querySelector("#selected-slot").innerHTML = `${VENUES[venueId].name} · ${HALVES[halfId].name} · ${start}–${addHour(start)}<small>${formatDate(selectedDate)}</small>`;
  bookingModal.showModal();
}

function renderMyBookings() {
  const ordered = [...state.bookings].sort((a, b) => `${b.date}${b.start}`.localeCompare(`${a.date}${a.start}`));
  if (!ordered.length) {
    myBookings.innerHTML = '<div class="empty-state"><strong>还没有预约</strong>从预约看板选择一个绿色时段，第一条记录就会出现在这里。</div>';
    return;
  }
  myBookings.innerHTML = "";
  ordered.forEach((booking) => {
    const active = booking.status === "active";
    const item = document.createElement("article");
    item.className = `booking-item${active ? "" : " cancelled"}`;
    const statusText = booking.status === "blocked" ? "因封场取消" : active ? "预约有效" : "已取消";
    item.innerHTML = `
      <div class="booking-main"><strong>${booking.team}</strong><span>${booking.captain} · ${booking.contact}</span></div>
      <div class="booking-meta">${formatDate(booking.date)} · ${VENUES[booking.venue]?.name || "一号足球场"}<br>${HALVES[booking.half]?.name || "左半场"} · ${booking.start}–${booking.end}</div>
      <div><span class="status-pill${active ? "" : " cancelled"}">${statusText}</span>${active ? `<button class="cancel-button" data-cancel-id="${booking.id}">取消预约</button>` : ""}</div>`;
    myBookings.append(item);
  });
}

function renderBlockouts() {
  const ordered = [...state.blockouts].sort((a, b) => `${a.date}${a.start}`.localeCompare(`${b.date}${b.start}`));
  if (!ordered.length) {
    blockoutList.innerHTML = '<div class="empty-state"><strong>暂无封场安排</strong>新增后，相关时段会立即在预约看板变为红色。</div>';
    return;
  }
  blockoutList.innerHTML = "";
  ordered.forEach((item) => {
    const venueName = item.venue === "all" ? "全部足球场" : VENUES[item.venue]?.name || "一号足球场";
    const halfName = item.half === "all" ? "整场" : HALVES[item.half]?.name || "整场";
    const element = document.createElement("article");
    element.className = "blockout-item";
    element.innerHTML = `<div><strong>${item.reason}</strong><span>${formatDate(item.date)} · ${item.start}–${item.end} · ${venueName} / ${halfName}</span><p>已在学生预约看板公示</p></div><button class="delete-button" data-delete-blockout="${item.id}">撤销</button>`;
    blockoutList.append(element);
  });
}

function renderAll() {
  state = loadState();
  renderDates();
  renderVenues();
  renderFields();
  renderMyBookings();
  renderBlockouts();
}

function showToast(message, type = "success") {
  const toast = document.querySelector("#toast");
  clearTimeout(toastTimer);
  toast.textContent = message;
  toast.className = `toast show${type === "error" ? " error" : ""}`;
  toastTimer = setTimeout(() => { toast.className = "toast"; }, 3200);
}

function switchView(viewName) {
  document.querySelectorAll(".view").forEach((view) => view.classList.toggle("active", view.id === `${viewName}-view`));
  document.querySelectorAll(".nav-tab").forEach((tab) => tab.classList.toggle("active", tab.dataset.view === viewName));
  window.scrollTo({ top: 0, behavior: "smooth" });
  renderAll();
}

document.querySelectorAll(".nav-tab").forEach((tab) => tab.addEventListener("click", () => switchView(tab.dataset.view)));
document.querySelectorAll("[data-go-booking]").forEach((button) => button.addEventListener("click", () => switchView("booking")));
document.querySelectorAll("[data-close-modal]").forEach((button) => button.addEventListener("click", () => bookingModal.close()));
document.querySelector("#jump-to-board").addEventListener("click", () => document.querySelector("#booking-board").scrollIntoView({ behavior: "smooth" }));

bookingForm.addEventListener("submit", (event) => {
  event.preventDefault();
  state = loadState();
  const data = new FormData(bookingForm);
  const date = data.get("date");
  const venue = data.get("venue");
  const half = data.get("half");
  const start = data.get("start");
  const end = addHour(start);

  if (getBlockout(date, venue, half, start, end) || getActiveBooking(date, venue, half, start)) {
    bookingModal.close();
    renderAll();
    showToast("这个时段刚刚已被占用，请选择其他时间。", "error");
    return;
  }

  state.bookings.push({
    id: uid(), date, venue, half, start, end,
    team: String(data.get("team")).trim(),
    captain: String(data.get("captain")).trim(),
    contact: String(data.get("contact")).trim(),
    status: "active",
    createdAt: new Date().toISOString(),
  });
  persistState();
  bookingModal.close();
  bookingForm.reset();
  renderAll();
  showToast("预约成功！其他人现在会看到该时段已占用。 ");
});

myBookings.addEventListener("click", (event) => {
  const button = event.target.closest("[data-cancel-id]");
  if (!button) return;
  state = loadState();
  const booking = state.bookings.find((item) => item.id === button.dataset.cancelId);
  if (booking) booking.status = "cancelled";
  persistState();
  renderAll();
  showToast("预约已取消，该时段重新开放。 ");
});

blockoutForm.addEventListener("submit", (event) => {
  event.preventDefault();
  state = loadState();
  const data = new FormData(blockoutForm);
  const date = data.get("date");
  const start = data.get("start");
  const end = data.get("end");
  const venue = data.get("venue");
  const half = data.get("half");
  if (start >= end) {
    showToast("结束时间必须晚于开始时间。", "error");
    return;
  }
  const duplicate = state.blockouts.some((item) => item.date === date &&
    (item.venue === "all" || venue === "all" || item.venue === venue) &&
    (item.half === "all" || half === "all" || item.half === half) &&
    rangesOverlap(start, end, item.start, item.end));
  if (duplicate) {
    showToast("该范围已有重叠的封场安排。", "error");
    return;
  }
  const blockout = { id: uid(), date, start, end, venue, half, reason: String(data.get("reason")).trim(), createdAt: new Date().toISOString() };
  state.blockouts.push(blockout);
  let affected = 0;
  state.bookings.forEach((booking) => {
    if (booking.status === "active" && booking.date === date &&
      (venue === "all" || booking.venue === venue) &&
      (half === "all" || booking.half === half) &&
      rangesOverlap(booking.start, booking.end, start, end)) {
      booking.status = "blocked";
      booking.blockoutId = blockout.id;
      affected += 1;
    }
  });
  persistState();
  renderAll();
  showToast(affected ? `封场已发布，并标记 ${affected} 条受影响预约。` : "封场安排已发布。 ");
  document.querySelector("#block-reason").value = "";
});

blockoutList.addEventListener("click", (event) => {
  const button = event.target.closest("[data-delete-blockout]");
  if (!button) return;
  state = loadState();
  const id = button.dataset.deleteBlockout;
  state.blockouts = state.blockouts.filter((item) => item.id !== id);
  state.bookings.forEach((booking) => {
    if (booking.status === "blocked" && booking.blockoutId === id) {
      booking.status = "cancelled";
      delete booking.blockoutId;
    }
  });
  persistState();
  renderAll();
  showToast("封场安排已撤销；原受影响预约仍保持取消状态。 ");
});

function prepareAdminForm() {
  const today = toDateKey(new Date());
  const lastDate = new Date();
  lastDate.setDate(lastDate.getDate() + 90);
  const dateInput = document.querySelector("#block-date");
  dateInput.min = today;
  dateInput.max = toDateKey(lastDate);
  dateInput.value = today;
  const startSelect = document.querySelector("#block-start");
  const endSelect = document.querySelector("#block-end");
  SLOT_STARTS.forEach((start) => startSelect.add(new Option(start, start)));
  [...SLOT_STARTS.slice(1), addHour(SLOT_STARTS.at(-1))].forEach((end) => endSelect.add(new Option(end, end)));
  startSelect.value = "16:00";
  endSelect.value = "18:00";
}

window.addEventListener("storage", () => {
  renderAll();
  showToast("场地安排已从另一个页面更新。 ");
});

prepareAdminForm();
renderAll();
