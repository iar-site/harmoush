const BOOKING_API_BASE = "http://localhost:8788";

const state = {
  services: [],
  selectedService: "",
  selectedDate: "",
  selectedTime: "",
  currentMonth: new Date(new Date().getFullYear(), new Date().getMonth(), 1),
  availability: {},
  timezone: "America/Los_Angeles"
};

const serviceList = document.querySelector("#booking-service-list");
const calendar = document.querySelector("#booking-calendar");
const monthLabel = document.querySelector("#booking-month-label");
const prevMonth = document.querySelector("#booking-prev-month");
const nextMonth = document.querySelector("#booking-next-month");
const timePanel = document.querySelector("#booking-times");
const selectedSummary = document.querySelector("#booking-selected-summary");
const form = document.querySelector("#booking-form");
const messageBox = document.querySelector("#booking-message");

function api(path) {
  return `${BOOKING_API_BASE}${path}`;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function formatMonth(date) {
  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    year: "numeric"
  }).format(date);
}

function formatDate(dateString) {
  const date = new Date(`${dateString}T12:00:00`);
  return new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric"
  }).format(date);
}

function formatTime(time) {
  const [hours, minutes] = time.split(":").map(Number);
  const date = new Date(2000, 0, 1, hours, minutes);

  return new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit"
  }).format(date);
}

function isoDate(year, month, day) {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

async function loadServices() {
  const response = await fetch(api("/api/services"));
  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error || "Unable to load services.");
  }

  state.services = data.services || [];

  if (!state.selectedService && state.services.length) {
    state.selectedService = state.services[0].service_type;
  }

  renderServices();
}

function renderServices() {
  serviceList.innerHTML = "";

  state.services.forEach((service) => {
    const button = document.createElement("button");

    button.type = "button";
    button.className = "booking-service";
    button.dataset.service = service.service_type;

    button.innerHTML = `
      <span class="booking-service-number"></span>
      <span class="booking-service-content">
        <strong>${escapeHtml(service.display_name)}</strong>
        <small>${escapeHtml(service.short_description)}</small>
      </span>
      <span class="booking-service-arrow">&rarr;</span>
    `;

    if (service.service_type === state.selectedService) {
      button.classList.add("is-selected");
    }

    button.addEventListener("click", () => {
      state.selectedService = service.service_type;
      state.selectedDate = "";
      state.selectedTime = "";

      renderServices();
      renderTimes();
      updateSummary();
      loadAvailability();
    });

    serviceList.appendChild(button);
  });
}

async function loadAvailability() {
  if (!state.selectedService) {
    return;
  }

  const year = state.currentMonth.getFullYear();
  const month = state.currentMonth.getMonth();
  const start = isoDate(year, month + 1, 1);
  const end = isoDate(
    year,
    month + 1,
    new Date(year, month + 1, 0).getDate()
  );

  calendar.classList.add("is-loading");

  try {
    const response = await fetch(
      api(
        `/api/availability?service=${encodeURIComponent(state.selectedService)}&start=${start}&end=${end}`
      )
    );

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || "Unable to load availability.");
    }

    state.availability = data.dates || {};
    state.timezone = data.timezone || "America/Los_Angeles";

    renderCalendar();
  } catch (error) {
    calendar.innerHTML = `
      <div class="booking-error">
        ${escapeHtml(error.message)}
      </div>
    `;
  } finally {
    calendar.classList.remove("is-loading");
  }
}

function renderCalendar() {
  monthLabel.textContent = formatMonth(state.currentMonth);
  calendar.innerHTML = "";

  const weekdays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

  weekdays.forEach((day) => {
    const heading = document.createElement("div");
    heading.className = "booking-calendar-heading";
    heading.textContent = day;
    calendar.appendChild(heading);
  });

  const year = state.currentMonth.getFullYear();
  const month = state.currentMonth.getMonth();

  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  for (let i = 0; i < firstDay; i++) {
    const empty = document.createElement("div");
    empty.className = "booking-calendar-empty";
    calendar.appendChild(empty);
  }

  for (let day = 1; day <= daysInMonth; day++) {
    const date = isoDate(year, month + 1, day);
    const slots = state.availability[date] || [];

    const button = document.createElement("button");
    button.type = "button";
    button.className = "booking-date";
    button.disabled = slots.length === 0;

    button.innerHTML = `
      <span class="booking-date-number">${day}</span>
      ${
        slots.length
          ? `<span class="booking-date-availability">${slots.length} ${slots.length === 1 ? "time" : "times"}</span>`
          : `<span class="booking-date-unavailable">Unavailable</span>`
      }
    `;

    if (date === state.selectedDate) {
      button.classList.add("is-selected");
    }

    if (slots.length) {
      button.addEventListener("click", () => {
        state.selectedDate = date;
        state.selectedTime = "";

        renderCalendar();
        renderTimes();
        updateSummary();
      });
    }

    calendar.appendChild(button);
  }

  const hasAvailability = Object.values(state.availability).some(
    (slots) => Array.isArray(slots) && slots.length > 0
  );

  if (!hasAvailability) {
    const notice = document.createElement("div");
    notice.className = "booking-calendar-notice";
    notice.textContent =
      "No appointment times have been published for this service yet.";
    calendar.appendChild(notice);
  }

  updateMonthButtons();
}

function updateMonthButtons() {
  const today = new Date();
  const currentMonth = new Date(
    today.getFullYear(),
    today.getMonth(),
    1
  );

  prevMonth.disabled =
    state.currentMonth.getTime() <= currentMonth.getTime();

  nextMonth.disabled =
    state.currentMonth.getTime() >=
    new Date(today.getFullYear(), today.getMonth() + 2, 1).getTime();
}

function renderTimes() {
  timePanel.innerHTML = "";

  if (!state.selectedDate) {
    timePanel.innerHTML =
      '<p class="booking-help">Select an available date to see appointment times.</p>';
    return;
  }

  const slots = state.availability[state.selectedDate] || [];

  if (!slots.length) {
    timePanel.innerHTML =
      '<p class="booking-help">There are no available times on this date.</p>';
    return;
  }

  const heading = document.createElement("h3");
  heading.textContent = "Available times";
  timePanel.appendChild(heading);

  const grid = document.createElement("div");
  grid.className = "booking-time-grid";

  slots.forEach((time) => {
    const button = document.createElement("button");

    button.type = "button";
    button.className = "booking-time";
    button.textContent = formatTime(time);

    if (time === state.selectedTime) {
      button.classList.add("is-selected");
    }

    button.addEventListener("click", () => {
      state.selectedTime = time;
      renderTimes();
      updateSummary();
    });

    grid.appendChild(button);
  });

  timePanel.appendChild(grid);
}

function updateSummary() {
  const service = state.services.find(
    (item) => item.service_type === state.selectedService
  );

  if (!service) {
    selectedSummary.innerHTML =
      "<span>Select a service to begin.</span>";
    return;
  }

  if (!state.selectedDate || !state.selectedTime) {
    selectedSummary.innerHTML = `
      <strong>${escapeHtml(service.display_name)}</strong>
      <span>Select an available date and time.</span>
    `;
    return;
  }

  selectedSummary.innerHTML = `
    <strong>${escapeHtml(service.display_name)}</strong>
    <span>${escapeHtml(formatDate(state.selectedDate))} at ${escapeHtml(formatTime(state.selectedTime))}</span>
  `;
}

async function submitBooking(event) {
  event.preventDefault();

  if (!state.selectedService || !state.selectedDate || !state.selectedTime) {
    showMessage("Please select a service, date, and time.", true);
    return;
  }

  const payload = {
    full_name: document.querySelector("#booking-name").value.trim(),
    email: document.querySelector("#booking-email").value.trim(),
    phone: document.querySelector("#booking-phone").value.trim(),
    message: document.querySelector("#booking-message-input").value.trim(),
    service_type: state.selectedService,
    requested_date: state.selectedDate,
    requested_time: state.selectedTime
  };

  showMessage("Submitting your appointment request…", false);

  try {
    const response = await fetch(api("/api/booking"), {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || "Unable to submit the request.");
    }

    form.innerHTML = `
      <div class="booking-confirmation">
        <p class="eyebrow">Request Received</p>
        <h3>Your appointment request has been submitted.</h3>
        <p>${escapeHtml(data.message)}</p>
        <p class="booking-reference">
          Reference: <strong>${escapeHtml(data.reference_code)}</strong>
        </p>
      </div>
    `;

    showMessage("", false);
  } catch (error) {
    showMessage(error.message, true);
  }
}

function showMessage(message, isError) {
  messageBox.textContent = message;
  messageBox.className =
    `booking-form-message${isError ? " is-error" : ""}`;
}

prevMonth.addEventListener("click", () => {
  if (prevMonth.disabled) return;

  state.currentMonth = new Date(
    state.currentMonth.getFullYear(),
    state.currentMonth.getMonth() - 1,
    1
  );

  state.selectedDate = "";
  state.selectedTime = "";

  renderTimes();
  updateSummary();
  loadAvailability();
});

nextMonth.addEventListener("click", () => {
  if (nextMonth.disabled) return;

  state.currentMonth = new Date(
    state.currentMonth.getFullYear(),
    state.currentMonth.getMonth() + 1,
    1
  );

  state.selectedDate = "";
  state.selectedTime = "";

  renderTimes();
  updateSummary();
  loadAvailability();
});

form.addEventListener("submit", submitBooking);

loadServices()
  .then(loadAvailability)
  .then(() => {
    renderTimes();
    updateSummary();
  })
  .catch((error) => {
    showMessage(error.message, true);
  });
