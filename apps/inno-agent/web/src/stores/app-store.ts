import { EventEmitter } from "./event-emitter.js";

export type RightPanelTab = "notebook" | "preview" | "profile" | "skills" | "jobs";
export type SidebarSection = "chat" | "wiki" | "jobs" | "settings";
export type WorkspaceMode = "collapsed" | "quarter" | "half" | "full";
export type SettingsTab = "general" | "models" | "memory" | "integrations" | "channels" | "about";

interface AppStoreEvents {
	change: void;
}

const VALID_TABS: RightPanelTab[] = ["notebook", "preview", "profile", "skills", "jobs"];
// Legacy values mapped to current ones.
const TAB_ALIASES: Record<string, RightPanelTab> = {
	wiki: "notebook",
	graph: "notebook",
};

class AppStoreImpl extends EventEmitter<AppStoreEvents> {
	rightPanelTab: RightPanelTab = getInitialRightPanelTab();
	sidebarSection: SidebarSection = "chat";
	sidebarCollapsed = false;
	sidebarWidth = getInitialSidebarWidth();
	workspaceMode: WorkspaceMode = "collapsed";
	workspaceWidth = getInitialWorkspaceWidth();
	settingsOpen = getInitialSettingsOpen();
	activeSettingsTab: SettingsTab = "general";

	openSettings(tab: SettingsTab = "general") {
		this.settingsOpen = true;
		this.activeSettingsTab = tab;
		this.emit("change", undefined);
		// 通知父页面（auth-service 沙箱宿主）隐藏其左下角用户浮层，避免覆盖设置页
		notifyParentSettings(true);
		notifyElectronSettings(true);
	}

	closeSettings() {
		if (!this.settingsOpen) return;
		this.settingsOpen = false;
		this.emit("change", undefined);
		notifyParentSettings(false);
		notifyElectronSettings(false);
	}

	setSettingsTab(tab: SettingsTab) {
		if (this.activeSettingsTab === tab) return;
		this.activeSettingsTab = tab;
		this.emit("change", undefined);
	}

	setRightPanelTab(tab: RightPanelTab) {
		if (this.rightPanelTab === tab) return;
		this.rightPanelTab = tab;
		this.emit("change", undefined);
	}

	setSidebarSection(section: SidebarSection) {
		this.sidebarSection = section;
		this.emit("change", undefined);
	}

	toggleSidebar() {
		this.sidebarCollapsed = !this.sidebarCollapsed;
		this.emit("change", undefined);
	}

	setSidebarCollapsed(collapsed: boolean) {
		this.sidebarCollapsed = collapsed;
		this.emit("change", undefined);
	}

	setSidebarWidth(width: number) {
		const next = Math.max(280, Math.min(520, Math.round(width)));
		if (this.sidebarWidth === next) return;
		this.sidebarWidth = next;
		if (typeof window !== "undefined") {
			window.localStorage.setItem("inno.sidebarWidth", String(this.sidebarWidth));
		}
		this.emit("change", undefined);
	}

	setWorkspaceMode(mode: WorkspaceMode) {
		if (this.workspaceMode === mode) return;
		this.workspaceMode = mode;
		this.emit("change", undefined);
	}

	setWorkspaceWidth(width: number) {
		const next = Math.max(240, Math.min(920, Math.round(width)));
		if (this.workspaceWidth === next) return;
		this.workspaceWidth = next;
		if (typeof window !== "undefined") {
			window.localStorage.setItem("inno.workspaceWidth", String(this.workspaceWidth));
		}
		this.emit("change", undefined);
	}

	toggleWorkspace() {
		this.workspaceMode = this.workspaceMode === "collapsed" ? "half" : "collapsed";
		this.emit("change", undefined);
	}
}

function getInitialWorkspaceWidth(): number {
	if (typeof window === "undefined") return 520;
	const saved = Number(window.localStorage.getItem("inno.workspaceWidth"));
	return Number.isFinite(saved) && saved > 0 ? Math.max(320, Math.min(920, Math.round(saved))) : 520;
}

function getInitialSidebarWidth(): number {
	if (typeof window === "undefined") return 330;
	const saved = Number(window.localStorage.getItem("inno.sidebarWidth"));
	return Number.isFinite(saved) && saved > 0 ? Math.max(280, Math.min(520, Math.round(saved))) : 330;
}

function getInitialRightPanelTab(): RightPanelTab {
	if (typeof window === "undefined") return "preview";
	const tab = new URLSearchParams(window.location.search).get("tab");
	if (tab && TAB_ALIASES[tab]) return TAB_ALIASES[tab];
	if (tab && (VALID_TABS as string[]).includes(tab)) return tab as RightPanelTab;
	return "preview";
}

function getInitialSettingsOpen(): boolean {
	if (typeof window === "undefined") return false;
	return new URLSearchParams(window.location.search).get("tab") === "settings";
}

/** 嵌入在跨域 iframe 中时，通知父页面设置页的打开/关闭状态 */
function notifyParentSettings(open: boolean) {
	if (typeof window !== "undefined" && window.parent && window.parent !== window) {
		window.parent.postMessage({ type: "inno-settings", open }, "*");
	}
}

function notifyElectronSettings(open: boolean) {
	if (typeof window === "undefined") return;

	const electronAPI = (window as Window & {
		electronAPI?: { setSettingsOverlayOpen?: (open: boolean) => void };
	}).electronAPI;
	electronAPI?.setSettingsOverlayOpen?.(open);
}

export const appStore = new AppStoreImpl();
