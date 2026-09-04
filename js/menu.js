// Three-dot (More) menu, injected into the topbar on every page.
import { ICONS } from "./ui.js?v=13";
import { toggleTheme } from "./theme.js?v=13";

export function initMenu() {
  const actions = document.querySelector(".topbar-actions");
  if (!actions) return;

  const wrap = document.createElement("div");
  wrap.className = "menu-wrap";

  const btn = document.createElement("button");
  btn.className = "icon-btn menu-btn";
  btn.setAttribute("aria-label", "More options");
  btn.innerHTML = ICONS.dots;

  const dropdown = document.createElement("div");
  dropdown.className = "menu-dropdown hidden";
  dropdown.innerHTML = `
    <a href="holidays.html" class="menu-item">${ICONS.calendar}<span>Holiday Requests</span></a>
    <a href="settings.html" class="menu-item">${ICONS.settings}<span>Settings</span></a>
    <a href="settings.html#notifications" class="menu-item">${ICONS.info}<span>Notification Settings</span></a>
    <button type="button" class="menu-item" id="menu-theme">${ICONS.moon}<span>Dark / Light Mode</span></button>
  `;

  wrap.appendChild(btn);
  wrap.appendChild(dropdown);
  actions.appendChild(wrap);

  btn.addEventListener("click", (e) => {
    e.stopPropagation();
    dropdown.classList.toggle("hidden");
  });
  document.addEventListener("click", () => dropdown.classList.add("hidden"));

  dropdown.querySelector("#menu-theme").addEventListener("click", () => {
    toggleTheme();
    dropdown.classList.add("hidden");
  });
}
