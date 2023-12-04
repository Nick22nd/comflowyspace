
export interface ComfyElectronApi {
  name: string;
  version: number;
  windowTabManager: {
    onWindowTabsChange: (
      callback: (tabsData: {
        tabs: WindowTab[];
        active: number;
      }) => void
    ) => () => void;
    openNewTab: (config: Partial<WindowTab>) => Promise<any>;
    closeTab: (id: number) => Promise<void>;
    swtichTab: (id: number) => Promise<void>;
    replaceTab: (id: number, newTab: WindowTab) => Promise<void>;
    getTabsData: () => Promise<{
      tabs: WindowTab[];
      active: number;
    }>;
  };
}

export interface WindowTab {
  url: string, 
  name: string, 
  type: "DOC" | "MANGEMENT" | "THIRD_PARTY", 
  id: number
}

let comfyElectronApi: ComfyElectronApi;
if (typeof window !== "undefined") {
  comfyElectronApi = (window as any).comfyElectronApi as ComfyElectronApi;
}

export {
  comfyElectronApi
}

export function openTabPage(tab: WindowTab) {
  if (comfyElectronApi) {
    comfyElectronApi.windowTabManager.openNewTab(tab);
  } else {
    window.open(tab.url, '_blank');
  }
}