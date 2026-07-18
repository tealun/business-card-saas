(function () {
  function selectedLoginRole($) {
    return $(".login-role-tabs [data-login-role].active")?.dataset.loginRole || "tenant";
  }

  function bindPasswordLogin(context) {
    const { $, request, completeLogin, gateError } = context;
    $("#gatePasswordForm").addEventListener("submit", async (event) => {
      event.preventDefault();
      if (selectedLoginRole($) !== "platform") {
        gateError.textContent = "企业管理员请使用企业微信扫码登录";
        return;
      }
      const username = $("#gateUsername").value.trim();
      const password = $("#gatePassword").value;
      if (!username || !password) {
        gateError.textContent = "请输入账号和密码";
        return;
      }
      $("#gatePasswordLogin").disabled = true;
      try {
        const result = await request("/admin/auth/login", { method: "POST", auth: false, body: { username, password } });
        completeLogin(result.access_token, result.admin);
      } catch (error) {
        gateError.textContent = error.message || "登录失败";
      } finally {
        $("#gatePasswordLogin").disabled = false;
      }
    });
  }

  function bindWecomCodeLogin(context) {
    const { $, request, run, completeLogin, gateError } = context;
    $("#gateLogin").addEventListener("click", async () => {
      const code = $("#gateLoginCode").value.trim();
      const claimToken = $("#gateClaimToken").value.trim();
      if (!code) {
        gateError.textContent = "请输入企业微信登录 Code";
        return;
      }
      const body = { code };
      if (claimToken) body.claim_token = claimToken;
      try {
        const result = await run("企业微信登录", () =>
          request("/admin/auth/qy-login", { method: "POST", auth: false, body })
        );
        completeLogin(result.access_token, result.admin);
      } catch (error) {
        gateError.textContent = error.message || "登录失败";
      }
    });
  }

  function bindWecomScanLogin(context) {
    const { $, request, fallbackWecomLoginUrl, gateError } = context;
    $("#gateWecomScanLogin").addEventListener("click", async () => {
      const button = $("#gateWecomScanLogin");
      button.disabled = true;
      gateError.textContent = "";
      try {
        const config = await request("/admin/auth/wecom/login-config", { auth: false });
        window.location.assign(config.login_url || fallbackWecomLoginUrl(config));
      } catch (error) {
        gateError.textContent = error.message || "企业微信扫码登录暂不可用";
        button.disabled = false;
      }
    });
  }

  function bindTokenLogin(context) {
    const { $, request, completeLogin, gateError } = context;
    $("#gateTokenLogin").addEventListener("click", async () => {
      const token = $("#gateTokenInput").value.trim();
      if (!token) {
        gateError.textContent = "请输入访问令牌";
        return;
      }
      try {
        const result = await request("/admin/session/me", { token });
        completeLogin(token, result.admin);
      } catch (error) {
        gateError.textContent = error.message || "令牌无效";
      }
    });
  }

  function bindLoginRoleUi(context) {
    const { $, $$, gateError } = context;
    const passwordForm = $("#gatePasswordForm");
    const wecomScanLoginBox = $("#wecomScanLoginBox");
    const loginAlt = $(".login-alt");
    const accountLabel = $("#gateAccountLabel");
    const usernameInput = $("#gateUsername");
    const passwordInput = $("#gatePassword");
    const roleCopy = {
      tenant: { label: "企业管理员", placeholder: "" },
      platform: { label: "平台账号", placeholder: "请输入平台账号" }
    };

    function applyLoginRole(role) {
      const isPlatform = role === "platform";
      const copy = roleCopy[role] || roleCopy.tenant;
      if (accountLabel) accountLabel.textContent = copy.label;
      if (usernameInput) {
        usernameInput.placeholder = copy.placeholder;
        usernameInput.disabled = !isPlatform;
        if (!isPlatform) usernameInput.value = "";
      }
      if (passwordInput) {
        passwordInput.disabled = !isPlatform;
        if (!isPlatform) passwordInput.value = "";
      }
      passwordForm?.classList.toggle("hidden", !isPlatform);
      wecomScanLoginBox?.classList.toggle("hidden", isPlatform);
      loginAlt?.classList.toggle("hidden", isPlatform);
      if (gateError && gateError.dataset.preserve !== "true") gateError.textContent = "";
      if (gateError) delete gateError.dataset.preserve;
    }

    $$("[data-login-role]").forEach((tab) => {
      tab.addEventListener("click", () => {
        $$("[data-login-role]").forEach((node) => {
          const active = node === tab;
          node.classList.toggle("active", active);
          node.setAttribute("aria-selected", active ? "true" : "false");
        });
        applyLoginRole(tab.dataset.loginRole);
      });
    });
    applyLoginRole(selectedLoginRole($));
  }

  function bindPasswordVisibility(context) {
    const { $ } = context;
    const pwdInput = $("#gatePassword");
    const pwdToggle = $("#gatePasswordToggle");
    if (!pwdInput || !pwdToggle) return;

    pwdToggle.addEventListener("click", () => {
      const visible = pwdInput.type === "password";
      pwdInput.type = visible ? "text" : "password";
      pwdToggle.setAttribute("aria-label", visible ? "隐藏密码" : "显示密码");
      $("#gatePwdEyeOpen")?.classList.toggle("hidden", visible);
      $("#gatePwdEyeClosed")?.classList.toggle("hidden", !visible);
    });
  }

  function bindRememberToggle(context) {
    const { $ } = context;
    const remember = $("#gateRemember");
    if (!remember) return;
    remember.addEventListener("click", () => {
      remember.setAttribute("aria-pressed", remember.getAttribute("aria-pressed") === "true" ? "false" : "true");
    });
  }

  function bindLoginPolish(context) {
    const { $, gateError, topbarAdmin } = context;
    const submitButton = $("#gatePasswordLogin");
    if (submitButton) {
      const label = submitButton.querySelector("span:last-child");
      new MutationObserver(() => {
        if (label) label.textContent = submitButton.disabled ? "登录中..." : "登录";
      }).observe(submitButton, { attributes: true, attributeFilter: ["disabled"] });
    }

    const loginForm = $(".login-form");
    if (loginForm && gateError) {
      new MutationObserver(() => {
        loginForm.classList.toggle("has-error", Boolean(gateError.textContent.trim()));
      }).observe(gateError, { childList: true, characterData: true, subtree: true });
    }

    const avatar = $("#accountAvatar");
    if (avatar && topbarAdmin) {
      const render = () => {
        const text = (topbarAdmin.textContent || "").trim();
        avatar.textContent = text && text !== "未登录" ? text.charAt(0) : "·";
      };
      new MutationObserver(render).observe(topbarAdmin, { childList: true, characterData: true, subtree: true });
      render();
    }
  }

  window.AdminLogin = {
    bind(context) {
      bindPasswordLogin(context);
      bindWecomCodeLogin(context);
      bindWecomScanLogin(context);
      bindTokenLogin(context);
      bindLoginRoleUi(context);
      bindPasswordVisibility(context);
      bindRememberToggle(context);
      bindLoginPolish(context);
    }
  };
})();
