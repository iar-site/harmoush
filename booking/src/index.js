const JSON_HEADERS = {
  "Content-Type": "application/json; charset=utf-8",
  "Cache-Control": "no-store",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: JSON_HEADERS,
  });
}

function isValidDate(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function isValidTime(value) {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
}

function addDays(dateString, days) {
  const d = new Date(`${dateString}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function weekdayOf(dateString) {
  return new Date(`${dateString}T12:00:00Z`).getUTCDay();
}

function getLocalNow(timeZone) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date());

  const values = Object.fromEntries(
    parts
      .filter((p) => p.type !== "literal")
      .map((p) => [p.type, p.value])
  );

  return {
    date: `${values.year}-${values.month}-${values.day}`,
    time: `${values.hour}:${values.minute}`,
  };
}

function timeToMinutes(time) {
  const [hours, minutes] = time.split(":").map(Number);
  return hours * 60 + minutes;
}

function minutesToTime(totalMinutes) {
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

function buildSlots(startTime, endTime, slotMinutes) {
  const slots = [];
  let current = timeToMinutes(startTime);
  const end = timeToMinutes(endTime);

  while (current + slotMinutes <= end) {
    slots.push(minutesToTime(current));
    current += slotMinutes;
  }

  return slots;
}

async function loadSettings(db) {
  const result = await db
    .prepare(
      "SELECT setting_key, setting_value FROM booking_settings ORDER BY setting_key"
    )
    .all();

  const settings = {};

  for (const row of result.results ?? []) {
    settings[row.setting_key] = row.setting_value;
  }

  return {
    timezone: settings.timezone || "America/Los_Angeles",
    advanceBookingDays: Number(settings.advance_booking_days || 60),
    minimumNoticeHours: Number(settings.minimum_notice_hours || 24),
  };
}

async function getServices(env) {
  const db = env.mahmoud_harmoush_booking;

  const result = await db
    .prepare(`
      SELECT
        service_type,
        display_name,
        short_description,
        duration_minutes
      FROM service_types
      WHERE is_active = 1
      ORDER BY service_type
    `)
    .all();

  return json({
    services: result.results ?? [],
  });
}

async function getAvailability(url, env) {
  const db = env.mahmoud_harmoush_booking;
  const service = url.searchParams.get("service");

  if (!service) {
    return json(
      { error: "A service must be selected." },
      400
    );
  }

  const serviceResult = await db
    .prepare(`
      SELECT
        service_type,
        display_name,
        duration_minutes
      FROM service_types
      WHERE service_type = ?
        AND is_active = 1
      LIMIT 1
    `)
    .bind(service)
    .all();

  if (!serviceResult.results?.length) {
    return json({ error: "Invalid or inactive service." }, 400);
  }

  const selectedService = serviceResult.results[0];
  const settings = await loadSettings(db);
  const localNow = getLocalNow(settings.timezone);

  let startDate = url.searchParams.get("start") || localNow.date;
  let endDate =
    url.searchParams.get("end") || addDays(startDate, 30);

  if (!isValidDate(startDate) || !isValidDate(endDate)) {
    return json(
      { error: "Dates must use YYYY-MM-DD format." },
      400
    );
  }

  if (startDate < localNow.date) {
    startDate = localNow.date;
  }

  const maximumDate = addDays(
    localNow.date,
    settings.advanceBookingDays
  );

  if (endDate > maximumDate) {
    endDate = maximumDate;
  }

  if (endDate < startDate) {
    return json({
      service: selectedService,
      timezone: settings.timezone,
      dates: {},
    });
  }

  const [rulesResult, blockedResult, bookingsResult] =
    await Promise.all([
      db
        .prepare(`
          SELECT weekday, start_time, end_time, slot_minutes
          FROM service_availability_rules
          WHERE service_type = ?
            AND is_active = 1
          ORDER BY weekday, start_time
        `)
        .bind(service)
        .all(),

      db
        .prepare(`
          SELECT blocked_date
          FROM blocked_dates
          WHERE blocked_date BETWEEN ? AND ?
        `)
        .bind(startDate, endDate)
        .all(),

      db
        .prepare(`
          SELECT requested_date, requested_time
          FROM booking_requests
          WHERE requested_date BETWEEN ? AND ?
            AND service_type = ?
            AND status IN ('pending', 'confirmed')
        `)
        .bind(startDate, endDate, service)
        .all(),
    ]);

  const rulesByWeekday = new Map();

  for (const rule of rulesResult.results ?? []) {
    const rules = rulesByWeekday.get(rule.weekday) || [];
    rules.push(rule);
    rulesByWeekday.set(rule.weekday, rules);
  }

  const blockedDates = new Set(
    (blockedResult.results ?? []).map((row) => row.blocked_date)
  );

  const occupiedSlots = new Set(
    (bookingsResult.results ?? []).map(
      (row) => `${row.requested_date}|${row.requested_time.slice(0, 5)}`
    )
  );

  const dates = {};

  for (
    let date = startDate;
    date <= endDate;
    date = addDays(date, 1)
  ) {
    if (blockedDates.has(date)) {
      dates[date] = [];
      continue;
    }

    const rules = rulesByWeekday.get(weekdayOf(date)) || [];
    const slots = new Set();

    for (const rule of rules) {
      for (const slot of buildSlots(
        rule.start_time,
        rule.end_time,
        Number(rule.slot_minutes)
      )) {
        slots.add(slot);
      }
    }

    dates[date] = [...slots]
      .sort()
      .filter((time) => {
        const key = `${date}|${time}`;

        if (occupiedSlots.has(key)) {
          return false;
        }

        if (date === localNow.date) {
          const nowMinutes = timeToMinutes(localNow.time);
          const requestedMinutes = timeToMinutes(time);
          const minimumNotice =
            settings.minimumNoticeHours * 60;

          if (
            requestedMinutes - nowMinutes <
            minimumNotice
          ) {
            return false;
          }
        }

        return true;
      });
  }

  return json({
    service: selectedService,
    timezone: settings.timezone,
    minimum_notice_hours: settings.minimumNoticeHours,
    advance_booking_days: settings.advanceBookingDays,
    start_date: startDate,
    end_date: endDate,
    dates,
  });
}

async function createBooking(request, env) {
  const db = env.mahmoud_harmoush_booking;

  let body;

  try {
    body = await request.json();
  } catch {
    return json(
      { error: "Request body must be valid JSON." },
      400
    );
  }

  const fullName = String(body.full_name || "").trim();
  const email = String(body.email || "").trim();
  const phone = String(body.phone || "").trim();
  const serviceType = String(body.service_type || "").trim();
  const requestedDate = String(body.requested_date || "").trim();
  const requestedTime = String(body.requested_time || "").trim();
  const message =
    body.message == null
      ? null
      : String(body.message).trim();

  if (!fullName || fullName.length > 120) {
    return json({ error: "Please provide your full name." }, 400);
  }

  if (
    !email ||
    email.length > 254 ||
    !/^\S+@\S+\.\S+$/.test(email)
  ) {
    return json(
      { error: "Please provide a valid email address." },
      400
    );
  }

  if (!phone || phone.length > 40) {
    return json(
      { error: "Please provide a valid phone number." },
      400
    );
  }

  if (!isValidDate(requestedDate)) {
    return json({ error: "Please provide a valid date." }, 400);
  }

  if (!isValidTime(requestedTime)) {
    return json({ error: "Please provide a valid time." }, 400);
  }

  if (message && message.length > 2000) {
    return json(
      { error: "Your message is too long." },
      400
    );
  }

  const serviceResult = await db
    .prepare(`
      SELECT service_type, display_name, duration_minutes
      FROM service_types
      WHERE service_type = ?
        AND is_active = 1
      LIMIT 1
    `)
    .bind(serviceType)
    .all();

  if (!serviceResult.results?.length) {
    return json({ error: "Invalid or inactive service." }, 400);
  }

  const service = serviceResult.results[0];
  const settings = await loadSettings(db);
  const localNow = getLocalNow(settings.timezone);

  if (requestedDate < localNow.date) {
    return json(
      { error: "That date is no longer available." },
      409
    );
  }

  const maximumDate = addDays(
    localNow.date,
    settings.advanceBookingDays
  );

  if (requestedDate > maximumDate) {
    return json(
      { error: "That date is outside the booking window." },
      409
    );
  }

  if (
    requestedDate === localNow.date &&
    timeToMinutes(requestedTime) -
      timeToMinutes(localNow.time) <
      settings.minimumNoticeHours * 60
  ) {
    return json(
      {
        error: `Bookings require at least ${settings.minimumNoticeHours} hours notice.`,
      },
      409
    );
  }

  const weekday = weekdayOf(requestedDate);

  const [rulesResult, blockedResult, occupiedResult] =
    await Promise.all([
      db
        .prepare(`
          SELECT start_time, end_time, slot_minutes
          FROM service_availability_rules
          WHERE service_type = ?
            AND weekday = ?
            AND is_active = 1
        `)
        .bind(serviceType, weekday)
        .all(),

      db
        .prepare(`
          SELECT 1 AS blocked
          FROM blocked_dates
          WHERE blocked_date = ?
          LIMIT 1
        `)
        .bind(requestedDate)
        .all(),

      db
        .prepare(`
          SELECT 1 AS occupied
          FROM booking_requests
          WHERE requested_date = ?
            AND requested_time = ?
            AND status IN ('pending', 'confirmed')
          LIMIT 1
        `)
        .bind(requestedDate, requestedTime)
        .all(),
    ]);

  if (blockedResult.results?.length) {
    return json(
      { error: "That date is blocked." },
      409
    );
  }

  const isAvailable = (rulesResult.results ?? []).some(
    (rule) =>
      buildSlots(
        rule.start_time,
        rule.end_time,
        Number(rule.slot_minutes)
      ).includes(requestedTime)
  );

  if (!isAvailable) {
    return json(
      { error: "That time is not currently available for this service." },
      409
    );
  }

  if (occupiedResult.results?.length) {
    return json(
      {
        error:
          "That time was just requested by someone else. Please choose another time.",
      },
      409
    );
  }

  const referenceCode =
    `MH-${crypto.randomUUID().replaceAll("-", "").slice(0, 10).toUpperCase()}`;

  await db
    .prepare(`
      INSERT INTO booking_requests (
        reference_code,
        full_name,
        email,
        phone,
        service_type,
        requested_date,
        requested_time,
        message,
        status
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending')
    `)
    .bind(
      referenceCode,
      fullName,
      email,
      phone,
      serviceType,
      requestedDate,
      requestedTime,
      message
    )
    .run();

  return json(
    {
      status: "pending",
      reference_code: referenceCode,
      service: service.display_name,
      requested_date: requestedDate,
      requested_time: requestedTime,
      message:
        "Your appointment request has been received. Mahmoud will confirm the request personally.",
    },
    201
  );
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: JSON_HEADERS,
      });
    }

    if (
      request.method === "GET" &&
      url.pathname === "/api/health"
    ) {
      return json({
        status: "ok",
        service: "Mahmoud Harmoush Booking API",
      });
    }

    if (
      request.method === "GET" &&
      url.pathname === "/api/services"
    ) {
      try {
        return await getServices(env);
      } catch (error) {
        console.error("Services error", error);
        return json(
          { error: "Unable to load services." },
          500
        );
      }
    }

    if (
      request.method === "GET" &&
      url.pathname === "/api/availability"
    ) {
      try {
        return await getAvailability(url, env);
      } catch (error) {
        console.error("Availability error", error);
        return json(
          { error: "Unable to load availability." },
          500
        );
      }
    }

    if (
      request.method === "POST" &&
      url.pathname === "/api/booking"
    ) {
      try {
        return await createBooking(request, env);
      } catch (error) {
        console.error("Booking error", error);
        return json(
          { error: "Unable to create the booking request." },
          500
        );
      }
    }

    return json({ error: "Not found" }, 404);
  },
};
