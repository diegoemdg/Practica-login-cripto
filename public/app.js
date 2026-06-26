async function postJson(url, data) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data)
  });

  const text = await response.text();
  let body = {};
  try {
    body = text ? JSON.parse(text) : {};
  } catch (_error) {
    throw new Error("El servidor devolvio una pagina de error. Espera unos segundos y vuelve a intentar.");
  }

  if (!response.ok) throw new Error(body.error || "Error en la solicitud");
  return body;
}

function show(form, message, isError = false) {
  const output = form.querySelector(".message");
  output.textContent = message;
  output.className = `message ${isError ? "error" : "ok"}`;
}

function formData(form) {
  return Object.fromEntries(new FormData(form).entries());
}

function redirectTo(url, delay = 700) {
  window.setTimeout(() => {
    window.location.href = url;
  }, delay);
}

function redirectTarget(form, data) {
  const target = form.dataset.redirect;
  if (!target) return "";
  if (form.dataset.redirectWithFields) {
    const params = new URLSearchParams();
    form.dataset.redirectWithFields.split(",").forEach((field) => {
      const value = data[field.trim()];
      if (value) params.set(field.trim(), value);
    });
    return `${target}?${params.toString()}`;
  }
  return target;
}

document.querySelectorAll("form[data-endpoint]").forEach((form) => {
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const buttons = Array.from(form.querySelectorAll("button"));
    buttons.forEach((button) => {
      button.disabled = true;
    });
    show(form, "Procesando...");

    const data = formData(form);
    if (form.elements.acceptedPrivacy) {
      data.acceptedPrivacy = form.elements.acceptedPrivacy.checked;
    }

    try {
      const body = await postJson(form.dataset.endpoint, data);
      show(form, body.message || "Listo.");
      if (body.sessionToken) {
        localStorage.setItem("sessionToken", body.sessionToken);
        localStorage.setItem("userId", data.userId || "");
      }
      const target = redirectTarget(form, data);
      if (target) {
        redirectTo(target);
      }
    } catch (error) {
      show(form, error.message, true);
      buttons.forEach((button) => {
        button.disabled = false;
      });
    }
  });
});

const emailInput = document.querySelector("[data-email-from-url]");
if (emailInput) {
  emailInput.value = new URLSearchParams(location.search).get("email") || "";
}

const userInput = document.querySelector("[data-user-from-url]");
if (userInput) {
  userInput.value = new URLSearchParams(location.search).get("userId") || "";
}

document.querySelectorAll("[data-logout]").forEach((button) => {
  button.addEventListener("click", () => {
    localStorage.removeItem("sessionToken");
    localStorage.removeItem("userId");
    window.location.href = "/login.html";
  });
});

const protectedPage = document.querySelector("[data-protected-page]");
if (protectedPage && !localStorage.getItem("sessionToken")) {
  window.location.href = "/login.html";
}

const userLabel = document.querySelector("[data-user-label]");
if (userLabel) {
  userLabel.textContent = localStorage.getItem("userId") || "usuario";
}
