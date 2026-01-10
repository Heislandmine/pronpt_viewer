import { contextBridge } from "electron";

contextBridge.exposeInMainWorld("appInfo", {
  version: process.versions.electron
});
