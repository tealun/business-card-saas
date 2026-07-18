(function () {
  const PAGE_PARTIALS = [
    "tenant-dashboard",
    "tenant-members",
    "tenant-company",
    "tenant-design",
    "tenant-sync",
    "tenant-analytics",
    "tenant-billing",
    "tenant-admins",
    "tenant-audit",
    "platform-dashboard",
    "platform-tenants",
    "platform-features",
    "platform-ops",
    "platform-wecom",
    "platform-commercial",
    "platform-audit",
    "platform-accounts",
    "dev-tools"
  ];

  const hosts = Array.from(document.querySelectorAll("[data-admin-partial]"));
  const pageHost = document.querySelector("[data-admin-page-partials]");

  function loadPartial(partialPath) {
    const request = new XMLHttpRequest();
    request.open("GET", partialPath, false);
    request.send(null);

    if ((request.status >= 200 && request.status < 300) || (request.status === 0 && request.responseText)) {
      return request.responseText;
    }

    throw new Error(`Failed to load admin partial ${partialPath}: HTTP ${request.status}`);
  }

  if (pageHost) {
    pageHost.innerHTML = PAGE_PARTIALS.map((page) => loadPartial(`./partials/pages/${page}.html`)).join("\n");
  }

  for (const host of hosts) {
    const partialPath = host.getAttribute("data-admin-partial");
    if (partialPath) host.innerHTML = loadPartial(partialPath);
  }
})();
