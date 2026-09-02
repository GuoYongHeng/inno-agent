const userButton = document.getElementById("user-button");
const logoutButton = document.getElementById("logout-button");
const menu = document.getElementById("menu");
const aboutMenu = document.getElementById("about-menu");
const avatar = document.getElementById("avatar");
const displayName = document.getElementById("display-name");
const accountButton = document.querySelector('[data-action="account"]');
const officialSiteButton = document.querySelector('[data-action="official-site"]');
const aboutButton = document.querySelector('[data-action="about"]');

function setUser(user) {
  const name = typeof user?.username === "string" && user.username.trim()
    ? user.username.trim()
    : "用户";
  const initial = Array.from(name)[0]?.toUpperCase() || "U";

  avatar.textContent = initial;
  displayName.textContent = name;
}

function setMenuOpen(open) {
  menu.hidden = !open;
  aboutMenu.hidden = true;
  userButton.setAttribute("aria-expanded", String(open));
  window.userPanelAPI.setExpanded({ menu: open, about: false });
}

function closeMenus() {
  setMenuOpen(false);
}

userButton.addEventListener("click", () => {
  setMenuOpen(menu.hidden);
});

aboutButton.addEventListener("click", () => {
  const open = aboutMenu.hidden;
  aboutMenu.hidden = !open;
  window.userPanelAPI.setExpanded({ menu: true, about: open });
});

accountButton.addEventListener("click", () => {
  window.userPanelAPI.openAccount();
});

officialSiteButton.addEventListener("click", () => {
  window.userPanelAPI.openExternal("https://innoagent.innospark.cn/");
});

document.addEventListener("click", (event) => {
  if (!event.target.closest(".panel")) closeMenus();
});

logoutButton.addEventListener("click", async () => {
  logoutButton.disabled = true;
  logoutButton.textContent = "正在退出...";
  try {
    await window.userPanelAPI.logout();
  } catch {
    logoutButton.disabled = false;
    logoutButton.textContent = "退出登录";
  }
});

window.userPanelAPI.onUserUpdated(setUser);
window.userPanelAPI.onCloseMenu(closeMenus);
window.userPanelAPI.getCurrentUser().then(setUser).catch(() => setUser(null));
