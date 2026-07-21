(function () {
  let localScanTimer = null;
  let localChallenge = "";
  function selectedLoginRole($) {
    return $(".login-role-tabs [data-login-role].active")?.dataset.loginRole || "tenant";
  }

  function selectedScanMode($) {
    return $(".login-scan-tabs [data-scan-mode].active")?.dataset.scanMode || "local";
  }

  function bindPasswordLogin(context) {
    const { $, request, completeLogin, gateError } = context;
    $("#gatePasswordForm").addEventListener("submit", async (event) => {
      event.preventDefault();
      if (selectedLoginRole($) !== "platform") {
        gateError.textContent = "企业管理员请使用微信小程序扫码登录";
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

  function stopLocalScan(){if(localScanTimer){clearTimeout(localScanTimer);localScanTimer=null;}localChallenge="";}

  async function startLocalScan(context){
    const {$,request,completeLogin,gateError}=context;
    stopLocalScan();
    const hint=$("#gateLocalScanHint");const image=$("#gateLocalScanQr");const refresh=$("#gateLocalScanRefresh");
    if(!hint||!image||!refresh)return;
    hint.textContent="正在生成微信小程序登录码…";image.classList.add("hidden");refresh.disabled=true;gateError.textContent="";
    try{
      const result=await request("/admin/auth/local-scan/challenges",{method:"POST",auth:false});
      localChallenge=result.challenge_token;
      if(result.qr_code_data_url){image.src=result.qr_code_data_url;image.classList.remove("hidden");hint.textContent="请使用微信扫描，并在智云名片小程序中确认登录";}
      else{hint.textContent=`小程序码暂不可用，请在小程序中打开：${result.miniprogram_path}`;}
      const poll=async()=>{if(!localChallenge)return;try{const status=await request(`/admin/auth/local-scan/challenges/${encodeURIComponent(localChallenge)}`,{auth:false});if(status.status==="approved"){stopLocalScan();completeLogin(status.access_token,status.admin);return;}if(status.status==="expired"||status.status==="consumed"||status.status==="revoked"){stopLocalScan();hint.textContent="登录码已失效，请刷新后重试";refresh.disabled=false;return;}}catch(error){gateError.textContent=error.message||"登录状态查询失败";}localScanTimer=setTimeout(poll,2000);};
      localScanTimer=setTimeout(poll,1500);
    }catch(error){gateError.textContent=error.message||"微信登录码生成失败";hint.textContent="无法生成登录码";}
    finally{refresh.disabled=false;}
  }

  function bindLocalScanLogin(context){$("#gateLocalScanRefresh")?.addEventListener("click",()=>startLocalScan(context));}

  function bindLoginRoleUi(context) {
    const { $, $$, gateError } = context;
    const passwordForm = $("#gatePasswordForm");
    const scanSection = $(".login-scan-section");
    const localScanLoginBox = $("#localScanLoginBox");
    const wecomScanLoginBox = $("#wecomScanLoginBox");
    const accountLabel = $("#gateAccountLabel");
    const usernameInput = $("#gateUsername");
    const passwordInput = $("#gatePassword");
    const scanTabs = $$(".login-scan-tabs [data-scan-mode]");
    const roleCopy = {
      tenant: { label: "企业管理员", placeholder: "" },
      platform: { label: "平台账号", placeholder: "请输入平台账号" }
    };

    function resetGateError() {
      if (gateError && gateError.dataset.preserve !== "true") gateError.textContent = "";
      if (gateError) delete gateError.dataset.preserve;
    }

    function applyScanMode(mode) {
      const isWecom = mode === "wecom";
      scanTabs.forEach((tab) => {
        const active = tab.dataset.scanMode === mode;
        tab.classList.toggle("active", active);
        tab.setAttribute("aria-selected", active ? "true" : "false");
      });
      localScanLoginBox?.classList.toggle("hidden", isWecom);
      wecomScanLoginBox?.classList.toggle("hidden", !isWecom);
      if (isWecom) stopLocalScan(); else startLocalScan(context);
      resetGateError();
    }

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
      scanSection?.classList.toggle("hidden", isPlatform);
      if (isPlatform) stopLocalScan(); else applyScanMode(selectedScanMode($));
      resetGateError();
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

    scanTabs.forEach((tab) => {
      tab.addEventListener("click", () => applyScanMode(tab.dataset.scanMode));
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
      bindWecomScanLogin(context);
      bindLocalScanLogin(context);
      bindLoginRoleUi(context);
      bindPasswordVisibility(context);
      bindRememberToggle(context);
      bindLoginPolish(context);
    }
  };
})();
