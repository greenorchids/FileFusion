/*
 * Google sign-in via Google Identity Services.
 * The site is static, so the ID token is decoded client-side only to show the
 * user's profile and keep their conversion history separate per account.
 */
(function () {
  const STORAGE_KEY = "ff_user";
  const clientId = (window.FILEFUSION_CONFIG || {}).googleClientId || "";
  const listeners = [];

  function read() {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY));
    } catch {
      return null;
    }
  }

  function write(u) {
    try {
      u
        ? localStorage.setItem(STORAGE_KEY, JSON.stringify(u))
        : localStorage.removeItem(STORAGE_KEY);
    } catch {
      /* storage unavailable */
    }
  }

  let user = read();

  function decodeJwt(token) {
    const payload = token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
    const bytes = Uint8Array.from(atob(payload), (c) => c.charCodeAt(0));
    return JSON.parse(new TextDecoder().decode(bytes));
  }

  function emit() {
    listeners.forEach((fn) => fn(user));
  }

  function handleCredential(response) {
    const p = decodeJwt(response.credential);
    user = {
      id: p.sub,
      name: p.name || p.email,
      givenName: p.given_name || "",
      email: p.email,
      picture: p.picture || "",
    };
    write(user);
    emit();
  }

  const ready = new Promise((resolve) => {
    if (!clientId) return resolve(false);
    const script = document.createElement("script");
    script.src = "https://accounts.google.com/gsi/client";
    script.async = true;
    script.onload = () => {
      google.accounts.id.initialize({
        client_id: clientId,
        callback: handleCredential,
        cancel_on_tap_outside: true,
        itp_support: true,
        use_fedcm_for_prompt: true,
      });
      resolve(true);
    };
    script.onerror = () => resolve(false);
    document.head.appendChild(script);
  });

  window.FFAuth = {
    get user() {
      return user;
    },
    get enabled() {
      return Boolean(clientId);
    },
    ready,
    onChange(fn) {
      listeners.push(fn);
      fn(user);
    },
    async renderButton(el, options = {}) {
      if (!el || !(await ready)) {
        if (el) el.hidden = true;
        return false;
      }
      el.hidden = Boolean(user);
      google.accounts.id.renderButton(el, {
        theme: "outline",
        size: "large",
        shape: "pill",
        text: "continue_with",
        logo_alignment: "left",
        ...options,
      });
      return true;
    },
    async promptOneTap() {
      if (!user && (await ready)) google.accounts.id.prompt();
    },
    signOut() {
      if (window.google && google.accounts && google.accounts.id)
        google.accounts.id.disableAutoSelect();
      user = null;
      write(null);
      emit();
    },
  };
})();
